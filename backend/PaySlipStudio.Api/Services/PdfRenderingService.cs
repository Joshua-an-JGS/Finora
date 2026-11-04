using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
namespace PaySlipStudio.Api.Services;
public class PdfRenderingService
{
    private readonly ApplicationDbContext _db;
    private readonly PayslipDocumentResolver _resolver;
    private readonly AuditService _audit;
    private readonly string _pdfVaultPath;
    static PdfRenderingService()
    {
        QuestPDF.Settings.License = LicenseType.Community;
        RegisterFigtreeFont();
    }
    private static void RegisterFigtreeFont()
    {
        try
        {
            var fontDirs = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "Fonts"),
                Path.Combine(AppContext.BaseDirectory, "..", "..", "Fonts"),
                @"g:\UAV\PAY SLIP\backend\PaySlipStudio.Api\Fonts"
            };
            var dir = fontDirs.FirstOrDefault(Directory.Exists);
            if (dir != null)
            {
                foreach (var file in Directory.GetFiles(dir, "*.ttf"))
                {
                    using var stream = File.OpenRead(file);
                    QuestPDF.Drawing.FontManager.RegisterFontFromStream(stream);
                }
            }
        }
        catch { }
    }
    public PdfRenderingService(
        ApplicationDbContext db,
        PayslipDocumentResolver resolver,
        AuditService audit,
        IConfiguration config,
        IWebHostEnvironment env)
    {
        _db = db;
        _resolver = resolver;
        _audit = audit;
        var configuredPath = config["Storage:RootPath"] ?? "Storage/PrivateVault";
        var root = Path.IsPathRooted(configuredPath)
            ? configuredPath
            : Path.Combine(env.ContentRootPath, configuredPath);
        _pdfVaultPath = Path.Combine(root, "Pdfs");
        Directory.CreateDirectory(_pdfVaultPath);
    }
    private static string SafeHex(string? candidate, string fallback)
    {
        if (string.IsNullOrWhiteSpace(candidate)) return fallback;
        var t = candidate.Trim();
        if (t.Length == 7 && t[0] == '#' && t[1..].All(Uri.IsHexDigit))
            return t;
        return fallback;
    }
    public byte[] RenderPdfBytes(PayslipDocumentModel model)
    {
        var cfg = model.StyleConfig;
        string orangeHex = SafeHex(cfg.PrimaryAccentColor, "#F47721");
        string textPrimaryHex = SafeHex(cfg.PrimaryTextColor, "#1F2937");
        string navyHex = textPrimaryHex;
        string bgHex = SafeHex(cfg.DocumentBackgroundColor, "#FFFFFF");
        string subtleOrangeHex = SafeHex(cfg.SubtleAccentSurfaceColor, "#FFF3E8");
        string borderHex = SafeHex(cfg.BorderColor, "#E5E7EB");
        string textSecondaryHex = "#6B7280";
        float baseFontPt = Math.Clamp(cfg.BaseFontSizePt, 8, 13);
        float marginMm = Math.Clamp(cfg.PageMarginMm, 8, 28);
        float rowPadPt = Math.Clamp(cfg.RowVerticalPaddingPx, 3, 16) * 0.75f;
        float borderWeightPt = cfg.ShowTableBorders ? Math.Clamp(cfg.BorderLineWeightPx, 1, 3) * 0.75f : 0f;
        var sectionOrder = cfg.SectionOrder != null && cfg.SectionOrder.Count > 0
            ? new List<string>(cfg.SectionOrder)
            : new List<string>
            {
                "Header",
                "TitleBanner",
                "EmployeeDetails",
                "SalaryTables",
                "CustomTables",
                "CustomFields",
                "TotalsSummary",
                "NetSalaryBanner",
                "SignatureBlock",
                "Footer"
            };

        // Defensively normalize section order so CustomTables ALWAYS renders before TotalsSummary & NetSalaryBanner
        int customIdx = sectionOrder.IndexOf("CustomTables");
        int totalsIdx = sectionOrder.IndexOf("TotalsSummary");
        int netIdx = sectionOrder.IndexOf("NetSalaryBanner");
        int salaryIdx = sectionOrder.IndexOf("SalaryTables");

        if (customIdx != -1)
        {
            if ((totalsIdx != -1 && customIdx > totalsIdx) || (netIdx != -1 && customIdx > netIdx))
            {
                sectionOrder.RemoveAt(customIdx);
                int insertIdx = salaryIdx != -1 ? salaryIdx + 1 : (totalsIdx != -1 ? totalsIdx : 0);
                sectionOrder.Insert(insertIdx, "CustomTables");
            }
        }
        else if (!sectionOrder.Any(k => k.StartsWith("CustomTable_")))
        {
            if (salaryIdx != -1)
                sectionOrder.Insert(salaryIdx + 1, "CustomTables");
            else if (totalsIdx != -1)
                sectionOrder.Insert(totalsIdx, "CustomTables");
            else if (netIdx != -1)
                sectionOrder.Insert(netIdx, "CustomTables");
            else
                sectionOrder.Add("CustomTables");
        }
        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(marginMm, Unit.Millimetre);
                page.PageColor(bgHex);
                float sectionGapPt = (cfg.SectionSpacingPx > 0 ? cfg.SectionSpacingPx : 16) * 0.75f;
                page.DefaultTextStyle(x => x.FontFamily("Figtree").FontSize(baseFontPt).FontColor(textPrimaryHex));
                page.Content().Column(col =>
                {
                    col.Spacing(sectionGapPt);
                    var renderedCustomTableIds = new HashSet<string>();
                    foreach (var sectionKey in sectionOrder)
                    {
                        switch (sectionKey)
                        {
                            case "Header":
                                col.Item().Element(c => ComposeOrganizationHeader(c, model, cfg, orangeHex, navyHex, textSecondaryHex, baseFontPt));
                                break;
                            case "TitleBanner":
                                col.Item().Element(c => ComposeTitleBanner(c, model, cfg, orangeHex, navyHex, subtleOrangeHex, baseFontPt));
                                break;
                            case "EmployeeDetails":
                                col.Item().Element(c => ComposeEmployeeDetails(c, model, cfg, navyHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt));
                                break;
                            case "SalaryTables":
                                col.Item().Element(c => ComposeSalaryTables(c, model, cfg, orangeHex, navyHex, borderHex, textPrimaryHex, baseFontPt, rowPadPt, borderWeightPt));
                                break;
                            case "CustomFields":
                                if (cfg.ShowCustomTextFieldsSection && model.VisibleCustomTextFields.Count > 0)
                                {
                                    col.Item().Element(c => ComposeCustomTextFields(c, model, cfg, navyHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt));
                                }
                                break;
                            case "CustomTables":
                                if (model.CustomTables != null)
                                {
                                    var unrendered = model.CustomTables.Where(t => t.IsVisible && !renderedCustomTableIds.Contains(t.Id)).ToList();
                                    if (unrendered.Count > 0)
                                    {
                                        foreach (var tbl in unrendered) renderedCustomTableIds.Add(tbl.Id);
                                        col.Item().Element(c => ComposeCustomTablesGroup(c, unrendered, cfg, orangeHex, navyHex, subtleOrangeHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt, rowPadPt, borderWeightPt));
                                    }
                                }
                                break;
                            case "TotalsSummary":
                                if (model.CustomTables != null)
                                {
                                    var unrendered = model.CustomTables.Where(t => t.IsVisible && !renderedCustomTableIds.Contains(t.Id)).ToList();
                                    if (unrendered.Count > 0)
                                    {
                                        foreach (var tbl in unrendered) renderedCustomTableIds.Add(tbl.Id);
                                        col.Item().Element(c => ComposeCustomTablesGroup(c, unrendered, cfg, orangeHex, navyHex, subtleOrangeHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt, rowPadPt, borderWeightPt));
                                    }
                                }
                                if (model.GrossSalary.HasValue || model.TotalDeductions.HasValue)
                                {
                                    col.Item().Element(c => ComposeSuppliedTotals(c, model, cfg, navyHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt));
                                }
                                break;
                            case "NetSalaryBanner":
                                if (model.NetSalary.HasValue)
                                {
                                    col.Item().Element(c => ComposeNetSalaryBanner(c, model, cfg, orangeHex, navyHex, subtleOrangeHex, textPrimaryHex, textSecondaryHex, baseFontPt));
                                }
                                break;
                            case "SignatureBlock":
                                if (cfg.ShowSignatureArea)
                                {
                                    col.Item().Element(c => ComposeSignatureArea(c, cfg, navyHex, borderHex, textSecondaryHex, baseFontPt));
                                }
                                break;
                            case "Footer":
                                if (cfg.ShowFooterDisclaimer || !string.IsNullOrWhiteSpace(model.CustomFooterNotes))
                                {
                                    col.Item().Element(c => ComposeFooterNotes(c, model, cfg, borderHex, textSecondaryHex, baseFontPt));
                                }
                                break;
                            default:
                                if (sectionKey.StartsWith("CustomTable_") && model.CustomTables != null)
                                {
                                    var tblId = sectionKey.Substring("CustomTable_".Length);
                                    var tbl = model.CustomTables.FirstOrDefault(t => t.Id == tblId && t.IsVisible);
                                    if (tbl != null && renderedCustomTableIds.Add(tbl.Id))
                                    {
                                        col.Item().Element(c => ComposeCustomTable(c, tbl, cfg, orangeHex, navyHex, subtleOrangeHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt, rowPadPt, borderWeightPt));
                                    }
                                }
                                break;
                        }
                    }
                    if (model.CustomTables != null)
                    {
                        var unrendered = model.CustomTables.Where(t => t.IsVisible && !renderedCustomTableIds.Contains(t.Id)).ToList();
                        if (unrendered.Count > 0)
                        {
                            foreach (var tbl in unrendered) renderedCustomTableIds.Add(tbl.Id);
                            col.Item().Element(c => ComposeCustomTablesGroup(c, unrendered, cfg, orangeHex, navyHex, subtleOrangeHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt, rowPadPt, borderWeightPt));
                        }
                    }
                });
                page.Footer().Row(r =>
                {
                    r.RelativeItem().Text($"{model.EmployeeCode} · {model.PeriodLabel}")
                        .FontSize(baseFontPt - 2f)
                        .FontColor(textSecondaryHex);
                    r.RelativeItem().AlignRight().Text(txt =>
                    {
                        txt.DefaultTextStyle(s => s.FontSize(baseFontPt - 2f).FontColor(textSecondaryHex));
                        txt.Span("Page ");
                        txt.CurrentPageNumber();
                        txt.Span(" of ");
                        txt.TotalPages();
                    });
                });
            });
        });
        return doc.GeneratePdf();
    }
    public async Task<(GeneratedPayslipDocument DocumentRecord, byte[] PdfBytes)> GenerateAndPersistPdfAsync(
        Guid payrollRecordId,
        string actorUserId,
        string actorUserName,
        string actorRole,
        PayslipTemplateConfig? directConfig = null)
    {
        var record = await _db.PayrollRecords
            .Include(r => r.Employee)
            .Include(r => r.PayrollPeriod)
            .Include(r => r.Components)
            .Include(r => r.GeneratedDocuments)
            .FirstOrDefaultAsync(r => r.Id == payrollRecordId)
            ?? throw new KeyNotFoundException("Payroll record not found.");
        var companySettings = await _db.CompanySettings.FirstOrDefaultAsync() ?? new CompanySettings();
        PayslipTemplate? template = null;
        if (record.SelectedTemplateId.HasValue)
        {
            template = await _db.PayslipTemplates.FirstOrDefaultAsync(t => t.Id == record.SelectedTemplateId.Value);
        }
        template ??= await _db.PayslipTemplates.FirstOrDefaultAsync(t => t.IsDefault && !t.IsArchived);
        var resolvedModel = _resolver.ResolveDocument(record, companySettings, template, directConfig);
        var pdfBytes = RenderPdfBytes(resolvedModel);
        var sha256 = Convert.ToHexStringLower(SHA256.HashData(pdfBytes));
        int nextVer = record.GeneratedDocuments.Count + 1;
        string periodSlug = $"{resolvedModel.PayrollYear}{resolvedModel.PayrollMonth:D2}";
        string safeEmpCode = SanitizeFileNameSegment(resolvedModel.EmployeeCode);
        string docCode = $"PS-{periodSlug}-{safeEmpCode}-V{nextVer}";
        string fileName = $"Payslip_{safeEmpCode}_{resolvedModel.PeriodLabel.Replace(' ', '_')}.pdf";
        string storedFileName = $"{docCode}_{Guid.NewGuid():N}.pdf";
        string storedPath = Path.Combine(_pdfVaultPath, storedFileName);
        await File.WriteAllBytesAsync(storedPath, pdfBytes);
        var docEntity = new GeneratedPayslipDocument
        {
            DocumentVersionCode = docCode,
            PayrollRecordId = record.Id,
            EmployeeId = record.EmployeeId,
            PayrollPeriodId = record.PayrollPeriodId,
            TemplateId = template?.Id,
            TemplateVersion = template?.Version ?? 1,
            FileName = fileName,
            StoredFilePath = storedPath,
            FileSizeBytes = pdfBytes.Length,
            Sha256Hash = sha256,
            RenderedDocumentModelJson = JsonSerializer.Serialize(resolvedModel),
            GeneratedByUserId = actorUserId,
            GeneratedByUserName = actorUserName,
            GeneratedAtUtc = DateTime.UtcNow
        };
        _db.GeneratedPayslipDocuments.Add(docEntity);
        if (record.Status != "Sent")
        {
            record.Status = "PdfGenerated";
            record.UpdatedAtUtc = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(
            actorUserId,
            actorUserName,
            actorRole,
            "Pdf.Generated",
            "GeneratedPayslipDocument",
            docEntity.Id.ToString(),
            $"Generated PDF '{docEntity.FileName}' ({docEntity.DocumentVersionCode}) for {resolvedModel.EmployeeName} ({resolvedModel.EmployeeCode}) — {resolvedModel.PeriodLabel}.");
        return (docEntity, pdfBytes);
    }
    private static void ComposeOrganizationHeader(
        IContainer container,
        PayslipDocumentModel model,
        PayslipTemplateConfig cfg,
        string orangeHex,
        string navyHex,
        string textSecondaryHex,
        float baseFontPt)
    {
        container.Column(col =>
        {
            if (cfg.HeaderAlignment == "Split")
            {
                col.Item().Row(row =>
                {
                    row.RelativeItem(58).AlignTop().Row(leftRow =>
                    {
                        if (cfg.ShowLogo)
                        {
                            leftRow.ConstantItem(56).AlignTop().Column(logoCol =>
                            {
                                var logoBytes = TryDecodeDataUrlImage(model.LogoDataUrl);
                                if (logoBytes != null)
                                {
                                    logoCol.Item().MaxHeight(cfg.LogoHeightPx).Image(logoBytes).FitArea();
                                }
                                else
                                {
                                    string fallbackText = !string.IsNullOrWhiteSpace(model.CompanyName)
                                        ? model.CompanyName.Substring(0, Math.Min(5, model.CompanyName.Length)).ToUpperInvariant()
                                        : "CORP";
                                    logoCol.Item().Width(44).Height(44)
                                        .Background(navyHex)
                                        .Border(2).BorderColor(orangeHex)
                                        .AlignCenter().AlignMiddle()
                                        .Text(fallbackText).FontSize(9).Bold().FontColor("#FFFFFF");
                                }
                            });
                        }
                        leftRow.RelativeItem().PaddingLeft(cfg.ShowLogo ? 10 : 0).Column(infoCol =>
                        {
                            float compNameFontSize = cfg.CompanyNameFontSizePt > 0 ? cfg.CompanyNameFontSizePt : baseFontPt + 3.5f;
                            infoCol.Item().Text(model.CompanyName)
                                .FontSize(compNameFontSize)
                                .Bold()
                                .FontColor(navyHex);
                            if (cfg.ShowCompanySubtitle && !string.IsNullOrWhiteSpace(model.CompanySubtitle))
                            {
                                infoCol.Item().PaddingTop(2).Text(model.CompanySubtitle)
                                    .FontSize(baseFontPt - 0.5f)
                                    .SemiBold()
                                    .FontColor(orangeHex);
                            }
                            if (cfg.ShowAuthorizedIdentifiers && !string.IsNullOrWhiteSpace(model.AuthorizedIdentifiers))
                            {
                                infoCol.Item().PaddingTop(2).Text(model.AuthorizedIdentifiers)
                                    .FontSize(baseFontPt - 1.5f)
                                    .FontColor(textSecondaryHex);
                            }
                        });
                    });
                    row.RelativeItem(42).AlignTop().AlignRight().Column(rightCol =>
                    {
                        if (cfg.ShowCompanyAddress && !string.IsNullOrWhiteSpace(model.CompanyAddress))
                        {
                            rightCol.Item().AlignRight().Text(model.CompanyAddress)
                                .FontSize(baseFontPt - 1.5f)
                                .FontColor(textSecondaryHex);
                        }
                        var contactParts = new List<string>();
                        if (cfg.ShowCompanyContact && !string.IsNullOrWhiteSpace(model.CompanyEmail))
                            contactParts.Add(model.CompanyEmail.Trim());
                        if (cfg.ShowCompanyContact && !string.IsNullOrWhiteSpace(model.CompanyPhone) &&
                            (string.IsNullOrWhiteSpace(model.CompanyEmail) || !model.CompanyEmail.Contains(model.CompanyPhone.Trim(), StringComparison.OrdinalIgnoreCase)))
                            contactParts.Add(model.CompanyPhone.Trim());
                        if (cfg.ShowCompanyWebsite && !string.IsNullOrWhiteSpace(model.CompanyWebsite) &&
                            (string.IsNullOrWhiteSpace(model.CompanyEmail) || !model.CompanyEmail.Contains(model.CompanyWebsite.Trim(), StringComparison.OrdinalIgnoreCase)))
                            contactParts.Add(model.CompanyWebsite.Trim());
                        if (contactParts.Count > 0)
                        {
                            if (contactParts.Count <= 2)
                            {
                                string safeContact = string.Join("  ·  ", contactParts);
                                rightCol.Item().AlignRight().PaddingTop(2).Text(safeContact)
                                    .FontSize(baseFontPt - 1.5f)
                                    .FontColor(textSecondaryHex);
                            }
                            else
                            {
                                string line1 = string.Join("  ·  ", contactParts.Take(2));
                                string line2 = string.Join("  ·  ", contactParts.Skip(2));
                                rightCol.Item().AlignRight().PaddingTop(2).Text(line1)
                                    .FontSize(baseFontPt - 1.5f)
                                    .FontColor(textSecondaryHex);
                                rightCol.Item().AlignRight().PaddingTop(1).Text(line2)
                                    .FontSize(baseFontPt - 1.5f)
                                    .FontColor(textSecondaryHex);
                            }
                        }
                    });
                });
            }
            else
            {
                col.Item().Row(row =>
                {
                    if (cfg.ShowLogo)
                    {
                        row.ConstantItem(64).AlignMiddle().Column(logoCol =>
                        {
                            var logoBytes = TryDecodeDataUrlImage(model.LogoDataUrl);
                            if (logoBytes != null)
                            {
                                logoCol.Item().MaxHeight(cfg.LogoHeightPx).Image(logoBytes).FitArea();
                            }
                            else
                            {
                                string fallbackText = !string.IsNullOrWhiteSpace(model.CompanyName)
                                    ? model.CompanyName.Substring(0, Math.Min(5, model.CompanyName.Length)).ToUpperInvariant()
                                    : "CORP";
                                logoCol.Item().Width(46).Height(46)
                                    .Background(navyHex)
                                    .Border(2).BorderColor(orangeHex)
                                    .AlignCenter().AlignMiddle()
                                    .Text(fallbackText).FontSize(9).Bold().FontColor("#FFFFFF");
                            }
                        });
                    }
                    row.RelativeItem().Column(infoCol =>
                    {
                        var align = cfg.HeaderAlignment == "Center";
                        var titleItem = align ? infoCol.Item().AlignCenter() : infoCol.Item();
                        float compNameFontSize = cfg.CompanyNameFontSizePt > 0 ? cfg.CompanyNameFontSizePt : baseFontPt + 4f;
                        titleItem.Text(model.CompanyName)
                            .FontSize(compNameFontSize)
                            .Bold()
                            .FontColor(navyHex);
                        if (cfg.ShowCompanySubtitle && !string.IsNullOrWhiteSpace(model.CompanySubtitle))
                        {
                            var subItem = align ? infoCol.Item().AlignCenter() : infoCol.Item();
                            subItem.PaddingTop(1).Text(model.CompanySubtitle)
                                .FontSize(baseFontPt - 0.5f)
                                .SemiBold()
                                .FontColor(orangeHex);
                        }
                        if (cfg.ShowCompanyAddress && !string.IsNullOrWhiteSpace(model.CompanyAddress))
                        {
                            var addrItem = align ? infoCol.Item().AlignCenter() : infoCol.Item();
                            addrItem.PaddingTop(2).Text(model.CompanyAddress)
                                .FontSize(baseFontPt - 1.5f)
                                .FontColor(textSecondaryHex);
                        }
                        var contactParts = new List<string>();
                        if (cfg.ShowCompanyContact && !string.IsNullOrWhiteSpace(model.CompanyEmail))
                            contactParts.Add(model.CompanyEmail.Trim());
                        if (cfg.ShowCompanyContact && !string.IsNullOrWhiteSpace(model.CompanyPhone) &&
                            (string.IsNullOrWhiteSpace(model.CompanyEmail) || !model.CompanyEmail.Contains(model.CompanyPhone.Trim(), StringComparison.OrdinalIgnoreCase)))
                            contactParts.Add(model.CompanyPhone.Trim());
                        if (cfg.ShowCompanyWebsite && !string.IsNullOrWhiteSpace(model.CompanyWebsite) &&
                            (string.IsNullOrWhiteSpace(model.CompanyEmail) || !model.CompanyEmail.Contains(model.CompanyWebsite.Trim(), StringComparison.OrdinalIgnoreCase)))
                            contactParts.Add(model.CompanyWebsite.Trim());
                        if (contactParts.Count > 0)
                        {
                            var contactItem = align ? infoCol.Item().AlignCenter() : infoCol.Item();
                            string safeContact = string.Join("  ·  ", contactParts);
                            contactItem.PaddingTop(1).Text(safeContact)
                                .FontSize(baseFontPt - 1.5f)
                                .FontColor(textSecondaryHex);
                        }
                        if (cfg.ShowAuthorizedIdentifiers && !string.IsNullOrWhiteSpace(model.AuthorizedIdentifiers))
                        {
                            var idItem = align ? infoCol.Item().AlignCenter() : infoCol.Item();
                            idItem.PaddingTop(1).Text(model.AuthorizedIdentifiers)
                                .FontSize(baseFontPt - 1.5f)
                                .FontColor(textSecondaryHex);
                        }
                    });
                });
            }
            // Clean Corporate Divider Line (Section 16)
            if (cfg.ShowHeaderDivider)
            {
                float divThickness = cfg.HeaderDividerThicknessPt > 0 ? cfg.HeaderDividerThicknessPt : 2.0f;
                string divColor = SafeHex(cfg.HeaderDividerColor, orangeHex);
                col.Item().PaddingTop(6).Height(divThickness).Background(divColor);
            }
        });
    }
    private static void ComposeTitleBanner(
        IContainer container,
        PayslipDocumentModel model,
        PayslipTemplateConfig cfg,
        string orangeHex,
        string navyHex,
        string subtleOrangeHex,
        float baseFontPt)
    {
        string prefix = !string.IsNullOrWhiteSpace(cfg.PeriodPresentationPrefix)
            ? cfg.PeriodPresentationPrefix.Trim()
            : "For the Month of";
        string rightText = !string.IsNullOrWhiteSpace(prefix)
            ? $"{prefix} {model.PeriodLabel}"
            : model.PeriodLabel;
        string bannerBg = !string.IsNullOrWhiteSpace(cfg.TitleBannerBgColor) ? cfg.TitleBannerBgColor : orangeHex;
        string titleColor = !string.IsNullOrWhiteSpace(cfg.TitleBannerTitleColor) ? cfg.TitleBannerTitleColor : "#FFFFFF";
        string periodColor = !string.IsNullOrWhiteSpace(cfg.TitleBannerPeriodColor) ? cfg.TitleBannerPeriodColor : "#FFFFFF";
        container
            .Background(bannerBg)
            .PaddingVertical(6)
            .PaddingHorizontal(10)
            .Row(row =>
            {
                row.RelativeItem().AlignMiddle().Text(cfg.DocumentTitle ?? "PAYSLIP")
                    .FontSize(baseFontPt + 2.5f)
                    .Bold()
                    .FontColor(titleColor);
                row.RelativeItem().AlignRight().AlignMiddle().Text(rightText)
                    .FontSize(baseFontPt + 0.5f)
                    .SemiBold()
                    .FontColor(periodColor);
            });
    }
    private static void ComposeEmployeeDetails(
        IContainer container,
        PayslipDocumentModel model,
        PayslipTemplateConfig cfg,
        string navyHex,
        string borderHex,
        string textPrimaryHex,
        string textSecondaryHex,
        float baseFontPt)
    {
        var items = new List<(string Label, string Value)>();
        if (cfg.ShowEmployeeId && !string.IsNullOrWhiteSpace(model.EmployeeCode))
            items.Add(("Employee ID", model.EmployeeCode.Trim()));
        if (cfg.ShowEmployeeName && !string.IsNullOrWhiteSpace(model.EmployeeName))
            items.Add(("Employee Name", model.EmployeeName.Trim()));
        if (cfg.ShowEmployeeEmail && !string.IsNullOrWhiteSpace(model.EmployeeEmail))
            items.Add(("Email", model.EmployeeEmail.Trim()));
        if (cfg.ShowDepartment && !string.IsNullOrWhiteSpace(model.Department))
            items.Add(("Department", model.Department.Trim()));
        if (cfg.ShowDesignation && !string.IsNullOrWhiteSpace(model.Designation))
            items.Add(("Designation", model.Designation.Trim()));
        if (cfg.ShowPayrollPeriodInDetails && !string.IsNullOrWhiteSpace(model.PeriodLabel))
            items.Add(("Pay Period", model.PeriodLabel.Trim()));
        if (model.VisibleMetadataFields != null)
        {
            foreach (var meta in model.VisibleMetadataFields)
            {
                if (!string.IsNullOrWhiteSpace(meta.Value))
                {
                    items.Add((meta.Label, meta.Value.Trim()));
                }
            }
        }
        if (items.Count == 0)
            return;
        int cols = cfg.EmployeeDetailsColumns == 3 ? 3 : 2;
        bool showEmpBorder = cfg.EnableBorders && cfg.ShowEmployeeDetailsBorder;
        float borderThickness = cfg.BorderThicknessPt > 0 ? cfg.BorderThicknessPt : 1.0f;
        string effBorderColor = SafeHex(cfg.BorderColor, borderHex);
        var section = container;
        if (showEmpBorder)
        {
            section = section.BorderTop(borderThickness).BorderBottom(borderThickness).BorderColor(effBorderColor);
        }
        section
            .PaddingVertical(6)
            .Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    for (int i = 0; i < cols; i++)
                        c.RelativeColumn();
                });
                foreach (var item in items)
                {
                    table.Cell().PaddingVertical(2).PaddingRight(12).Row(r =>
                    {
                        r.AutoItem().Text(item.Label)
                            .FontSize(baseFontPt - 0.5f)
                            .FontColor(textSecondaryHex);
                        r.RelativeItem().AlignRight().Text(item.Value)
                            .FontSize(baseFontPt)
                            .SemiBold()
                            .FontColor(textPrimaryHex);
                    });
                }
                int remainder = items.Count % cols;
                if (remainder != 0)
                {
                    for (int pad = 0; pad < cols - remainder; pad++)
                    {
                        table.Cell();
                    }
                }
            });
    }
    private static void ComposeSalaryTables(
        IContainer container,
        PayslipDocumentModel model,
        PayslipTemplateConfig cfg,
        string orangeHex,
        string navyHex,
        string borderHex,
        string textPrimaryHex,
        float baseFontPt,
        float rowPadPt,
        float borderWeightPt)
    {
        bool hasEarnings = model.VisibleEarnings.Count > 0;
        bool hasDeductions = model.VisibleDeductions.Count > 0;
        bool hasEmployerContrib = model.VisibleEmployerContributions.Count > 0;
        // For a completely empty earnings or deductions category, hide that category rather than showing an empty table.
        if (!hasEarnings && !hasDeductions && !hasEmployerContrib)
            return;
        bool sideBySide = cfg.TableLayoutMode == "SideBySide" && hasEarnings && hasDeductions;
        int spacing = cfg.TableSpacingPx > 0 ? cfg.TableSpacingPx : 10;
        int maxSalaryRows = sideBySide ? Math.Max(model.VisibleEarnings.Count, model.VisibleDeductions.Count) : 0;
        container.Column(col =>
        {
            col.Spacing(10);
            if (sideBySide)
            {
                col.Item().Row(row =>
                {
                    row.Spacing(spacing);
                    row.RelativeItem().AlignTop().Element(c => RenderComponentTable(
                        c,
                        cfg.EarningsSectionHeading,
                        cfg.ComponentColumnHeading,
                        cfg.AmountColumnHeading,
                        model.VisibleEarnings,
                        orangeHex,
                        navyHex,
                        borderHex,
                        textPrimaryHex,
                        baseFontPt,
                        rowPadPt,
                        borderWeightPt,
                        cfg.AmountAlignment == "Left",
                        cfg,
                        cfg.EarningsLabelWidthPercent > 0 ? cfg.EarningsLabelWidthPercent : 65,
                        minRows: maxSalaryRows));
                    row.RelativeItem().AlignTop().Element(c => RenderComponentTable(
                        c,
                        cfg.DeductionsSectionHeading,
                        cfg.ComponentColumnHeading,
                        cfg.AmountColumnHeading,
                        model.VisibleDeductions,
                        orangeHex,
                        navyHex,
                        borderHex,
                        textPrimaryHex,
                        baseFontPt,
                        rowPadPt,
                        borderWeightPt,
                        cfg.AmountAlignment == "Left",
                        cfg,
                        cfg.DeductionsLabelWidthPercent > 0 ? cfg.DeductionsLabelWidthPercent : 65,
                        minRows: maxSalaryRows));
                });
            }
            else
            {
                if (hasEarnings)
                {
                    col.Item().Element(c => RenderComponentTable(
                        c,
                        cfg.EarningsSectionHeading,
                        cfg.ComponentColumnHeading,
                        cfg.AmountColumnHeading,
                        model.VisibleEarnings,
                        orangeHex,
                        navyHex,
                        borderHex,
                        textPrimaryHex,
                        baseFontPt,
                        rowPadPt,
                        borderWeightPt,
                        cfg.AmountAlignment == "Left",
                        cfg,
                        cfg.EarningsLabelWidthPercent > 0 ? cfg.EarningsLabelWidthPercent : 65));
                }
                if (hasDeductions)
                {
                    col.Item().Element(c => RenderComponentTable(
                        c,
                        cfg.DeductionsSectionHeading,
                        cfg.ComponentColumnHeading,
                        cfg.AmountColumnHeading,
                        model.VisibleDeductions,
                        orangeHex,
                        navyHex,
                        borderHex,
                        textPrimaryHex,
                        baseFontPt,
                        rowPadPt,
                        borderWeightPt,
                        cfg.AmountAlignment == "Left",
                        cfg,
                        cfg.DeductionsLabelWidthPercent > 0 ? cfg.DeductionsLabelWidthPercent : 65));
                }
            }
            if (hasEmployerContrib)
            {
                col.Item().Element(c => RenderComponentTable(
                    c,
                    "EMPLOYER CONTRIBUTIONS",
                    cfg.ComponentColumnHeading,
                    cfg.AmountColumnHeading,
                    model.VisibleEmployerContributions,
                    orangeHex,
                    navyHex,
                    borderHex,
                    textPrimaryHex,
                    baseFontPt,
                    rowPadPt,
                    borderWeightPt,
                    cfg.AmountAlignment == "Left",
                    cfg,
                    65));
            }
        });
    }
    private static void RenderComponentTable(
        IContainer container,
        string sectionTitle,
        string colParticulars,
        string colAmount,
        List<ResolvedPayslipComponentRow> rows,
        string orangeHex,
        string navyHex,
        string borderHex,
        string textPrimaryHex,
        float baseFontPt,
        float rowPadPt,
        float borderWeightPt,
        bool leftAlignAmounts,
        PayslipTemplateConfig cfg,
        int labelWidthPercent,
        int minRows = 0)
    {
        bool showOuterBorder = cfg.EnableBorders && cfg.ShowSalaryTablesBorder;
        float outerBorderThickness = cfg.BorderThicknessPt > 0 ? cfg.BorderThicknessPt : 1.0f;
        string outerBorderColor = SafeHex(cfg.BorderColor, borderHex);
        bool rowBordersEnabled = cfg.EnableRowBorders;
        string rowBorderMode = cfg.RowBorderMode ?? "All";
        float rowBorderThickness = cfg.RowBorderThicknessPt > 0 ? cfg.RowBorderThicknessPt : 1.0f;
        string rowBorderColor = SafeHex(cfg.RowBorderColor, outerBorderColor);
        bool colBordersEnabled = cfg.EnableColumnBorders;
        float colBorderThickness = cfg.ColumnBorderThicknessPt > 0 ? cfg.ColumnBorderThicknessPt : 1.0f;
        string colBorderColor = SafeHex(cfg.ColumnBorderColor, outerBorderColor);
        int effectiveLabelWeight = Math.Clamp(labelWidthPercent, 40, 58);
        int amountWeight = 100 - effectiveLabelWeight;
        var box = container;
        if (showOuterBorder)
        {
            box = box.Border(outerBorderThickness).BorderColor(outerBorderColor);
        }
        box.Table(table =>
        {
            table.ColumnsDefinition(cols =>
            {
                cols.RelativeColumn(effectiveLabelWeight);
                cols.RelativeColumn(amountWeight);
            });
            table.Header(header =>
            {
                header.Cell().ColumnSpan(2)
                    .Background("#FFFFFF")
                    .BorderBottom(2).BorderColor(orangeHex)
                    .PaddingVertical(6)
                    .PaddingHorizontal(8)
                    .Text(sectionTitle)
                    .FontSize(baseFontPt)
                    .Bold()
                    .FontColor(orangeHex);
                var partHeader = header.Cell().Background("#F8F9FA");
                if (rowBordersEnabled && (rowBorderMode == "All" || rowBorderMode == "HeaderOnly"))
                {
                    partHeader = partHeader.BorderBottom(rowBorderThickness).BorderColor(rowBorderColor);
                }
                if (colBordersEnabled)
                {
                    partHeader = partHeader.BorderRight(colBorderThickness).BorderColor(colBorderColor);
                }
                partHeader
                    .PaddingVertical(4)
                    .PaddingHorizontal(8)
                    .Text(colParticulars)
                    .FontSize(baseFontPt - 0.5f)
                    .SemiBold()
                    .FontColor("#6B7280");
                var amtHeader = header.Cell().Background("#F8F9FA");
                if (rowBordersEnabled && (rowBorderMode == "All" || rowBorderMode == "HeaderOnly"))
                {
                    amtHeader = amtHeader.BorderBottom(rowBorderThickness).BorderColor(rowBorderColor);
                }
                var amtPadded = amtHeader
                    .PaddingVertical(4)
                    .PaddingLeft(4)
                    .PaddingRight(8);
                if (leftAlignAmounts)
                {
                    amtPadded.Text(t =>
                    {
                        t.ClampLines(1);
                        t.Span(colAmount).FontSize(baseFontPt - 0.5f).SemiBold().FontColor("#6B7280");
                    });
                }
                else
                {
                    amtPadded.AlignRight().Text(t =>
                    {
                        t.ClampLines(1);
                        t.Span(colAmount).FontSize(baseFontPt - 0.5f).SemiBold().FontColor("#6B7280");
                    });
                }
            });
            for (int i = 0; i < rows.Count; i++)
            {
                var r = rows[i];
                bool isLast = i == rows.Count - 1;
                bool applyRowBorder = (!isLast || !showOuterBorder) && rowBordersEnabled && (rowBorderMode == "All" || rowBorderMode == "DataOnly");
                var labelCell = table.Cell().ShowEntire();
                if (applyRowBorder)
                {
                    labelCell = labelCell.BorderBottom(rowBorderThickness).BorderColor(rowBorderColor);
                }
                if (colBordersEnabled)
                {
                    labelCell = labelCell.BorderRight(colBorderThickness).BorderColor(colBorderColor);
                }
                labelCell
                    .PaddingVertical(rowPadPt)
                    .PaddingHorizontal(8)
                    .Text(r.DisplayLabel)
                    .FontSize(baseFontPt)
                    .FontColor(textPrimaryHex);
                var valCell = table.Cell().ShowEntire();
                if (applyRowBorder)
                {
                    valCell = valCell.BorderBottom(rowBorderThickness).BorderColor(rowBorderColor);
                }
                var valPadded = valCell
                    .PaddingVertical(rowPadPt)
                    .PaddingLeft(4)
                    .PaddingRight(8);
                if (leftAlignAmounts)
                {
                    valPadded.Text(t =>
                    {
                        t.ClampLines(1);
                        t.Span(r.FormattedAmount).FontSize(baseFontPt).SemiBold().FontColor(textPrimaryHex);
                    });
                }
                else
                {
                    valPadded.AlignRight().Text(t =>
                    {
                        t.ClampLines(1);
                        t.Span(r.FormattedAmount).FontSize(baseFontPt).SemiBold().FontColor(textPrimaryHex);
                    });
                }
            }
            int targetTotal = Math.Max(rows.Count, minRows);
            for (int i = rows.Count; i < targetTotal; i++)
            {
                bool isLast = i == targetTotal - 1;
                bool applyRowBorder = (!isLast || !showOuterBorder) && rowBordersEnabled && (rowBorderMode == "All" || rowBorderMode == "DataOnly");
                var labelCell = table.Cell().ShowEntire();
                if (applyRowBorder)
                {
                    labelCell = labelCell.BorderBottom(rowBorderThickness).BorderColor(rowBorderColor);
                }
                if (colBordersEnabled)
                {
                    labelCell = labelCell.BorderRight(colBorderThickness).BorderColor(colBorderColor);
                }
                labelCell
                    .PaddingVertical(rowPadPt)
                    .PaddingHorizontal(8)
                    .Text(" ")
                    .FontSize(baseFontPt);
                var valCell = table.Cell().ShowEntire();
                if (applyRowBorder)
                {
                    valCell = valCell.BorderBottom(rowBorderThickness).BorderColor(rowBorderColor);
                }
                valCell
                    .PaddingVertical(rowPadPt)
                    .PaddingLeft(4)
                    .PaddingRight(8)
                    .Text(" ")
                    .FontSize(baseFontPt);
            }
        });
    }
    private static void ComposeCustomTextFields(
        IContainer container,
        PayslipDocumentModel model,
        PayslipTemplateConfig cfg,
        string navyHex,
        string borderHex,
        string textPrimaryHex,
        string textSecondaryHex,
        float baseFontPt)
    {
        bool showBorder = cfg.EnableBorders && cfg.ShowSalaryTablesBorder;
        float borderThickness = cfg.BorderThicknessPt > 0 ? cfg.BorderThicknessPt : 1.0f;
        string effBorderColor = SafeHex(cfg.BorderColor, borderHex);
        var box = container;
        if (showBorder)
        {
            box = box.Border(borderThickness).BorderColor(effBorderColor);
        }
        box
            .Padding(8)
            .Column(col =>
            {
                col.Item().PaddingBottom(4).Text("ADDITIONAL PAYROLL INFORMATION")
                    .FontSize(baseFontPt - 1f)
                    .Bold()
                    .FontColor(navyHex);
                col.Item().Table(t =>
                {
                    t.ColumnsDefinition(c =>
                    {
                        c.RelativeColumn();
                        c.RelativeColumn();
                    });
                    foreach (var field in model.VisibleCustomTextFields)
                    {
                        t.Cell().PaddingVertical(2).Row(r =>
                        {
                            r.ConstantItem(110).Text(field.Label + ":").FontSize(baseFontPt - 0.5f).FontColor(textSecondaryHex);
                            r.RelativeItem().Text(field.Value).FontSize(baseFontPt - 0.5f).SemiBold().FontColor(textPrimaryHex);
                        });
                    }
                    if (model.VisibleCustomTextFields.Count % 2 != 0)
                    {
                        t.Cell();
                    }
                });
            });
    }
    private static void ComposeCustomTablesGroup(
        IContainer container,
        List<CustomPayslipTable> tables,
        PayslipTemplateConfig cfg,
        string orangeHex,
        string navyHex,
        string subtleOrangeHex,
        string borderHex,
        string textPrimaryHex,
        string textSecondaryHex,
        float baseFontPt,
        float rowPadPt,
        float borderWeightPt)
    {
        var visibleTables = tables.Where(t => t != null && t.IsVisible).ToList();
        if (visibleTables.Count == 0) return;
        string effMode = cfg.AdditionalTablesLayoutMode ?? "Auto";
        bool isSideBySide = effMode == "SideBySide" || (effMode != "Stacked" && cfg.TableLayoutMode == "SideBySide");
        int spacing = cfg.TableSpacingPx > 0 ? cfg.TableSpacingPx : 16;
        container.Column(col =>
        {
            col.Spacing(10);
            if (!isSideBySide)
            {
                foreach (var tbl in visibleTables)
                {
                    col.Item().Element(c => ComposeCustomTable(c, tbl, cfg, orangeHex, navyHex, subtleOrangeHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt, rowPadPt, borderWeightPt));
                }
                return;
            }
            int i = 0;
            while (i < visibleTables.Count)
            {
                var cur = visibleTables[i];
                if (cur.LayoutWidth == "full")
                {
                    col.Item().Element(c => ComposeCustomTable(c, cur, cfg, orangeHex, navyHex, subtleOrangeHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt, rowPadPt, borderWeightPt));
                    i++;
                }
                else
                {
                    if (i + 1 < visibleTables.Count && visibleTables[i + 1].LayoutWidth != "full")
                    {
                        var left = cur;
                        var right = visibleTables[i + 1];
                        int maxPairRows = Math.Max(left.Rows?.Count ?? 0, right.Rows?.Count ?? 0);
                        col.Item().Row(r =>
                        {
                            r.RelativeItem().Element(c => ComposeCustomTable(c, left, cfg, orangeHex, navyHex, subtleOrangeHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt, rowPadPt, borderWeightPt, minRows: maxPairRows));
                            r.ConstantItem(spacing);
                            r.RelativeItem().Element(c => ComposeCustomTable(c, right, cfg, orangeHex, navyHex, subtleOrangeHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt, rowPadPt, borderWeightPt, minRows: maxPairRows));
                        });
                        i += 2;
                    }
                    else
                    {
                        if (cur.LayoutWidth == "half")
                        {
                            col.Item().Row(r =>
                            {
                                r.RelativeItem().Element(c => ComposeCustomTable(c, cur, cfg, orangeHex, navyHex, subtleOrangeHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt, rowPadPt, borderWeightPt));
                                r.ConstantItem(spacing);
                                r.RelativeItem();
                            });
                        }
                        else
                        {
                            col.Item().Element(c => ComposeCustomTable(c, cur, cfg, orangeHex, navyHex, subtleOrangeHex, borderHex, textPrimaryHex, textSecondaryHex, baseFontPt, rowPadPt, borderWeightPt));
                        }
                        i++;
                    }
                }
            }
        });
    }
    private static bool IsCustomColRightAligned(string? colHeading, int cIdx, List<CustomPayslipTableRow>? allRows)
    {
        if (cIdx == 0) return false;
        string h = (colHeading ?? "").ToLowerInvariant();
        if (h.Contains("count") || h.Contains("day") || h.Contains("amount") ||
            h.Contains("bal") || h.Contains("open") || h.Contains("avail") ||
            h.Contains("close") || h.Contains("rate") || h.Contains("total") ||
            h.Contains("hrs") || h.Contains("hour") || h.Contains("qty") ||
            h.Contains("%") || h.Contains("num") || h.Contains("value"))
        {
            return true;
        }
        if (allRows != null && allRows.Count > 0)
        {
            int numCount = 0;
            foreach (var r in allRows)
            {
                if (r.Cells != null && cIdx < r.Cells.Count)
                {
                    string val = r.Cells[cIdx];
                    if (val.Any(char.IsDigit)) numCount++;
                }
            }
            if (numCount >= (allRows.Count + 1) / 2) return true;
        }
        return false;
    }
    private static void ComposeCustomTable(
        IContainer container,
        CustomPayslipTable table,
        PayslipTemplateConfig cfg,
        string orangeHex,
        string navyHex,
        string subtleOrangeHex,
        string borderHex,
        string textPrimaryHex,
        string textSecondaryHex,
        float baseFontPt,
        float rowPadPt,
        float borderWeightPt,
        int minRows = 0)
    {
        if (table == null || !table.IsVisible || table.Columns == null || table.Columns.Count == 0)
            return;
        bool enableBorder = cfg.EnableBorders && table.ShowBorder;
        float outerBorderThickness = cfg.BorderThicknessPt > 0 ? cfg.BorderThicknessPt : 1.0f;
        string effBorder = SafeHex(cfg.BorderColor, borderHex);
        string headerBg = !string.IsNullOrWhiteSpace(table.HeadingBgColor) ? SafeHex(table.HeadingBgColor, "#FFFFFF") : "#FFFFFF";
        string headerTitleColor = !string.IsNullOrWhiteSpace(table.HeadingTextColor) ? SafeHex(table.HeadingTextColor, orangeHex) : orangeHex;
        float rowBorderThickness = cfg.RowBorderThicknessPt > 0 ? cfg.RowBorderThicknessPt : 1.0f;
        string rowBorderColor = SafeHex(cfg.RowBorderColor, effBorder);
        float colBorderThickness = cfg.ColumnBorderThicknessPt > 0 ? cfg.ColumnBorderThicknessPt : 1.0f;
        string colBorderColor = SafeHex(cfg.ColumnBorderColor, effBorder);
        var box = container;
        if (enableBorder)
        {
            box = box.Border(outerBorderThickness).BorderColor(effBorder);
        }
        box.Table(t =>
        {
            t.ColumnsDefinition(cols =>
            {
                for (int i = 0; i < table.Columns.Count; i++)
                {
                    if (i == 0 && table.Columns.Count >= 4)
                        cols.RelativeColumn(1.5f);
                    else if (i == 0 && table.Columns.Count == 3)
                        cols.RelativeColumn(1.8f);
                    else if (i == 0 && table.Columns.Count == 2)
                        cols.RelativeColumn(1.8f);
                    else
                        cols.RelativeColumn(1.0f);
                }
            });
            t.Header(h =>
            {
                if (!string.IsNullOrWhiteSpace(table.Title))
                {
                    h.Cell().ColumnSpan((uint)Math.Max(1, table.Columns.Count))
                        .Background(headerBg)
                        .BorderBottom(2).BorderColor(headerTitleColor)
                        .PaddingVertical(6)
                        .PaddingHorizontal(8)
                        .Text(table.Title.ToUpperInvariant())
                        .FontSize(baseFontPt)
                        .Bold()
                        .FontColor(headerTitleColor);
                }
                if (table.Columns != null && table.Columns.Count > 0)
                {
                    for (int i = 0; i < table.Columns.Count; i++)
                    {
                        var colHeading = table.Columns[i];
                        bool isLast = i == table.Columns.Count - 1;
                        var cell = h.Cell().Background("#F8F9FA");
                        if (cfg.EnableRowBorders && (cfg.RowBorderMode == "All" || cfg.RowBorderMode == "HeaderOnly"))
                        {
                            cell = cell.BorderBottom(rowBorderThickness).BorderColor(rowBorderColor);
                        }
                        if (cfg.EnableColumnBorders && !isLast)
                        {
                            cell = cell.BorderRight(colBorderThickness).BorderColor(colBorderColor);
                        }
                        bool isColRight = IsCustomColRightAligned(colHeading, i, table.Rows);
                        var hTxt = cell.PaddingVertical(4).PaddingHorizontal(5);
                        if (isColRight)
                        {
                            hTxt.AlignRight().Text(colHeading).FontSize(baseFontPt - 1f).SemiBold().FontColor(textSecondaryHex);
                        }
                        else
                        {
                            hTxt.AlignLeft().Text(colHeading).FontSize(baseFontPt - 1f).SemiBold().FontColor(textSecondaryHex);
                        }
                    }
                }
            });
            if (table.Rows != null)
            {
                for (int rIdx = 0; rIdx < table.Rows.Count; rIdx++)
                {
                    var row = table.Rows[rIdx];
                    bool isLastRow = rIdx == table.Rows.Count - 1;
                    bool applyRowBorder = (!isLastRow || !enableBorder) && cfg.EnableRowBorders && (cfg.RowBorderMode == "All" || cfg.RowBorderMode == "DataOnly");
                    for (int cIdx = 0; cIdx < table.Columns.Count; cIdx++)
                    {
                        string cellVal = (row.Cells != null && cIdx < row.Cells.Count) ? row.Cells[cIdx] : string.Empty;
                        bool isLastCol = cIdx == table.Columns.Count - 1;
                        var cell = t.Cell().ShowEntire();
                        if (applyRowBorder)
                        {
                            cell = cell.BorderBottom(rowBorderThickness).BorderColor(rowBorderColor);
                        }
                        if (cfg.EnableColumnBorders && !isLastCol)
                        {
                            cell = cell.BorderRight(colBorderThickness).BorderColor(colBorderColor);
                        }
                        var cellPadded = cell.PaddingVertical(rowPadPt).PaddingHorizontal(5);
                        string displayText = string.IsNullOrWhiteSpace(cellVal) ? "\u00A0" : cellVal.Trim();
                        bool isColRight = IsCustomColRightAligned(table.Columns[cIdx], cIdx, table.Rows);
                        if (isColRight)
                        {
                            cellPadded.AlignRight().Text(displayText)
                                .FontSize(baseFontPt)
                                .FontColor(textPrimaryHex);
                        }
                        else
                        {
                            cellPadded.AlignLeft().Text(displayText)
                                .FontSize(baseFontPt)
                                .FontColor(textPrimaryHex);
                        }
                    }
                }
            }
            int customCurrentRows = table.Rows?.Count ?? 0;
            int customTargetRows = Math.Max(customCurrentRows, minRows);
            for (int rIdx = customCurrentRows; rIdx < customTargetRows; rIdx++)
            {
                bool isLastRow = rIdx == customTargetRows - 1;
                bool applyRowBorder = (!isLastRow || !enableBorder) && cfg.EnableRowBorders && (cfg.RowBorderMode == "All" || cfg.RowBorderMode == "DataOnly");
                for (int cIdx = 0; cIdx < table.Columns.Count; cIdx++)
                {
                    bool isLastCol = cIdx == table.Columns.Count - 1;
                    var cell = t.Cell().ShowEntire();
                    if (applyRowBorder)
                    {
                        cell = cell.BorderBottom(rowBorderThickness).BorderColor(rowBorderColor);
                    }
                    if (cfg.EnableColumnBorders && !isLastCol)
                    {
                        cell = cell.BorderRight(colBorderThickness).BorderColor(colBorderColor);
                    }
                    cell.PaddingVertical(rowPadPt).PaddingHorizontal(5)
                        .Text(" ")
                        .FontSize(baseFontPt);
                }
            }
        });
    }
    private static void ComposeSuppliedTotals(
        IContainer container,
        PayslipDocumentModel model,
        PayslipTemplateConfig cfg,
        string navyHex,
        string borderHex,
        string textPrimaryHex,
        string textSecondaryHex,
        float baseFontPt)
    {
        string sym = cfg.ShowCurrencySymbolInRows ? model.CurrencySymbol : string.Empty;
        bool showBorder = cfg.EnableBorders && cfg.ShowTotalsSummaryBorder;
        float borderThickness = cfg.BorderThicknessPt > 0 ? cfg.BorderThicknessPt : 1.0f;
        string effBorderColor = SafeHex(cfg.BorderColor, borderHex);
        var box = container.ShowEntire();
        if (showBorder)
        {
            box = box.Border(borderThickness).BorderColor(effBorderColor);
        }
        box
            .Background("#F8F9FA")
            .PaddingVertical(6)
            .PaddingHorizontal(12)
            .Row(row =>
            {
                if (model.GrossSalary.HasValue)
                {
                    row.RelativeItem().Text(t =>
                    {
                        t.Span("Gross Salary: ").FontSize(baseFontPt).FontColor(textSecondaryHex);
                        t.Span(PayslipDocumentResolver.FormatIndianAmount(model.GrossSalary.Value, sym))
                            .FontSize(baseFontPt + 0.5f)
                            .Bold()
                            .FontColor(textPrimaryHex);
                    });
                }
                else
                {
                    row.RelativeItem();
                }
                if (model.TotalDeductions.HasValue)
                {
                    row.RelativeItem().AlignRight().Text(t =>
                    {
                        t.Span("Total Deductions: ").FontSize(baseFontPt).FontColor(textSecondaryHex);
                        t.Span(PayslipDocumentResolver.FormatIndianAmount(model.TotalDeductions.Value, sym))
                            .FontSize(baseFontPt + 0.5f)
                            .Bold()
                            .FontColor(textPrimaryHex);
                    });
                }
                else
                {
                    row.RelativeItem();
                }
            });
    }
    private static void ComposeNetSalaryBanner(
        IContainer container,
        PayslipDocumentModel model,
        PayslipTemplateConfig cfg,
        string orangeHex,
        string navyHex,
        string subtleOrangeHex,
        string textPrimaryHex,
        string textSecondaryHex,
        float baseFontPt)
    {
        string sym = cfg.ShowCurrencySymbolInRows ? model.CurrencySymbol : string.Empty;
        string formattedNet = PayslipDocumentResolver.FormatIndianAmount(model.NetSalary!.Value, sym);
        string netBg = !string.IsNullOrWhiteSpace(cfg.NetSalaryBgColor) ? cfg.NetSalaryBgColor : orangeHex;
        string netBorder = !string.IsNullOrWhiteSpace(cfg.NetSalaryBorderColor) ? cfg.NetSalaryBorderColor : orangeHex;
        string netTitleColor = !string.IsNullOrWhiteSpace(cfg.NetSalaryTitleColor) ? cfg.NetSalaryTitleColor : "#FFFFFF";
        string netWordsColor = !string.IsNullOrWhiteSpace(cfg.NetSalaryWordsColor) ? cfg.NetSalaryWordsColor : "#FFFFFF";
        string netAmountColor = !string.IsNullOrWhiteSpace(cfg.NetSalaryAmountColor) ? cfg.NetSalaryAmountColor : "#FFFFFF";
        bool showBorder = cfg.EnableBorders && cfg.ShowNetSalaryBorder;
        float borderThickness = cfg.BorderThicknessPt > 0 ? cfg.BorderThicknessPt : 1.0f;
        var box = container.ShowEntire().Background(netBg);
        if (showBorder)
        {
            box = box.Border(borderThickness).BorderLeft(4).BorderColor(netBorder);
        }
        box
            .PaddingVertical(10)
            .PaddingHorizontal(14)
            .Row(row =>
            {
                row.RelativeItem().Column(c =>
                {
                    c.Item().Text(cfg.NetSalaryLabel ?? "NET SALARY PAYABLE")
                        .FontSize(baseFontPt + 1f)
                        .Bold()
                        .FontColor(netTitleColor);
                    if (cfg.ShowAmountInWords && !string.IsNullOrWhiteSpace(model.NetSalaryInWords))
                    {
                        c.Item().PaddingTop(2).Text(model.NetSalaryInWords)
                            .FontSize(baseFontPt - 1f)
                            .FontColor(netWordsColor);
                    }
                });
                row.AutoItem().AlignMiddle().Text(formattedNet)
                    .FontSize(baseFontPt + 5.5f)
                    .Bold()
                    .FontColor(netAmountColor);
            });
    }
    private static void ComposeSignatureArea(
        IContainer container,
        PayslipTemplateConfig cfg,
        string navyHex,
        string borderHex,
        string textSecondaryHex,
        float baseFontPt)
    {
        if (!cfg.ShowSignatureArea)
            return;
        int topSpacing = cfg.SignatureTopSpacingPx > 0 ? cfg.SignatureTopSpacingPx : 18;
        int lineWidth = cfg.SignatureLineWidthPx > 0 ? cfg.SignatureLineWidthPx : 160;
        float lineThickness = cfg.SignatureLineThicknessPt > 0 ? cfg.SignatureLineThicknessPt : 1.0f;
        string align = cfg.SignatureAlignment ?? "Right";
        var box = container.ShowEntire().PaddingTop(topSpacing);
        if (cfg.EnableBorders && cfg.ShowSignatureBorder)
        {
            box = box.Border(1).BorderColor(borderHex).Padding(8);
        }
        box.Row(row =>
        {
            if (cfg.ShowLeftSignature)
            {
                row.ConstantItem(lineWidth).Column(c =>
                {
                    c.Item().Height(lineThickness).Background(borderHex);
                    c.Item().PaddingTop(4)
                        .Text(cfg.LeftSignatureLabel)
                        .FontSize(baseFontPt - 0.5f)
                        .SemiBold()
                        .FontColor(navyHex);
                });
            }
            if (align == "Left")
            {
                row.ConstantItem(lineWidth).Column(c => RenderSignatoryColumn(c, cfg, navyHex, textSecondaryHex, baseFontPt, lineThickness, false));
                row.RelativeItem();
            }
            else if (align == "Center")
            {
                row.RelativeItem();
                row.ConstantItem(lineWidth).AlignCenter().Column(c => RenderSignatoryColumn(c, cfg, navyHex, textSecondaryHex, baseFontPt, lineThickness, true));
                row.RelativeItem();
            }
            else // Right (default)
            {
                row.RelativeItem();
                row.ConstantItem(lineWidth).AlignRight().Column(c => RenderSignatoryColumn(c, cfg, navyHex, textSecondaryHex, baseFontPt, lineThickness, true));
            }
        });
    }
    private static void RenderSignatoryColumn(
        ColumnDescriptor c,
        PayslipTemplateConfig cfg,
        string navyHex,
        string textSecondaryHex,
        float baseFontPt,
        float lineThickness,
        bool alignRight)
    {
        c.Item().Height(lineThickness).Background(navyHex);
        if (!string.IsNullOrWhiteSpace(cfg.SignatoryName))
        {
            var nameItem = alignRight ? c.Item().AlignRight() : c.Item();
            nameItem.PaddingTop(4).Text(cfg.SignatoryName).FontSize(baseFontPt).Bold().FontColor(navyHex);
        }
        var labelItem = alignRight ? c.Item().AlignRight() : c.Item();
        labelItem.PaddingTop(string.IsNullOrWhiteSpace(cfg.SignatoryName) ? 4 : 1)
            .Text(cfg.RightSignatureLabel).FontSize(baseFontPt - 0.5f).SemiBold().FontColor(navyHex);
        if (!string.IsNullOrWhiteSpace(cfg.SignatoryDesignation))
        {
            var desigItem = alignRight ? c.Item().AlignRight() : c.Item();
            desigItem.PaddingTop(1).Text(cfg.SignatoryDesignation).FontSize(baseFontPt - 1.5f).FontColor(textSecondaryHex);
        }
        if (!string.IsNullOrWhiteSpace(cfg.RightSignatureSubtext))
        {
            var subItem = alignRight ? c.Item().AlignRight() : c.Item();
            subItem.PaddingTop(1).Text(cfg.RightSignatureSubtext).FontSize(baseFontPt - 1.5f).FontColor(textSecondaryHex);
        }
    }
    private static void ComposeFooterNotes(
        IContainer container,
        PayslipDocumentModel model,
        PayslipTemplateConfig cfg,
        string borderHex,
        string textSecondaryHex,
        float baseFontPt)
    {
        bool showBorder = cfg.EnableBorders && cfg.ShowFooterBorder;
        float borderThickness = cfg.BorderThicknessPt > 0 ? cfg.BorderThicknessPt : 1.0f;
        string effBorderColor = SafeHex(cfg.BorderColor, borderHex);
        var box = container.ShowEntire();
        if (showBorder)
        {
            box = box.BorderTop(borderThickness).BorderColor(effBorderColor);
        }
        box.PaddingTop(6)
            .Column(col =>
            {
                if (!string.IsNullOrWhiteSpace(model.CustomFooterNotes))
                {
                    col.Item().AlignCenter().PaddingBottom(2).Text(txt =>
                    {
                        txt.Span("Notes: ").SemiBold().FontSize(baseFontPt - 0.5f).FontColor(textSecondaryHex);
                        txt.Span(model.CustomFooterNotes!).Italic().FontSize(baseFontPt - 0.5f).FontColor(textSecondaryHex);
                    });
                }
                if (cfg.ShowFooterDisclaimer)
                {
                    string disclaimerText = !string.IsNullOrWhiteSpace(cfg.FooterDisclaimerText) && !cfg.FooterDisclaimerText.Contains("system-generated", StringComparison.OrdinalIgnoreCase)
                        ? cfg.FooterDisclaimerText.Replace("PaySlip Studio", "FINORA")
                        : "This is an official payroll document generated by FINORA — Finance & Payroll Management System.";
                    col.Item().AlignCenter().Text(disclaimerText)
                        .FontSize(baseFontPt - 1.5f)
                        .FontColor(textSecondaryHex);
                }
            });
    }
    private static string NormalizeHexColor(string? input, string fallback)
    {
        if (string.IsNullOrWhiteSpace(input))
            return fallback;
        var s = input.Trim();
        if (s.StartsWith('#') && (s.Length == 7 || s.Length == 9))
            return s;
        return fallback;
    }
    private static string SanitizeFileNameSegment(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(value.Where(c => !invalid.Contains(c)).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "EMP" : cleaned;
    }
    private static byte[]? TryDecodeDataUrlImage(string? dataUrl)
    {
        if (string.IsNullOrWhiteSpace(dataUrl))
            return null;
        try
        {
            var commaIdx = dataUrl.IndexOf(',');
            var base64 = commaIdx >= 0 ? dataUrl[(commaIdx + 1)..] : dataUrl;
            return Convert.FromBase64String(base64);
        }
        catch
        {
            return null;
        }
    }
}
