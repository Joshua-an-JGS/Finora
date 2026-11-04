using System.Globalization;
using System.Text.Json;
using PaySlipStudio.Api.Models;

namespace PaySlipStudio.Api.Services;

public class PayslipDocumentResolver
{
    public PayslipDocumentModel ResolveDocument(
        PayrollRecord record,
        CompanySettings companySettings,
        PayslipTemplate? template,
        PayslipTemplateConfig? directConfig = null)
    {
        var styleConfig = directConfig ?? ResolveEffectiveStyleConfig(record, companySettings, template);
        bool showZeroRows = directConfig != null
            ? directConfig.ShowZeroValueRows
            : (record.ShowZeroValueRowsOverride ?? styleConfig.ShowZeroValueRows);

        string currencySymbol = styleConfig.ShowCurrencySymbolInRows
            ? (string.IsNullOrWhiteSpace(companySettings.CurrencySymbol) ? "₹" : companySettings.CurrencySymbol)
            : string.Empty;

        var model = new PayslipDocumentModel
        {
            PayrollRecordId = record.Id,
            EmployeeId = record.EmployeeId,
            PayrollPeriodId = record.PayrollPeriodId,
            TemplateId = record.SelectedTemplateId ?? template?.Id,
            TemplateName = template?.Name ?? "AMTDC Institutional Default",
            RecordStatus = record.Status,

            CompanyName = styleConfig.OverrideCompanyName != null
                ? styleConfig.OverrideCompanyName
                : companySettings.CompanyName,
            CompanySubtitle = styleConfig.OverrideCompanySubtitle != null
                ? styleConfig.OverrideCompanySubtitle
                : companySettings.Subtitle,
            CompanyAddress = styleConfig.OverrideCompanyAddress != null
                ? styleConfig.OverrideCompanyAddress
                : companySettings.RegisteredAddress,
            CompanyEmail = styleConfig.OverrideCompanyContact != null
                ? styleConfig.OverrideCompanyContact
                : companySettings.ContactEmail,
            CompanyPhone = styleConfig.OverrideCompanyPhone != null
                ? styleConfig.OverrideCompanyPhone
                : companySettings.ContactPhone,
            CompanyWebsite = styleConfig.OverrideCompanyWebsite != null
                ? styleConfig.OverrideCompanyWebsite
                : companySettings.WebsiteUrl,
            AuthorizedIdentifiers = companySettings.AuthorizedIdentifiers,
            LogoDataUrl = styleConfig.OverrideLogoDataUrl != null
                ? (string.IsNullOrWhiteSpace(styleConfig.OverrideLogoDataUrl) ? null : styleConfig.OverrideLogoDataUrl)
                : companySettings.LogoDataUrl,
            CurrencySymbol = string.IsNullOrWhiteSpace(companySettings.CurrencySymbol) ? "₹" : companySettings.CurrencySymbol,
            CurrencyCode = string.IsNullOrWhiteSpace(companySettings.CurrencyCode) ? "INR" : companySettings.CurrencyCode,

            PayrollMonth = record.PayrollPeriod?.Month ?? companySettings.ActivePayrollMonth,
            PayrollYear = record.PayrollPeriod?.Year ?? companySettings.ActivePayrollYear,
            PeriodLabel = !string.IsNullOrWhiteSpace(record.PayrollPeriod?.PeriodLabel)
                ? record.PayrollPeriod!.PeriodLabel
                : record.ImportedPayrollMonthText,

            EmployeeCode = record.OverrideEmployeeCode != null
                ? record.OverrideEmployeeCode.Trim()
                : (!string.IsNullOrWhiteSpace(record.ImportedEmployeeCode)
                    ? record.ImportedEmployeeCode.Trim()
                    : (record.Employee?.EmployeeCode ?? string.Empty)),
            EmployeeName = record.OverrideEmployeeName != null
                ? record.OverrideEmployeeName.Trim()
                : (!string.IsNullOrWhiteSpace(record.ImportedEmployeeName) ? record.ImportedEmployeeName.Trim() : (record.Employee?.FullName ?? string.Empty)),
            EmployeeEmail = record.OverrideEmail != null
                ? record.OverrideEmail.Trim()
                : (!string.IsNullOrWhiteSpace(record.ImportedEmail) ? record.ImportedEmail.Trim() : (record.Employee?.Email ?? string.Empty)),
            Department = record.OverrideDepartment != null
                ? record.OverrideDepartment.Trim()
                : (!string.IsNullOrWhiteSpace(record.ImportedDepartment) ? record.ImportedDepartment.Trim() : (record.Employee?.Department ?? string.Empty)),
            Designation = record.OverrideDesignation != null
                ? record.OverrideDesignation.Trim()
                : (!string.IsNullOrWhiteSpace(record.ImportedDesignation) ? record.ImportedDesignation.Trim() : (record.Employee?.Designation ?? string.Empty)),

            ImportedGrossSalary = record.ImportedGrossSalary,
            GrossSalary = record.OverrideGrossSalary ?? record.ImportedGrossSalary,
            IsGrossOverridden = record.OverrideGrossSalary.HasValue,

            ImportedTotalDeductions = record.ImportedTotalDeductions,
            TotalDeductions = record.OverrideTotalDeductions ?? record.ImportedTotalDeductions,
            IsTotalDeductionsOverridden = record.OverrideTotalDeductions.HasValue,

            ImportedNetSalary = record.ImportedNetSalary,
            NetSalary = record.OverrideNetSalary ?? record.ImportedNetSalary,
            IsNetSalaryOverridden = record.OverrideNetSalary.HasValue,

            StyleConfig = styleConfig,
            CustomFooterNotes = record.CustomFooterNotes,
            CustomTables = styleConfig.CustomTables ?? new List<CustomPayslipTable>()
        };

        var orderedComponents = record.Components
            .OrderBy(c => c.SortOrder)
            .ThenBy(c => c.OriginalLabel, StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var comp in orderedComponents)
        {
            string effectiveLabel = !string.IsNullOrWhiteSpace(comp.OverrideLabel)
                ? comp.OverrideLabel!.Trim()
                : comp.OriginalLabel.Trim();

            decimal? effectiveNumeric = comp.HasManualOverride
                ? comp.OverrideNumericValue
                : comp.ImportedNumericValue;

            string? effectiveText = comp.HasManualOverride
                ? comp.OverrideTextValue
                : comp.ImportedTextValue;

            var (isVisible, reason) = EvaluateVisibility(comp, effectiveNumeric, effectiveText, showZeroRows);

            model.AllEditorComponents.Add(new EditorComponentItemDto
            {
                Id = comp.Id,
                ComponentKey = comp.ComponentKey,
                OriginalLabel = comp.OriginalLabel,
                OverrideLabel = comp.OverrideLabel,
                EffectiveLabel = effectiveLabel,
                Category = comp.Category,
                SortOrder = comp.SortOrder,
                SourceCellType = comp.SourceCellType,
                ImportedNumericValue = comp.ImportedNumericValue,
                ImportedTextValue = comp.ImportedTextValue,
                IsManuallyAdded = comp.IsManuallyAdded,
                HasManualOverride = comp.HasManualOverride,
                OverrideNumericValue = comp.OverrideNumericValue,
                OverrideTextValue = comp.OverrideTextValue,
                EffectiveNumericValue = effectiveNumeric,
                EffectiveTextValue = effectiveText,
                ExplicitVisibilityOverride = comp.ExplicitVisibilityOverride,
                IsCurrentlyVisibleOnPayslip = isVisible,
                VisibilityReason = reason
            });

            if (comp.IsFormulaUncertain && !comp.HasManualOverride)
            {
                model.IntegrityWarnings.Add($"Component '{effectiveLabel}' originated from an Excel formula with an uncertain cached value.");
            }

            if (!isVisible)
            {
                continue;
            }

            if (comp.Category == ComponentCategories.CustomText || comp.Category == ComponentCategories.Metadata)
            {
                string displayVal = !string.IsNullOrWhiteSpace(effectiveText)
                    ? effectiveText!.Trim()
                    : (effectiveNumeric.HasValue ? FormatIndianAmount(effectiveNumeric.Value, string.Empty) : string.Empty);

                if (!string.IsNullOrWhiteSpace(displayVal))
                {
                    string displayMetaLabel = NormalizeMetadataDisplayLabel(comp.ComponentKey, comp.OriginalLabel, comp.OverrideLabel);
                    model.VisibleMetadataFields.Add(new ResolvedPayslipTextField
                    {
                        ComponentId = comp.Id,
                        ComponentKey = comp.ComponentKey,
                        Label = displayMetaLabel,
                        Value = displayVal,
                        IsOverridden = comp.HasManualOverride || !string.IsNullOrWhiteSpace(comp.OverrideLabel)
                    });
                }
                continue;
            }

            if (!effectiveNumeric.HasValue)
            {
                continue;
            }

            var row = new ResolvedPayslipComponentRow
            {
                ComponentId = comp.Id,
                ComponentKey = comp.ComponentKey,
                OriginalLabel = comp.OriginalLabel,
                DisplayLabel = effectiveLabel,
                Category = comp.Category,
                Amount = effectiveNumeric.Value,
                FormattedAmount = FormatIndianAmount(effectiveNumeric.Value, currencySymbol),
                IsOverridden = comp.HasManualOverride || !string.IsNullOrWhiteSpace(comp.OverrideLabel),
                IsManuallyAdded = comp.IsManuallyAdded,
                IsZeroValue = effectiveNumeric.Value == 0m
            };

            switch (comp.Category)
            {
                case ComponentCategories.Deduction:
                    model.VisibleDeductions.Add(row);
                    break;
                case ComponentCategories.EmployerContribution:
                    model.VisibleEmployerContributions.Add(row);
                    break;
                case ComponentCategories.Earning:
                case ComponentCategories.Allowance:
                case ComponentCategories.CustomMonetary:
                default:
                    model.VisibleEarnings.Add(row);
                    break;
            }
        }

        decimal sumVisibleEarnings = model.VisibleEarnings.Sum(x => x.Amount);
        decimal sumVisibleDeductions = model.VisibleDeductions.Sum(x => x.Amount);

        model.CalculatedEarningsTotal = sumVisibleEarnings;
        model.CalculatedDeductionsTotal = sumVisibleDeductions;

        bool anyEarningEdited = orderedComponents.Any(c =>
            (c.Category == ComponentCategories.Earning ||
             c.Category == ComponentCategories.Allowance ||
             c.Category == ComponentCategories.CustomMonetary) &&
            (c.HasManualOverride || c.IsManuallyAdded || c.ExplicitVisibilityOverride.HasValue));

        bool anyDeductionEdited = orderedComponents.Any(c =>
            c.Category == ComponentCategories.Deduction &&
            (c.HasManualOverride || c.IsManuallyAdded || c.ExplicitVisibilityOverride.HasValue));

        if (!record.OverrideGrossSalary.HasValue && (anyEarningEdited || !record.ImportedGrossSalary.HasValue))
        {
            model.GrossSalary = sumVisibleEarnings;
            model.IsGrossOverridden = anyEarningEdited;
        }

        if (!record.OverrideTotalDeductions.HasValue && (anyDeductionEdited || !record.ImportedTotalDeductions.HasValue))
        {
            model.TotalDeductions = sumVisibleDeductions;
            model.IsTotalDeductionsOverridden = anyDeductionEdited;
        }

        if (!record.OverrideNetSalary.HasValue &&
            (anyEarningEdited || anyDeductionEdited || record.OverrideGrossSalary.HasValue || record.OverrideTotalDeductions.HasValue || !record.ImportedNetSalary.HasValue))
        {
            decimal effectiveGross = model.GrossSalary ?? sumVisibleEarnings;
            decimal effectiveDed = model.TotalDeductions ?? sumVisibleDeductions;
            model.NetSalary = effectiveGross - effectiveDed;
            model.IsNetSalaryOverridden = anyEarningEdited || anyDeductionEdited || record.OverrideGrossSalary.HasValue || record.OverrideTotalDeductions.HasValue;
        }

        if (model.GrossSalary.HasValue && model.VisibleEarnings.Count > 0 && Math.Abs(sumVisibleEarnings - model.GrossSalary.Value) > 0.01m)
        {
            model.IntegrityWarnings.Add(
                $"Note: Supplied Gross Salary ({FormatIndianAmount(model.GrossSalary.Value, model.CurrencySymbol)}) differs from the sum of visible earnings ({FormatIndianAmount(sumVisibleEarnings, model.CurrencySymbol)}). Displayed Gross Salary preserves the supplied/approved value.");
        }

        if (model.TotalDeductions.HasValue && model.VisibleDeductions.Count > 0 && Math.Abs(sumVisibleDeductions - model.TotalDeductions.Value) > 0.01m)
        {
            model.IntegrityWarnings.Add(
                $"Note: Supplied Total Deductions ({FormatIndianAmount(model.TotalDeductions.Value, model.CurrencySymbol)}) differs from the sum of visible deductions ({FormatIndianAmount(sumVisibleDeductions, model.CurrencySymbol)}). Displayed Total Deductions preserves the supplied/approved value.");
        }

        if (model.GrossSalary.HasValue && model.TotalDeductions.HasValue && model.NetSalary.HasValue)
        {
            decimal expectedNet = model.GrossSalary.Value - model.TotalDeductions.Value;
            if (Math.Abs(expectedNet - model.NetSalary.Value) > 0.01m)
            {
                model.IntegrityWarnings.Add(
                    $"Note: Supplied Net Salary ({FormatIndianAmount(model.NetSalary.Value, model.CurrencySymbol)}) does not equal Gross Salary minus Total Deductions ({FormatIndianAmount(expectedNet, model.CurrencySymbol)}).");
            }
        }

        if (model.NetSalary.HasValue && styleConfig.ShowAmountInWords)
        {
            model.NetSalaryInWords = ConvertAmountToIndianWords(model.NetSalary.Value, model.CurrencyCode);
        }

        model.VisibleMetadataFields = model.VisibleMetadataFields
            .OrderBy(m => MetadataFieldPriority(m.ComponentKey, m.Label))
            .ToList();

        return model;
    }

    public static string NormalizeMetadataDisplayLabel(string componentKey, string originalLabel, string? overrideLabel)
    {
        if (!string.IsNullOrWhiteSpace(overrideLabel) &&
            !string.Equals(overrideLabel.Trim(), originalLabel.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return overrideLabel.Trim();
        }

        string k = componentKey.Trim().ToLowerInvariant();
        string lbl = (!string.IsNullOrWhiteSpace(overrideLabel) ? overrideLabel : originalLabel).Trim().ToLowerInvariant();

        if (k == "meta_location" || lbl is "location" or "work location" or "branch" or "city" or "office location" or "place of posting")
            return "Location";

        if (k == "meta_doj" || lbl is "date of joining" or "doj" or "joining date" or "date joined")
            return "Date of Joining";

        if (k == "meta_pan" || lbl is "pan" or "pan number" or "pan no" or "pan card" or "income tax pan")
            return "PAN Number";

        if (k == "meta_bank" || lbl is "bank account" or "account number" or "bank a/c" or "account no" or "bank account no" or "bank account number" or "a/c no")
            return "Bank Account";

        return !string.IsNullOrWhiteSpace(overrideLabel) ? overrideLabel.Trim() : originalLabel.Trim();
    }

    private static int MetadataFieldPriority(string componentKey, string label)
    {
        string k = componentKey.Trim().ToLowerInvariant();
        string l = label.Trim().ToLowerInvariant();

        if (k == "meta_location" || l == "location") return 1;
        if (k == "meta_doj" || l == "date of joining") return 2;
        if (k == "meta_pan" || l == "pan number") return 3;
        if (k == "meta_bank" || l == "bank account") return 4;
        return 10;
    }

    public static (bool IsVisible, string Reason) EvaluateVisibility(
        PayrollComponentValue comp,
        decimal? effectiveNumeric,
        string? effectiveText,
        bool showZeroRows)
    {
        // Rule 4: Empty, whitespace-only, null or missing values are ALWAYS suppressed.
        bool isTextCategory = comp.Category == ComponentCategories.CustomText || comp.Category == ComponentCategories.Metadata;

        if (isTextCategory)
        {
            if (string.IsNullOrWhiteSpace(effectiveText) && !effectiveNumeric.HasValue)
            {
                return (false, "Suppressed: Empty / blank cell for this employee");
            }
            if (comp.ExplicitVisibilityOverride == false)
            {
                return (false, "Hidden by operator presentation setting");
            }
            return (true, "Visible: Populated text field");
        }

        // Monetary component
        if (!effectiveNumeric.HasValue)
        {
            return (false, "Suppressed: Blank / unpopulated for this employee");
        }

        if (comp.ExplicitVisibilityOverride.HasValue)
        {
            return comp.ExplicitVisibilityOverride.Value
                ? (true, "Visible: Explicitly shown by operator")
                : (false, "Hidden: Explicitly hidden by operator");
        }

        if (effectiveNumeric.Value == 0m)
        {
            return showZeroRows
                ? (true, "Visible: Zero-value rows enabled in configuration")
                : (false, "Suppressed by default zero-value display policy (0 preserved in source record)");
        }

        return (true, "Visible: Non-zero salary component");
    }

    public static PayslipTemplateConfig ResolveEffectiveStyleConfig(
        PayrollRecord record,
        CompanySettings companySettings,
        PayslipTemplate? template)
    {
        PayslipTemplateConfig config = new()
        {
            ShowZeroValueRows = companySettings.ShowZeroValueComponentsByDefault,
            ShowAmountInWords = companySettings.ShowAmountInWordsByDefault
        };

        if (template != null && !string.IsNullOrWhiteSpace(template.ConfigJson))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<PayslipTemplateConfig>(template.ConfigJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (parsed != null)
                {
                    config = parsed;
                }
            }
            catch
            {
                // Fallback to default config if JSON is malformed
            }
        }

        if (!string.IsNullOrWhiteSpace(record.PresentationOverridesJson))
        {
            try
            {
                var recordOverride = JsonSerializer.Deserialize<PayslipTemplateConfig>(record.PresentationOverridesJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (recordOverride != null)
                {
                    config = recordOverride;
                }
            }
            catch
            {
                // Keep template config
            }
        }

        if (record.ShowZeroValueRowsOverride.HasValue)
        {
            config.ShowZeroValueRows = record.ShowZeroValueRowsOverride.Value;
        }

        if (!string.IsNullOrWhiteSpace(config.FooterDisclaimerText))
        {
            config.FooterDisclaimerText = config.FooterDisclaimerText.Replace("PaySlip Studio", "FINORA");
        }

        return config;
    }

    public static string FormatIndianAmount(decimal amount, string currencySymbol = "₹")
    {
        bool isNegative = amount < 0;
        decimal abs = Math.Abs(amount);
        long wholePart = (long)Math.Floor(abs);
        int paise = (int)Math.Round((abs - wholePart) * 100m);

        string formattedWhole = FormatIndianWholeNumber(wholePart);
        string decimals = paise > 0 ? $".{paise:D2}" : ".00";
        string prefix = string.IsNullOrEmpty(currencySymbol) ? "" : $"{currencySymbol}";
        return isNegative ? $"-{prefix}{formattedWhole}{decimals}" : $"{prefix}{formattedWhole}{decimals}";
    }

    private static string FormatIndianWholeNumber(long number)
    {
        if (number < 1000)
            return number.ToString(CultureInfo.InvariantCulture);

        long lastThree = number % 1000;
        long remaining = number / 1000;
        var groups = new List<string>();
        while (remaining > 0)
        {
            if (remaining >= 100)
            {
                groups.Insert(0, (remaining % 100).ToString("D2", CultureInfo.InvariantCulture));
            }
            else
            {
                groups.Insert(0, remaining.ToString(CultureInfo.InvariantCulture));
            }
            remaining /= 100;
        }
        return $"{string.Join(",", groups)},{lastThree:D3}";
    }

    public static string ConvertAmountToIndianWords(decimal amount, string currencyCode = "INR")
    {
        if (amount == 0)
            return "Rupees Zero Only";

        bool isNegative = amount < 0;
        decimal abs = Math.Abs(amount);
        long rupees = (long)Math.Floor(abs);
        int paise = (int)Math.Round((abs - rupees) * 100m);

        string currencyPrefix = string.Equals(currencyCode, "INR", StringComparison.OrdinalIgnoreCase)
            ? "Rupees"
            : currencyCode.ToUpperInvariant();

        string words = $"{currencyPrefix} {NumberToIndianWords(rupees)}";
        if (paise > 0)
        {
            words += $" and {NumberToIndianWords(paise)} Paise";
        }
        words += " Only";
        return isNegative ? $"Minus {words}" : words;
    }

    private static readonly string[] UnitsMap =
    [
        "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
    ];

    private static readonly string[] TensMap =
    [
        "Zero", "Ten", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
    ];

    private static string NumberToIndianWords(long number)
    {
        if (number == 0)
            return "Zero";

        var parts = new List<string>();

        if ((number / 10000000) > 0)
        {
            parts.Add($"{NumberToIndianWords(number / 10000000)} Crore");
            number %= 10000000;
        }

        if ((number / 100000) > 0)
        {
            parts.Add($"{NumberToIndianWords(number / 100000)} Lakh");
            number %= 100000;
        }

        if ((number / 1000) > 0)
        {
            parts.Add($"{NumberToIndianWords(number / 1000)} Thousand");
            number %= 1000;
        }

        if ((number / 100) > 0)
        {
            parts.Add($"{NumberToIndianWords(number / 100)} Hundred");
            number %= 100;
        }

        if (number > 0)
        {
            if (number < 20)
                parts.Add(UnitsMap[number]);
            else
            {
                string tenWord = TensMap[number / 10];
                if ((number % 10) > 0)
                    tenWord += $"-{UnitsMap[number % 10]}";
                parts.Add(tenWord);
            }
        }

        return string.Join(" ", parts);
    }
}
