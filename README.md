# PaySlip Studio — Enterprise Payroll Document & Dispatch System

**PaySlip Studio** is a full-stack enterprise payroll document generation, dynamic employee-specific payslip editor, server-side A4 PDF rendering, authenticated email dispatch, and monthly Excel archival application built for **AMTDC (Advanced Manufacturing Technology Development Centre)**.

---

## 1. Key Capabilities

- **Dynamic Employee-Specific Salary Component Resolution (17 Mandatory Rules)**:
  - Never uses a static list of salary rows across employees.
  - Reads every employee's actual imported spreadsheet cells per payroll period (`September 2026`, `October 2026`, `November 2026`, etc.).
  - **Blank / Empty Cells (`SourceCellType = "Empty"`)**: Completely suppressed from the payslip so employees never see empty salary rows.
  - **Numeric Zero Cells (`SourceCellType = "NumericZero"`, `0.00`)**: Preserved accurately in PostgreSQL and in the visual editor's component list, while hidden by default on the rendered payslip unless the configurable **Zero-Value Display Policy (`ShowZeroValueRows`)** is enabled.
  - **Non-Destructive Manual Overrides**: Manual edits in the Payslip Editor are stored in `OverrideNumericValue` / `OverrideLabel` / `ExplicitVisibilityOverride` while preserving `ImportedNumericValue` and the immutable `SourceRowSnapshotJson`. Operators can inspect original vs. edited values side-by-side and click **Reset to Imported Values** at any time.
  - **Supplied Totals Integrity**: Imported `Gross Salary`, `Total Deductions`, and `Net Salary` are displayed faithfully without silently recomputing them when components are customized. If manual component edits cause a discrepancy against supplied totals, a non-destructive integrity warning banner is surfaced with an optional one-click **Recalculate Totals from Visible Rows** button.
- **6-Step Guided Excel Import Wizard**:
  - Supports `.xlsx`, `.xls`, and `.csv` workbooks (up to 25 MB, formula-safe evaluation without macro execution).
  - Automatic intelligent header detection (`Employee ID`, `Employee Name`, `Email`, `Department`, `Designation`, `MetadataText`, `Earning`, `Allowance`, `Deduction`, `EmployerContribution`, `GrossSalary`, `TotalDeductions`, `NetSalary`, `CustomText`).
  - Interactive column-mapping review, cell-level validation preview, and duplicate-period detection (`ReplacePeriod` vs. `Cancel`).
- **Interactive Split-Screen Payslip Editor & Live A4 Preview**:
  - Instant search by Employee ID or Name across any payroll month/year with race-condition-free sequence guards.
  - Live client-side A4 payslip preview synchronized with server-side **QuestPDF** A4 rendering (`210mm × 297mm`, multi-page overflow support with repeated header and page numbering).
- **Authenticated SMTP & Development Sandbox Email Delivery**:
  - Tokenized email templates (`{{EmployeeName}}`, `{{EmployeeId}}`, `{{PayrollMonth}}`, `{{PayrollYear}}`, `{{CompanyName}}`, `{{NetSalary}}`).
  - Single-employee dispatch and background-queued bulk monthly email jobs with live progress tracking and retry support.
- **Single Consolidated Multi-Worksheet Master Excel Workbook Export**:
  - Exports all historical payroll months into a single `.xlsx` workbook where each payroll period (`Sep 2026`, `Oct 2026`, `Nov 2026`, etc.) is formatted into its own worksheet tab in chronological order, preserving employee-specific dynamic columns and audit columns (`Last PDF Generated`, `Email Delivery Status`).
- **Server-Enforced Role-Based Access Control (RBAC) & Immutable Audit Trail**:
  - Three roles enforced on every API endpoint: `Administrator`, `AccountsOperator`, and `Viewer`.

---

## 2. Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript 5.9, Vite 8, Tailwind CSS v4, `@flowstack-ui/brick` (`v0.3.0`), Lucide Icons |
| **Backend** | C# ASP.NET Core Web API targeting **.NET 10.0 LTS (`net10.0`)** |
| **Database & ORM** | **PostgreSQL 18** + Entity Framework Core 10 (`Npgsql.EntityFrameworkCore.PostgreSQL`) |
| **Authentication** | ASP.NET Core Identity + JWT Bearer + Role Policies + Rate Limiting + Optional TOTP MFA |
| **Excel Processing** | `ClosedXML` (`0.104.2`) + `ExcelDataReader` (`3.7.0`) |
| **PDF Rendering** | `QuestPDF` (`2025.1.2`, Community License) |
| **Email Engine** | `MailKit` + `MimeKit` (`4.11.0`) + Background Queue Worker |

---

## 3. Default Provisioned Accounts

On initial startup, `DatabaseInitializer` provisions the roles, default AMTDC company settings, 3 payslip templates, 2 email templates, and automatically imports the 3 historical sheets (`September 2026`, `October 2026`, `November 2026`) from `PaySlip_Studio_Mock_Payroll_Test_Data.xlsx`:

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@amtdc.org` | `Admin@12345!` | Full access: imports, editor, PDF, email, templates, user management, audit log, system & SMTP settings |
| **Accounts Operator** | `operator@amtdc.org` | `Operator@12345!` | Payroll operations: Excel import, payslip editing, PDF generation, email dispatch, templates, exports |
| **Viewer** | `viewer@amtdc.org` | `Viewer@12345!` | Read-only access: view dashboard, employee directory, preview payslips, download PDFs & Excel exports |

---

## 4. Quick Start & Running Locally

### Prerequisites
- **.NET 10.0 SDK** (`dotnet --version` >= `10.0.100`)
- **Node.js 20+** and `npm`
- **PostgreSQL 18** (The repository includes an initialized local PostgreSQL cluster in `.pgdata` on port `5432`, and `Program.cs` automatically starts it if not already running).

### 1. Start the ASP.NET Core Backend API (`.NET 10.0`)
```powershell
cd "G:\UAV\PAY SLIP\backend"
dotnet run --project PaySlipStudio.Api/PaySlipStudio.Api.csproj --urls "http://localhost:5080"
```
- The API listens on `http://localhost:5080` (and serves both `/api/*` endpoints and the compiled SPA from `wwwroot`).
- On startup, it automatically applies EF Core migrations (`db.Database.MigrateAsync()`) and seeds the database if empty.

### 2. Start the React + Vite Frontend Dev Server
```powershell
cd "G:\UAV\PAY SLIP\frontend"
npm install
npm run dev
```
- Open `http://localhost:5173` in your browser. Vite proxies `/api` requests to `http://localhost:5080`.

### 3. Run the Automated Test Suite
```powershell
cd "G:\UAV\PAY SLIP\backend"
dotnet test PaySlipStudio.Tests/PaySlipStudio.Tests.csproj
```
- Executes unit tests for dynamic row visibility (`PayslipDocumentResolver`), multi-page A4 PDF generation (`PdfRenderingService`), and the 27-point end-to-end integration test suite against `PaySlip_Studio_Mock_Payroll_Test_Data.xlsx`.

---

## 5. Guided Walkthrough of Core Workflows

1. **Inspect Dynamic Employee-Specific Payslips (`Payslip Editor`)**:
   - Sign in as `admin@amtdc.org` (`Admin@12345!`).
   - Open **Payslip Editor** in the left navigation bar and select **November 2026**.
   - Select **`EMP001` (Arun Kumar)**: Observe populated earnings (`Basic Salary`, `Dearness Allowance`, `House Rent Allowance`, `Conveyance Allowance`, `Medical Allowance`, `Shift Allowance`, `Overtime`) while `Bonus` (`0.00` numeric zero) is preserved in the left editor under a `0.00` badge and hidden on the A4 preview by default.
   - Select **`EMP002` (Priya Sharma)**: Observe that `Medical Allowance`, `Conveyance Allowance`, `Overtime`, and `Loan Deduction`—which are blank in the Excel sheet for Priya—do **not** appear as empty rows on her payslip, whereas `Bonus` (`₹10,000`) and `Incentives` (`₹4,000`) dynamically appear.
   - Toggle **"Show 0.00 Value Rows"** in the left editor panel to see `NumericZero` rows (`ESI = ₹0`, `Bonus = ₹0`) appear or hide dynamically in real time.
2. **Import Excel (`Import Excel`)**:
   - Upload `PaySlip_Studio_Mock_Payroll_Test_Data.xlsx`, select the `IMPORT_TEST` or `November 2026` worksheet, inspect the auto-detected column categories, preview the cell-level validation table, and commit the batch.
3. **Export Consolidated Multi-Worksheet Workbook (`Reports & Exports`)**:
   - Navigate to **Reports & Exports** and click **Download Consolidated Master Workbook (.xlsx)** to generate a single Excel workbook containing separate worksheets for `Sep 2026`, `Oct 2026`, and `Nov 2026`.

