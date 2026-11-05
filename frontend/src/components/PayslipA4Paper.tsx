import React from 'react';
import type { PayslipDocumentModel, ResolvedPayslipComponentRow, CustomPayslipTable, CustomPayslipTableRow } from '../types/payroll';
interface PayslipA4PaperProps {
  doc: PayslipDocumentModel;
  scale?: number;
}
export const PayslipA4Paper: React.FC<PayslipA4PaperProps> = ({ doc, scale = 1 }) => {
  const cfg = doc.styleConfig;
  // Dynamic Theme & Corporate Design System Tokens (bound to Template & Layout -> 4. Color & Theme)
  const isValidHex = (val?: string) => Boolean(val && /^#[0-9A-Fa-f]{6}$/.test(val.trim()));
  const orange = isValidHex(cfg.primaryAccentColor) ? cfg.primaryAccentColor.trim() : '#F47721';
  const softOrange = isValidHex(cfg.subtleAccentSurfaceColor)
    ? cfg.subtleAccentSurfaceColor.trim()
    : '#FFF3E8';
  const subtleOrange = isValidHex(cfg.subtleAccentSurfaceColor)
    ? cfg.subtleAccentSurfaceColor.trim()
    : '#FFF8F3';
  const paperWhite = isValidHex(cfg.documentBackgroundColor)
    ? cfg.documentBackgroundColor.trim()
    : '#FFFFFF';
  const borderGray = isValidHex(cfg.borderColor) ? cfg.borderColor.trim() : '#E5E7EB';
  const textMain = isValidHex(cfg.primaryTextColor) ? cfg.primaryTextColor.trim() : '#1F2937';
  const textSecondary = '#6B7280';
  const textMuted = '#9CA3AF';
  const baseFontPt = Math.min(Math.max(cfg.baseFontSizePt || 10, 8.5), 12.5);
  const marginMm = Math.min(Math.max(cfg.pageMarginMm || 14, 10), 24);
  const rowPadPx = Math.min(Math.max(cfg.rowVerticalPaddingPx || 7, 4), 14);
  const sectionGapPx = Math.min(Math.max(cfg.sectionSpacingPx || 16, 10), 28);
  const fontFamily =
    cfg.fontFamily && cfg.fontFamily !== 'System Sans'
      ? `'${cfg.fontFamily}', 'Figtree', sans-serif`
      : `'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  const rawSectionOrder =
    cfg.sectionOrder && cfg.sectionOrder.length > 0
      ? cfg.sectionOrder
      : [
          'Header',
          'TitleBanner',
          'EmployeeDetails',
          'SalaryTables',
          'CustomTables',
          'CustomFields',
          'TotalsSummary',
          'NetSalaryBanner',
          'SignatureBlock',
          'Footer',
        ];

  // Defensively normalize section order so CustomTables ALWAYS renders before TotalsSummary & NetSalaryBanner
  const sectionOrder = (() => {
    const list = [...rawSectionOrder];
    const customIdx = list.indexOf('CustomTables');
    const totalsIdx = list.indexOf('TotalsSummary');
    const netIdx = list.indexOf('NetSalaryBanner');
    const salaryIdx = list.indexOf('SalaryTables');

    if (customIdx !== -1) {
      if ((totalsIdx !== -1 && customIdx > totalsIdx) || (netIdx !== -1 && customIdx > netIdx)) {
        list.splice(customIdx, 1);
        const insertIdx = salaryIdx !== -1 ? salaryIdx + 1 : (totalsIdx !== -1 ? totalsIdx : 0);
        list.splice(insertIdx, 0, 'CustomTables');
      }
    } else if (!list.some((k) => k.startsWith('CustomTable_'))) {
      if (salaryIdx !== -1) {
        list.splice(salaryIdx + 1, 0, 'CustomTables');
      } else if (totalsIdx !== -1) {
        list.splice(totalsIdx, 0, 'CustomTables');
      } else if (netIdx !== -1) {
        list.splice(netIdx, 0, 'CustomTables');
      } else {
        list.push('CustomTables');
      }
    }
    return list;
  })();
  // Build Employee Details pairs dynamically (never render empty metadata)
  const employeeInfoItems: Array<{ label: string; value: string }> = [];
  if (cfg.showEmployeeId !== false && doc.employeeCode && doc.employeeCode.trim().length > 0) {
    employeeInfoItems.push({ label: 'Employee ID', value: doc.employeeCode.trim() });
  }
  if (cfg.showEmployeeName !== false && doc.employeeName && doc.employeeName.trim().length > 0) {
    employeeInfoItems.push({ label: 'Employee Name', value: doc.employeeName.trim() });
  }
  if (cfg.showEmployeeEmail !== false && doc.employeeEmail && doc.employeeEmail.trim().length > 0) {
    employeeInfoItems.push({ label: 'Email', value: doc.employeeEmail.trim() });
  }
  if (cfg.showDepartment !== false && doc.department && doc.department.trim().length > 0) {
    employeeInfoItems.push({ label: 'Department', value: doc.department.trim() });
  }
  if (cfg.showDesignation !== false && doc.designation && doc.designation.trim().length > 0) {
    employeeInfoItems.push({ label: 'Designation', value: doc.designation.trim() });
  }
  if (cfg.showPayrollPeriodInDetails !== false && doc.periodLabel && doc.periodLabel.trim().length > 0) {
    employeeInfoItems.push({ label: 'Pay Period', value: doc.periodLabel.trim() });
  }
  for (const meta of doc.visibleMetadataFields || []) {
    if (meta.value && meta.value.trim().length > 0) {
      employeeInfoItems.push({ label: meta.label, value: meta.value.trim() });
    }
  }
  const renderLogoMark = () => {
    if (!cfg.showLogo) return null;
    if (doc.logoDataUrl) {
      return (
        <img
          src={doc.logoDataUrl}
          alt={doc.companyName}
          style={{ height: `${cfg.logoHeightPx || 44}px`, maxWidth: '160px', objectFit: 'contain' }}
        />
      );
    }
    return (
      <div
        className="flex items-center justify-center shrink-0 select-none"
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '8px',
          backgroundColor: orange,
          color: '#FFFFFF',
          fontWeight: 700,
          fontSize: '14px',
          letterSpacing: '0.04em',
        }}
      >
        {(doc.companyName || 'CORP').slice(0, 5)}
      </div>
    );
  };
  // Section 16: Organization Header + Orange Divider Line
  const renderHeader = () => {
    const emailStr = cfg.showCompanyContact
      ? (doc.companyContactEmail || doc.companyEmail || '').trim()
      : '';
    const phoneStr = cfg.showCompanyContact
      ? (doc.companyContactPhone || doc.companyPhone || '').trim()
      : '';
    const webStr = cfg.showCompanyWebsite ? (doc.companyWebsite || '').trim() : '';

    interface ContactItem {
      type: 'email' | 'phone' | 'website';
      text: string;
      href?: string;
    }

    const contactItems: ContactItem[] = [];
    if (emailStr) {
      contactItems.push({ type: 'email', text: emailStr, href: `mailto:${emailStr}` });
    }
    if (phoneStr && !emailStr.includes(phoneStr)) {
      const displayPhone = phoneStr.startsWith('Ph:') || phoneStr.startsWith('Tel:') ? phoneStr : `Ph: ${phoneStr}`;
      contactItems.push({ type: 'phone', text: displayPhone, href: `tel:${phoneStr.replace(/[^0-9+]/g, '')}` });
    }
    if (webStr && !emailStr.includes(webStr)) {
      const fullUrl = webStr.startsWith('http://') || webStr.startsWith('https://') ? webStr : `https://${webStr}`;
      contactItems.push({ type: 'website', text: webStr, href: fullUrl });
    }

    const renderContactItem = (item: ContactItem) => {
      if (item.type === 'website' && item.href) {
        return (
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline font-medium inline-block whitespace-nowrap cursor-pointer transition-colors"
            style={{ color: orange }}
            onClick={(e) => {
              if ((window as any).electronAPI?.openExternal) {
                e.preventDefault();
                (window as any).electronAPI.openExternal(item.href);
              }
            }}
          >
            {item.text}
          </a>
        );
      }
      return <span className="inline-block whitespace-nowrap">{item.text.replace(/-/g, '\u2011')}</span>;
    };
    return (
      <div key="Header" style={{ marginBottom: `${sectionGapPx * 0.75}px` }}>
        {cfg.headerAlignment === 'Center' ? (
          <div className="flex flex-col items-center text-center">
            {cfg.showLogo && <div className="mb-2.5">{renderLogoMark()}</div>}
            <div
              style={{
                color: textMain,
                fontSize: `${baseFontPt + 4.5}pt`,
                fontWeight: 700,
                lineHeight: 1.25,
              }}
            >
              {doc.companyName}
            </div>
            {cfg.showCompanySubtitle && doc.companySubtitle && (
              <div
                style={{
                  color: orange,
                  fontSize: `${baseFontPt}pt`,
                  fontWeight: 600,
                  marginTop: '2px',
                }}
              >
                {doc.companySubtitle}
              </div>
            )}
            {cfg.showCompanyAddress && doc.companyAddress && (
              <div style={{ color: textSecondary, fontSize: `${baseFontPt - 1}pt`, marginTop: '3px' }}>
                {doc.companyAddress}
              </div>
            )}
            {contactItems.length > 0 && (
              <div style={{ color: textSecondary, fontSize: `${baseFontPt - 1}pt`, marginTop: '2px' }}>
                {contactItems.map((item, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span>  ·  </span>}
                    {renderContactItem(item)}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        ) : cfg.headerAlignment === 'Split' ? (
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4 flex-1 min-w-0 pr-4">
              {renderLogoMark()}
              <div className="flex-1 min-w-0">
                <div
                  style={{
                    color: textMain,
                    fontSize: `${cfg.companyNameFontSizePt || baseFontPt + 3.5}pt`,
                    fontWeight: 700,
                    lineHeight: 1.25,
                  }}
                >
                  {doc.companyName}
                </div>
                {cfg.showCompanySubtitle && doc.companySubtitle && (
                  <div
                    style={{
                      color: orange,
                      fontSize: `${baseFontPt - 0.5}pt`,
                      fontWeight: 600,
                      marginTop: '3px',
                    }}
                  >
                    {doc.companySubtitle}
                  </div>
                )}
                {cfg.showAuthorizedIdentifiers && doc.authorizedIdentifiers && (
                  <div style={{ color: textMuted, fontSize: `${baseFontPt - 1.5}pt`, marginTop: '3px' }}>
                    {doc.authorizedIdentifiers}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 max-w-[42%] flex flex-col items-end justify-start">
              {cfg.showCompanyAddress && doc.companyAddress && (
                <div style={{ color: textSecondary, fontSize: `${baseFontPt - 1.5}pt`, lineHeight: 1.4 }}>
                  {doc.companyAddress}
                </div>
              )}
              {contactItems.length > 0 && (
                <div
                  className="flex flex-col items-end gap-0.5"
                  style={{ color: textSecondary, fontSize: `${baseFontPt - 1.5}pt`, marginTop: '3px', lineHeight: 1.4 }}
                >
                  {contactItems.length <= 2 ? (
                    <div>
                      {contactItems.map((item, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-gray-400">  ·  </span>}
                          {renderContactItem(item)}
                        </React.Fragment>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div>
                        {contactItems.slice(0, 2).map((item, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <span className="text-gray-400">  ·  </span>}
                            {renderContactItem(item)}
                          </React.Fragment>
                        ))}
                      </div>
                      <div>
                        {contactItems.slice(2).map((item, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <span className="text-gray-400">  ·  </span>}
                            {renderContactItem(item)}
                          </React.Fragment>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            {renderLogoMark()}
            <div className="flex-1">
              <div
                style={{
                  color: textMain,
                  fontSize: `${cfg.companyNameFontSizePt || baseFontPt + 4}pt`,
                  fontWeight: 700,
                  lineHeight: 1.25,
                }}
              >
                {doc.companyName}
              </div>
              {cfg.showCompanySubtitle && doc.companySubtitle && (
                <div
                  style={{
                    color: orange,
                    fontSize: `${baseFontPt - 0.5}pt`,
                    fontWeight: 600,
                    marginTop: '2px',
                  }}
                >
                  {doc.companySubtitle}
                </div>
              )}
              {cfg.showCompanyAddress && doc.companyAddress && (
                <div style={{ color: textSecondary, fontSize: `${baseFontPt - 1}pt`, marginTop: '3px' }}>
                  {doc.companyAddress}
                </div>
              )}
              {contactItems.length > 0 && (
                <div style={{ color: textSecondary, fontSize: `${baseFontPt - 1}pt`, marginTop: '2px' }}>
                  {contactItems.map((item, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span>  ·  </span>}
                      {renderContactItem(item)}
                    </React.Fragment>
                  ))}
                </div>
              )}
              {cfg.showAuthorizedIdentifiers && doc.authorizedIdentifiers && (
                <div style={{ color: textMuted, fontSize: `${baseFontPt - 1.5}pt`, marginTop: '2px' }}>
                  {doc.authorizedIdentifiers}
                </div>
              )}
            </div>
          </div>
        )}
        {/* Crisp Corporate Divider Line */}
        {cfg.showHeaderDivider !== false && (
          <div
            className="mt-3.5 w-full"
            style={{
              height: `${cfg.headerDividerThicknessPt || 2}px`,
              backgroundColor: cfg.headerDividerColor || orange,
            }}
          />
        )}
      </div>
    );
  };
  // Section 16: Main Title (PAYSLIP + Month Year)
  const renderTitleBanner = () => {
    const bannerBg = cfg.titleBannerBgColor || subtleOrange;
    const titleColor = cfg.titleBannerTitleColor || textMain;
    const periodColor = cfg.titleBannerPeriodColor || orange;
    return (
      <div
        key="TitleBanner"
        className="flex items-baseline justify-between py-2 px-3 rounded-[6px]"
        style={{
          backgroundColor: bannerBg,
          borderBottom: `1px solid ${borderGray}`,
          marginBottom: `${sectionGapPx}px`,
        }}
      >
        <div
          style={{
            color: titleColor,
            fontSize: `${baseFontPt + 2.5}pt`,
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}
        >
          {cfg.documentTitle || 'PAYSLIP'}
        </div>
        <div
          style={{
            color: periodColor,
            fontSize: `${baseFontPt + 0.5}pt`,
            fontWeight: 600,
          }}
        >
          {cfg.periodPresentationPrefix
            ? `${cfg.periodPresentationPrefix} ${doc.periodLabel}`
            : doc.periodLabel}
        </div>
      </div>
    );
  };
  // Section 17: Clean Two-Column Employee Information (no heavy card boxes)
  const renderEmployeeDetails = () => {
    if (employeeInfoItems.length === 0) return null;
    const cols = cfg.employeeDetailsColumns === 3 ? 3 : 2;
    const showBorder = cfg.enableBorders !== false && cfg.showEmployeeDetailsBorder !== false;
    const bThickness = cfg.borderThicknessPt || 1;
    const bColor = cfg.borderColor || borderGray;
    return (
      <div
        key="EmployeeDetails"
        className="py-3"
        style={{
          borderTop: showBorder ? `${bThickness}px solid ${bColor}` : 'none',
          borderBottom: showBorder ? `${bThickness}px solid ${bColor}` : 'none',
          marginBottom: `${sectionGapPx}px`,
        }}
      >
        <div
          className="grid gap-y-2 gap-x-8"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          }}
        >
          {employeeInfoItems.map((item, idx) => (
            <div key={idx} className="flex items-baseline justify-between gap-3 py-0.5">
              <span
                style={{
                  color: textSecondary,
                  fontSize: `${baseFontPt - 0.5}pt`,
                  fontWeight: 500,
                }}
              >
                {item.label}
              </span>
              <span
                className="text-right"
                style={{
                  color: textMain,
                  fontSize: `${baseFontPt}pt`,
                  fontWeight: 600,
                }}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };
  // Section 18: Clean White Table + Thin Gray Borders + Orange Heading Accent
  const renderSingleComponentTable = (
    title: string,
    rows: ResolvedPayslipComponentRow[],
    labelPercent: number = 65,
    minRowCount: number = 0
  ) => {
    const alignRight = cfg.amountAlignment !== 'Left';
    const showOuter = cfg.enableBorders !== false && cfg.showSalaryTablesBorder !== false;
    const bThickness = cfg.borderThicknessPt || 1;
    const bColor = cfg.borderColor || borderGray;
    const rowBorders = cfg.enableRowBorders !== false;
    const rowMode = cfg.rowBorderMode || 'All';
    const rowThickness = cfg.rowBorderThicknessPt || 1;
    const rowColor = cfg.rowBorderColor || bColor;
    const colBorders = Boolean(cfg.enableColumnBorders);
    const colThickness = cfg.columnBorderThicknessPt || 1;
    const colColor = cfg.columnBorderColor || bColor;
    const headerBorderBottom =
      rowBorders && (rowMode === 'All' || rowMode === 'HeaderOnly')
        ? `${rowThickness}px solid ${rowColor}`
        : 'none';
    const effLabelPercent = Math.min(Math.max(labelPercent || 65, 40), 80);
    const effAmountPercent = 100 - effLabelPercent;
    return (
      <div
        className="overflow-hidden"
        style={{
          border: showOuter ? `${bThickness}px solid ${bColor}` : 'none',
          borderRadius: showOuter ? '4px' : '0px',
          backgroundColor: paperWhite,
        }}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                colSpan={2}
                className="text-left"
                style={{
                  backgroundColor: paperWhite,
                  color: orange,
                  padding: '7px 10px',
                  fontSize: `${baseFontPt}pt`,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  borderBottom: `2px solid ${orange}`,
                }}
              >
                {title}
              </th>
            </tr>
            <tr
              style={{
                backgroundColor: '#F8F9FA',
                borderBottom: headerBorderBottom,
              }}
            >
              <th
                className="text-left"
                style={{
                  width: `${effLabelPercent}%`,
                  padding: '5px 10px',
                  fontSize: `${baseFontPt - 1}pt`,
                  fontWeight: 600,
                  color: textSecondary,
                  borderRight: colBorders ? `${colThickness}px solid ${colColor}` : 'none',
                }}
              >
                {cfg.componentColumnHeading || 'Particulars'}
              </th>
              <th
                className={alignRight ? 'text-right whitespace-nowrap' : 'text-left whitespace-nowrap'}
                style={{
                  width: `${effAmountPercent}%`,
                  padding: '5px 10px',
                  fontSize: `${baseFontPt - 1}pt`,
                  fontWeight: 600,
                  color: textSecondary,
                }}
              >
                {cfg.amountColumnHeading || 'Amount'}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isLast = i === rows.length - 1;
              const applyRowBorder =
                !isLast && rowBorders && (rowMode === 'All' || rowMode === 'DataOnly');
              return (
                <tr
                  key={r.componentId || `${r.componentKey}-${i}`}
                  className="payslip-row-no-split"
                  style={{
                    borderBottom: applyRowBorder ? `${rowThickness}px solid ${rowColor}` : 'none',
                  }}
                >
                  <td
                    style={{
                      width: `${effLabelPercent}%`,
                      padding: `${rowPadPx}px 10px`,
                      fontSize: `${baseFontPt}pt`,
                      color: textMain,
                      borderRight: colBorders ? `${colThickness}px solid ${colColor}` : 'none',
                    }}
                  >
                    <span>{r.displayLabel}</span>
                  </td>
                  <td
                    className={alignRight ? 'text-right tabular-nums whitespace-nowrap' : 'text-left tabular-nums whitespace-nowrap'}
                    style={{
                      width: `${effAmountPercent}%`,
                      padding: `${rowPadPx}px 10px`,
                      fontSize: `${baseFontPt}pt`,
                      fontWeight: 600,
                      color: textMain,
                    }}
                  >
                    {r.formattedAmount}
                  </td>
                </tr>
              );
            })}
            {Array.from({ length: Math.max(0, minRowCount - rows.length) }).map((_, padIdx) => {
              const isLast = (rows.length + padIdx) === minRowCount - 1;
              const applyRowBorder = !isLast && rowBorders && (rowMode === 'All' || rowMode === 'DataOnly');
              return (
                <tr
                  key={`pad-${padIdx}`}
                  className="payslip-row-no-split"
                  style={{
                    borderBottom: applyRowBorder ? `${rowThickness}px solid ${rowColor}` : 'none',
                  }}
                >
                  <td
                    style={{
                      width: `${effLabelPercent}%`,
                      padding: `${rowPadPx}px 10px`,
                      fontSize: `${baseFontPt}pt`,
                      borderRight: colBorders ? `${colThickness}px solid ${colColor}` : 'none',
                    }}
                  >
                    <span>&nbsp;</span>
                  </td>
                  <td
                    style={{
                      width: `${effAmountPercent}%`,
                      padding: `${rowPadPx}px 10px`,
                      fontSize: `${baseFontPt}pt`,
                    }}
                  >
                    <span>&nbsp;</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };
  const renderSalaryTables = () => {
    const hasEarnings = doc.visibleEarnings && doc.visibleEarnings.length > 0;
    const hasDeductions = doc.visibleDeductions && doc.visibleDeductions.length > 0;
    const hasEmployer =
      doc.visibleEmployerContributions && doc.visibleEmployerContributions.length > 0;
    if (!hasEarnings && !hasDeductions && !hasEmployer) return null;
    const sideBySide = cfg.tableLayoutMode !== 'Stacked' && hasEarnings && hasDeductions;
    const maxSalaryRows = 0;
    const tableWidth = cfg.tableWidthPercent || 100;
    const gap = cfg.tableSpacingPx !== undefined ? cfg.tableSpacingPx : 16;
    const earnLabelW = cfg.earningsLabelWidthPercent || 65;
    const dedLabelW = cfg.deductionsLabelWidthPercent || 65;
    return (
      <div
        key="SalaryTables"
        className="mx-auto"
        style={{
          width: `${tableWidth}%`,
          marginBottom: `${sectionGapPx}px`,
        }}
      >
        {sideBySide ? (
          <div className="grid grid-cols-2 items-start" style={{ gap: `${gap}px` }}>
            {renderSingleComponentTable(
              cfg.earningsSectionHeading || 'EARNINGS & ALLOWANCES',
              doc.visibleEarnings,
              earnLabelW,
              maxSalaryRows
            )}
            {renderSingleComponentTable(
              cfg.deductionsSectionHeading || 'DEDUCTIONS & RECOVERIES',
              doc.visibleDeductions,
              dedLabelW,
              maxSalaryRows
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {hasEarnings &&
              renderSingleComponentTable(
                cfg.earningsSectionHeading || 'EARNINGS & ALLOWANCES',
                doc.visibleEarnings,
                earnLabelW
              )}
            {hasDeductions &&
              renderSingleComponentTable(
                cfg.deductionsSectionHeading || 'DEDUCTIONS & RECOVERIES',
                doc.visibleDeductions,
                dedLabelW
              )}
          </div>
        )}
        {hasEmployer && (
          <div className="mt-3">
            {renderSingleComponentTable(
              'EMPLOYER CONTRIBUTIONS',
              doc.visibleEmployerContributions,
              65
            )}
          </div>
        )}
      </div>
    );
  };
  const renderCustomTextFields = () => {
    if (
      !cfg.showCustomTextFieldsSection ||
      !doc.visibleCustomTextFields ||
      doc.visibleCustomTextFields.length === 0
    ) {
      return null;
    }
    const showBorder = cfg.enableBorders !== false && cfg.showSalaryTablesBorder !== false;
    const bThickness = cfg.borderThicknessPt || 1;
    const bColor = cfg.borderColor || borderGray;
    return (
      <div
        key="CustomFields"
        className="rounded-[4px] p-3"
        style={{
          border: showBorder ? `${bThickness}px solid ${bColor}` : 'none',
          marginBottom: `${sectionGapPx}px`,
        }}
      >
        <div
          className="mb-1.5"
          style={{
            color: orange,
            fontSize: `${baseFontPt - 1}pt`,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          ADDITIONAL INFORMATION
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {doc.visibleCustomTextFields.map((f, idx) => (
            <div key={idx} className="flex items-baseline justify-between gap-2">
              <span style={{ color: textSecondary, fontSize: `${baseFontPt - 0.5}pt` }}>
                {f.label}
              </span>
              <span
                style={{
                  color: textMain,
                  fontSize: `${baseFontPt - 0.5}pt`,
                  fontWeight: 600,
                }}
              >
                {f.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };
  // Section 19: Totals (Gross Salary & Total Deductions)
  const renderTotalsSummary = () => {
    if (doc.grossSalary === null && doc.totalDeductions === null) return null;
    const sym = cfg.showCurrencySymbolInRows ? doc.currencySymbol : '';
    const showBorder = cfg.enableBorders !== false && cfg.showTotalsSummaryBorder !== false;
    const bThickness = cfg.borderThicknessPt || 1;
    const bColor = cfg.borderColor || borderGray;
    return (
      <div
        key="TotalsSummary"
        className="payslip-row-no-split flex items-center justify-between rounded-[4px] px-4 py-2"
        style={{
          border: showBorder ? `${bThickness}px solid ${bColor}` : 'none',
          backgroundColor: '#F8F9FA',
          marginBottom: `${sectionGapPx * 0.75}px`,
        }}
      >
        {doc.grossSalary !== null && doc.grossSalary !== undefined ? (
          <div className="flex items-baseline gap-2.5">
            <span style={{ color: textSecondary, fontSize: `${baseFontPt}pt`, fontWeight: 500 }}>
              Gross Salary:
            </span>
            <span
              className="tabular-nums"
              style={{
                color: textMain,
                fontSize: `${baseFontPt + 0.5}pt`,
                fontWeight: 700,
              }}
            >
              {formatIndianCurrency(doc.grossSalary, sym)}
            </span>
          </div>
        ) : (
          <div />
        )}
        {doc.totalDeductions !== null && doc.totalDeductions !== undefined ? (
          <div className="flex items-baseline gap-2.5">
            <span style={{ color: textSecondary, fontSize: `${baseFontPt}pt`, fontWeight: 500 }}>
              Total Deductions:
            </span>
            <span
              className="tabular-nums"
              style={{
                color: textMain,
                fontSize: `${baseFontPt + 0.5}pt`,
                fontWeight: 700,
              }}
            >
              {formatIndianCurrency(doc.totalDeductions, sym)}
            </span>
          </div>
        ) : (
          <div />
        )}
      </div>
    );
  };
  // Section 19: NET SALARY Highlight Box
  const renderNetSalaryBanner = () => {
    if (doc.netSalary === null || doc.netSalary === undefined) return null;
    const sym = cfg.showCurrencySymbolInRows ? doc.currencySymbol : '';
    const netBg = cfg.netSalaryBgColor || softOrange;
    const netBorder = cfg.netSalaryBorderColor || orange;
    const netTitleColor = cfg.netSalaryTitleColor || textMain;
    const netWordsColor = cfg.netSalaryWordsColor || textSecondary;
    const netAmountColor = cfg.netSalaryAmountColor || orange;
    const showBorder = cfg.enableBorders !== false && cfg.showNetSalaryBorder !== false;
    const bThickness = cfg.borderThicknessPt || 1;
    return (
      <div
        key="NetSalaryBanner"
        className="payslip-row-no-split rounded-[6px] px-4 py-3"
        style={{
          backgroundColor: netBg,
          border: showBorder ? `${bThickness}px solid ${netBorder}` : 'none',
          borderLeft: showBorder ? `4px solid ${netBorder}` : 'none',
          marginBottom: `${sectionGapPx}px`,
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div
              style={{
                color: netTitleColor,
                fontSize: `${baseFontPt + 1}pt`,
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              {cfg.netSalaryLabel || 'NET SALARY PAYABLE'}
            </div>
            {cfg.showAmountInWords && doc.netSalaryInWords && (
              <div
                className="mt-0.5"
                style={{
                  color: netWordsColor,
                  fontSize: `${baseFontPt - 1}pt`,
                }}
              >
                {doc.netSalaryInWords}
              </div>
            )}
          </div>
          <div
            className="tabular-nums"
            style={{
              color: netAmountColor,
              fontSize: `${baseFontPt + 5.5}pt`,
              fontWeight: 700,
            }}
          >
            {formatIndianCurrency(doc.netSalary, sym)}
          </div>
        </div>
      </div>
    );
  };
  // Section 20: Clean Signature & Footer
  const renderSignatureBlock = () => {
    if (!cfg.showSignatureArea) return null;
    const align = cfg.signatureAlignment || 'Right';
    const topSpacing = cfg.signatureTopSpacingPx || 18;
    const lineWidth = cfg.signatureLineWidthPx || 160;
    const lineThickness = cfg.signatureLineThicknessPt || 1;
    const bColor = cfg.borderColor || borderGray;
    const showBorder = cfg.enableBorders !== false && cfg.showSignatureBorder;
    const justifyClass =
      align === 'Left'
        ? 'justify-start'
        : align === 'Center'
        ? 'justify-center'
        : 'justify-end';
    const textAlignClass =
      align === 'Left' ? 'text-left' : align === 'Center' ? 'text-center' : 'text-right';
    return (
      <div
        key="SignatureBlock"
        className={`payslip-row-no-split flex items-end ${justifyClass}`}
        style={{
          paddingTop: `${topSpacing}px`,
          marginBottom: `${sectionGapPx * 0.75}px`,
          border: showBorder ? `1px solid ${bColor}` : 'none',
          padding: showBorder ? '8px' : undefined,
        }}
      >
        {cfg.showLeftSignature && align === 'Right' && (
          <div
            className="mr-auto"
            style={{
              width: `${lineWidth}px`,
              borderTop: `${lineThickness}px solid ${bColor}`,
              paddingTop: '4px',
            }}
          >
            <div
              style={{
                color: textMain,
                fontSize: `${baseFontPt - 0.5}pt`,
                fontWeight: 600,
              }}
            >
              {cfg.leftSignatureLabel || 'Employee Signature'}
            </div>
          </div>
        )}
        <div
          className={textAlignClass}
          style={{
            width: `${lineWidth}px`,
            borderTop: `${lineThickness}px solid ${textMain}`,
            paddingTop: '4px',
          }}
        >
          {cfg.signatoryName && (
            <div
              style={{
                color: textMain,
                fontSize: `${baseFontPt}pt`,
                fontWeight: 700,
              }}
            >
              {cfg.signatoryName}
            </div>
          )}
          <div
            style={{
              color: textMain,
              fontSize: `${baseFontPt - 0.5}pt`,
              fontWeight: 600,
            }}
          >
            {cfg.rightSignatureLabel || 'Authorized Signatory'}
          </div>
          {cfg.signatoryDesignation && (
            <div
              style={{
                color: textSecondary,
                fontSize: `${baseFontPt - 1.5}pt`,
              }}
            >
              {cfg.signatoryDesignation}
            </div>
          )}
          {cfg.rightSignatureSubtext && (
            <div
              style={{
                color: textSecondary,
                fontSize: `${baseFontPt - 1.5}pt`,
              }}
            >
              {cfg.rightSignatureSubtext}
            </div>
          )}
        </div>
      </div>
    );
  };
  const renderFooter = () => {
    if (!cfg.showFooterDisclaimer && !doc.customFooterNotes) return null;
    const showBorder = cfg.enableBorders !== false && cfg.showFooterBorder !== false;
    const bThickness = cfg.borderThicknessPt || 1;
    const bColor = cfg.borderColor || borderGray;
    return (
      <div
        key="Footer"
        className="payslip-row-no-split pt-3 mt-auto"
        style={{
          borderTop: showBorder ? `${bThickness}px solid ${bColor}` : 'none',
        }}
      >
        {doc.customFooterNotes && (
          <div
            className="mb-1.5 text-center"
            style={{
              color: textSecondary,
              fontSize: `${baseFontPt - 0.5}pt`,
            }}
          >
            <span className="font-semibold text-gray-700">Notes: </span>
            <span className="italic">{doc.customFooterNotes}</span>
          </div>
        )}
        {cfg.showFooterDisclaimer && (
          <div
            className="text-center"
            style={{
              color: textSecondary,
              fontSize: `${baseFontPt - 1.5}pt`,
            }}
          >
            {(
              cfg.footerDisclaimerText ||
              'This is an official payroll document generated by FINORA — Finance & Payroll Management System.'
            ).replace(/PaySlip Studio/g, 'FINORA')}
          </div>
        )}
      </div>
    );
  };
  const customTables: CustomPayslipTable[] =
    (doc.customTables && doc.customTables.length > 0)
      ? doc.customTables
      : (cfg.customTables || []);
  const hasCustomTableInOrder = sectionOrder.some(
    (k) => k === 'CustomTables' || k.startsWith('CustomTable_')
  );
  const isCustomColRightAligned = (colName: string, cIdx: number, allRows: CustomPayslipTableRow[]) => {
    if (cIdx === 0) return false;
    const name = (colName || '').toLowerCase();
    if (
      name.includes('count') ||
      name.includes('day') ||
      name.includes('amount') ||
      name.includes('bal') ||
      name.includes('open') ||
      name.includes('avail') ||
      name.includes('close') ||
      name.includes('rate') ||
      name.includes('total') ||
      name.includes('hrs') ||
      name.includes('hour') ||
      name.includes('qty') ||
      name.includes('%') ||
      name.includes('num') ||
      name.includes('value')
    ) {
      return true;
    }
    let numCount = 0;
    for (const r of allRows) {
      const val = r.cells?.[cIdx]?.trim() || '';
      if (/[0-9]/.test(val)) numCount++;
    }
    return numCount >= (allRows.length + 1) / 2;
  };
  const renderCustomTable = (table: CustomPayslipTable, inGrid = false, minRowCount = 0) => {
    if (!table || table.isVisible === false) return null;
    const columns = table.columns || [];
    const rows = table.rows || [];
    if (columns.length === 0 && rows.length === 0) return null;
    const colAligns = columns.map((colName, cIdx) => isCustomColRightAligned(colName, cIdx, rows));
    const showBorder = (cfg.enableBorders !== false) && (table.showBorder !== false);
    const bThickness = cfg.borderThicknessPt || 1;
    const bColor = cfg.borderColor || borderGray;
    const rowBorders = cfg.enableBorders !== false && cfg.enableRowBorders !== false;
    const rowColor = cfg.rowBorderColor || borderGray;
    const rowThickness = cfg.rowBorderThicknessPt || 1;
    const colBorders = cfg.enableBorders !== false && cfg.enableColumnBorders === true;
    const colColor = cfg.columnBorderColor || borderGray;
    const colThickness = cfg.columnBorderThicknessPt || 1;
    const titleColor = table.headingTextColor || orange;
    const titleBg = table.headingBgColor || paperWhite;
    return (
      <div
        key={`custom-table-${table.id}`}
        className="payslip-row-no-split mx-auto overflow-hidden"
        style={{
          width: '100%',
          marginBottom: inGrid ? 0 : `${sectionGapPx}px`,
          border: showBorder ? `${bThickness}px solid ${bColor}` : 'none',
          borderRadius: '4px',
        }}
      >
        <table className="w-full border-collapse" style={{ tableLayout: 'auto' }}>
          <thead>
            {table.title && (
              <tr>
                <th
                  colSpan={Math.max(columns.length, 1)}
                  className="text-left"
                  style={{
                    backgroundColor: titleBg,
                    color: titleColor,
                    padding: '7px 10px',
                    fontSize: `${baseFontPt}pt`,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    borderBottom: `2px solid ${titleColor}`,
                  }}
                >
                  {table.title}
                </th>
              </tr>
            )}
            {columns.length > 0 && (
              <tr style={{ backgroundColor: '#F8F9FA', borderBottom: `1px solid ${bColor}` }}>
                {columns.map((col, cIdx) => (
                  <th
                    key={cIdx}
                    className={colAligns[cIdx] ? 'text-right whitespace-nowrap' : 'text-left whitespace-nowrap'}
                    style={{
                      padding: '5px 10px',
                      fontSize: `${baseFontPt - 1}pt`,
                      fontWeight: 600,
                      color: textSecondary,
                      borderRight: (colBorders && cIdx < columns.length - 1) ? `${colThickness}px solid ${colColor}` : 'none',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const isLast = rIdx === rows.length - 1;
              const applyRowBorder = !isLast && rowBorders;
              return (
                <tr
                  key={row.id || rIdx}
                  className="payslip-row-no-split"
                  style={{
                    borderBottom: applyRowBorder ? `${rowThickness}px solid ${rowColor}` : 'none',
                  }}
                >
                  {(row.cells || []).map((cell, cIdx) => {
                    const isRight = colAligns[cIdx];
                    return (
                      <td
                        key={cIdx}
                        className={isRight ? 'text-right tabular-nums whitespace-nowrap' : 'text-left'}
                        style={{
                          padding: `${rowPadPx}px 10px`,
                          fontSize: `${baseFontPt}pt`,
                          color: textMain,
                          fontWeight: isRight ? 600 : 400,
                          borderRight: (colBorders && cIdx < (row.cells?.length || 0) - 1) ? `${colThickness}px solid ${colColor}` : 'none',
                        }}
                      >
                        {cell && cell.trim().length > 0 ? cell : '\u00A0'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {Array.from({ length: Math.max(0, minRowCount - rows.length) }).map((_, padIdx) => {
              const isLast = (rows.length + padIdx) === minRowCount - 1;
              const applyRowBorder = !isLast && rowBorders;
              return (
                <tr
                  key={`custom-pad-${padIdx}`}
                  className="payslip-row-no-split"
                  style={{
                    borderBottom: applyRowBorder ? `${rowThickness}px solid ${rowColor}` : 'none',
                  }}
                >
                  {columns.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      style={{
                        padding: `${rowPadPx}px 10px`,
                        fontSize: `${baseFontPt}pt`,
                        borderRight: (colBorders && cIdx < columns.length - 1) ? `${colThickness}px solid ${colColor}` : 'none',
                      }}
                    >
                      &nbsp;
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };
  const renderCustomTablesGroup = (tables: CustomPayslipTable[]) => {
    const visibleTables = tables.filter((t) => t && t.isVisible !== false);
    if (visibleTables.length === 0) return null;
    const effMode = cfg.additionalTablesLayoutMode || 'Auto';
    const isSideBySide =
      effMode === 'SideBySide' || (effMode !== 'Stacked' && cfg.tableLayoutMode === 'SideBySide');
    const gap = cfg.tableSpacingPx !== undefined ? cfg.tableSpacingPx : 16;
    if (!isSideBySide) {
      return (
        <div key="CustomTablesGroup" className="space-y-3" style={{ marginBottom: `${sectionGapPx}px` }}>
          {visibleTables.map((t) => renderCustomTable(t, true))}
        </div>
      );
    }
    const rows: Array<
      | { type: 'pair'; left: CustomPayslipTable; right: CustomPayslipTable }
      | { type: 'single'; table: CustomPayslipTable; isHalf: boolean }
    > = [];
    let i = 0;
    while (i < visibleTables.length) {
      const cur = visibleTables[i];
      if (cur.layoutWidth === 'full') {
        rows.push({ type: 'single', table: cur, isHalf: false });
        i++;
      } else {
        if (i + 1 < visibleTables.length && visibleTables[i + 1].layoutWidth !== 'full') {
          rows.push({ type: 'pair', left: cur, right: visibleTables[i + 1] });
          i += 2;
        } else {
          rows.push({ type: 'single', table: cur, isHalf: cur.layoutWidth === 'half' });
          i++;
        }
      }
    }
    return (
      <div key="CustomTablesGroup" className="space-y-3" style={{ marginBottom: `${sectionGapPx}px` }}>
        {rows.map((row, rIdx) => {
          if (row.type === 'pair') {
            const maxPairRows = Math.max(row.left.rows?.length || 0, row.right.rows?.length || 0);
            return (
              <div key={`custom-pair-${rIdx}`} className="grid grid-cols-2 items-start" style={{ gap: `${gap}px` }}>
                {renderCustomTable(row.left, true, maxPairRows)}
                {renderCustomTable(row.right, true, maxPairRows)}
              </div>
            );
          }
          if (row.isHalf) {
            return (
              <div key={`custom-single-${rIdx}`} className="grid grid-cols-2 items-start" style={{ gap: `${gap}px` }}>
                {renderCustomTable(row.table, true)}
                <div />
              </div>
            );
          }
          return (
            <div key={`custom-single-${rIdx}`} className="w-full">
              {renderCustomTable(row.table, true)}
            </div>
          );
        })}
      </div>
    );
  };
  const renderSectionByKey = (key: string) => {
    if (key.startsWith('CustomTable_')) {
      const tableId = key.substring('CustomTable_'.length);
      const tbl = customTables.find((t) => t.id === tableId);
      if (tbl) return renderCustomTable(tbl);
      return null;
    }
    switch (key) {
      case 'Header':
        return renderHeader();
      case 'TitleBanner':
        return renderTitleBanner();
      case 'EmployeeDetails':
        return renderEmployeeDetails();
      case 'SalaryTables':
        return renderSalaryTables();
      case 'CustomFields':
        return renderCustomTextFields();
      case 'CustomTables':
        return renderCustomTablesGroup(customTables);
      case 'TotalsSummary':
        return (
          <React.Fragment key="TotalsSummaryFragment">
            {!hasCustomTableInOrder && customTables.length > 0 && renderCustomTablesGroup(customTables)}
            {renderTotalsSummary()}
          </React.Fragment>
        );

      case 'NetSalaryBanner':
        return renderNetSalaryBanner();
      case 'SignatureBlock':
        return renderSignatureBlock();
      case 'Footer':
        return renderFooter();
      default:
        return null;
    }
  };
  return (
    <div
      className="print-only-a4 mx-auto flex flex-col justify-between transition-all duration-150"
      style={{
        width: '210mm',
        minHeight: '297mm',
        backgroundColor: paperWhite,
        color: textMain,
        fontFamily,
        padding: `${marginMm}mm`,
        boxShadow: '0 6px 28px rgba(31, 41, 55, 0.08), 0 1px 3px rgba(31, 41, 55, 0.04)',
        border: `1px solid ${borderGray}`,
        borderRadius: '4px',
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
      }}
    >
      <div>{sectionOrder.map((k) => renderSectionByKey(k))}</div>
      {/* Bottom Page Numbering Strip */}
      <div
        className="pt-3 mt-6 flex items-center justify-between text-xs"
        style={{
          borderTop: `1px solid ${borderGray}`,
          color: textMuted,
          fontSize: `${baseFontPt - 2}pt`,
        }}
      >
        <span>
          {doc.employeeCode} · {doc.periodLabel}
        </span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  );
};
export function formatIndianCurrency(amount: number, symbol = '₹'): string {
  const isNeg = amount < 0;
  const abs = Math.abs(amount);
  const parts = abs.toFixed(2).split('.');
  const intPart = parts[0];
  const decPart = parts[1];
  let formattedInt = intPart;
  if (intPart.length > 3) {
    const lastThree = intPart.slice(-3);
    const otherNumbers = intPart.slice(0, -3);
    formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
  }
  const sign = isNeg ? '-' : '';
  return symbol ? `${sign}${symbol}${formattedInt}.${decPart}` : `${sign}${formattedInt}.${decPart}`;
}
