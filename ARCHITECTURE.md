# PaySlip Studio — System Architecture & Technical Reference

## 1. Architectural Overview

**PaySlip Studio** is designed around a strict separation between **Immutable Imported Payroll Source Data**, **Non-Destructive Operator Customizations**, and a **Deterministic Shared Document Resolution Pipeline (`PayslipDocumentModel`)** consumed identically by the React live A4 preview and the server-side **QuestPDF** engine.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     React 19 + TypeScript + Tailwind v4                    │
│                 FLOWSTACK UI (@flowstack-ui/brick v0.3.0)                  │
│   ┌──────────────────┐   ┌───────────────────────┐   ┌──────────────────┐  │
│   │ 6-Step Excel     │   │ Split-Screen Payslip  │   │ Master Multi-Tab │  │
│   │ Import Wizard    │   │ Editor + Live A4 View │   │ Workbook Export  │  │
│   └────────┬─────────┘   └───────────┬───────────┘   └────────┬─────────┘  │
└────────────┼─────────────────────────┼────────────────────────┼────────────┘
             │ HTTPS / REST JSON       │                        │
┌────────────▼─────────────────────────▼────────────────────────▼────────────┐
│               ASP.NET Core Web API (.NET 10.0 LTS / net10.0)               │
│   ┌────────────────────┐  ┌─────────────────────────┐  ┌────────────────┐  │
│   │ ExcelPayrollService│  │ PayslipDocumentResolver │  │ PdfRendering   │  │
│   │ (ClosedXML /       │  │ (17 Dynamic Row Rules & │  │ Service        │  │
│   │  ExcelDataReader)  │  │  Integrity Checks)      │  │ (QuestPDF A4)  │  │
│   └─────────┬──────────┘  └────────────┬────────────┘  └────────┬───────┘  │
│             │                          │                        │          │
│   ┌─────────▼──────────────────────────▼────────────────────────▼───────┐  │
│   │         Entity Framework Core 10 + Npgsql PostgreSQL 18             │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Dynamic Employee-Specific Salary Component Resolution (Section 8)

Implemented in [`PayslipDocumentResolver.cs`](file:///G:/UAV/PAY%20SLIP/backend/PaySlipStudio.Api/Services/PayslipDocumentResolver.cs):

1. **Cell-State Classification on Import (`ExcelPayrollService.cs`)**:
   - Every cell in an imported worksheet is classified into one of four `SourceCellType` states:
     - `"Empty"`: Cell is null, blank, or whitespace (`ImportedNumericValue = null`).
     - `"NumericZero"`: Cell contains an explicit numeric `0` or `0.00` (`ImportedNumericValue = 0m`).
     - `"NumericNonZero"`: Cell contains a non-zero numeric value (`ImportedNumericValue = value`).
     - `"Text"`: Cell contains non-numeric text metadata (`ImportedTextValue`).
2. **Per-Employee, Per-Period Row Visibility (`EvaluateRowVisibility`)**:
   - If the operator set `ExplicitVisibilityOverride` (`true` or `false`), that explicit override wins.
   - If `IsManuallyAdded == true`, the row is visible if `EffectiveNumericValue.HasValue`.
   - If `SourceCellType == "Empty"` (or `EffectiveNumericValue == null`), the row is **never** rendered (`IsVisibleOnPayslip = false`).
   - If `EffectiveNumericValue == 0m` (`SourceCellType == "NumericZero"`), the row is hidden by default (`IsVisibleOnPayslip = false`) unless `ShowZeroValueRows` is enabled on the template, company policy, or per-payslip override.
   - If `EffectiveNumericValue != 0m`, the row is rendered (`IsVisibleOnPayslip = true`).
3. **Non-Destructive Manual Overrides & Supplied Totals Integrity**:
   - `EmployeePayrollComponent` stores both `ImportedNumericValue` and `OverrideNumericValue` (`HasManualOverride`).
   - `EmployeePayrollRecord` stores `ImportedGrossSalary`, `ImportedTotalDeductions`, and `ImportedNetSalary` separately from `OverrideGrossSalary`, `OverrideTotalDeductions`, and `OverrideNetSalary`.
   - Editing an individual component never silently overwrites the supplied `GrossSalary` or `NetSalary`. Instead, `PayslipDocumentResolver` compares the sum of visible earnings (`CalculatedEarningsTotal`) and visible deductions (`CalculatedDeductionsTotal`) against the displayed totals and emits `HasIntegrityWarning = true` with detailed `IntegrityWarnings` if they differ by more than `0.01m`.

---

## 3. Database Schema (PostgreSQL 18)

Defined in [`DomainModels.cs`](file:///G:/UAV/PAY%20SLIP/backend/PaySlipStudio.Api/Models/DomainModels.cs) and [`ApplicationDbContext.cs`](file:///G:/UAV/PAY%20SLIP/backend/PaySlipStudio.Api/Data/ApplicationDbContext.cs):

- `AspNetUsers` / `AspNetRoles` (`ApplicationUser`): Identity users with role enforcement (`Administrator`, `AccountsOperator`, `Viewer`).
- `CompanySettings`: Branding, logo asset, currency formatting, SMTP metadata, and secret vault key reference.
- `Employees`: Persistent employee directory keyed by unique `EmployeeCode` (`EMP001`, etc.).
- `PayrollPeriods`: Unique `(Month, Year)` pairs (`ix_payroll_period_month_year`).
- `ImportBatches`: Full provenance of every uploaded Excel file, SHA-256 hash, column mapping JSON, and validation summary.
- `EmployeePayrollRecords`: Per-employee, per-period record storing immutable `SourceRowSnapshotJson`, imported vs. override totals, and template/style overrides.
- `EmployeePayrollComponents`: Individual salary components and metadata cells with `SourceCellType`, `ImportedNumericValue`, `OverrideNumericValue`, and `ExplicitVisibilityOverride`.
- `PayslipTemplates` & `EmailTemplates`: Reusable visual and email templates.
- `GeneratedPayslipDocuments`: Metadata and private file vault path (`App_Data/Vault/Pdfs/...`) + SHA-256 hash of every rendered PDF.
- `EmailDeliveryAttempts` & `BulkEmailJobs`: Complete delivery audit log and background job state.
- `AuditLogEntries`: Append-only security and operational audit trail.

---

## 4. FLOWSTACK UI Integration & Component Customization Report

### Installed Package Inspection
Before building the frontend, `frontend/node_modules/@flowstack-ui/brick` (`v0.3.0`), `@flowstack-ui/atom` (`v0.3.0`), and `@flowstack-ui/theme` (`v0.3.0`) were inspected along with their official package documentation (`node_modules/@flowstack-ui/brick/docs/guides/installation.md` and `dist/agents/`).

- **Stylesheet Integration**: Imported `@flowstack-ui/brick/reset.css` and `@flowstack-ui/brick/styles.css` in [`frontend/src/main.tsx`](file:///G:/UAV/PAY%20SLIP/frontend/src/main.tsx).
- **Subpath Component Imports Used**:
  - `import { Button } from '@flowstack-ui/brick/button'`
  - `import { Badge } from '@flowstack-ui/brick/badge'`
- **Documented Component Gaps & Accessible Tailwind Supplements**:
  - `@flowstack-ui/brick` `v0.3.0` provides primitive atomic elements (`button`, `badge`, `text`, `heading`, `divider`, `chip`, `card`, `tabs`, `switch`, `tooltip`) and explicitly does **not** ship form inputs (`Input`, `Select`, `Textarea`), `DataGrid`/`Table`, `Modal`/`Dialog`, or `Stepper` components.
  - In accordance with Section 2 of the specification, all data grids, split-pane visual editors, 6-step import wizard steppers, and form controls are implemented using accessible, keyboard-navigable React + Tailwind CSS v4 components styled with the AMTDC design tokens (`#F47721` primary orange, `#071747` deep navy, `#FFFFFF` paper surface, `#F7F8FA` workspace background, `Figtree` typography).

