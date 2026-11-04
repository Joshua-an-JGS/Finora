# PaySlip Studio — Production Deployment, Security & Operations Guide

## 1. Production Build & Hosting

### Frontend Compilation into Backend Static Assets
```powershell
cd "G:\UAV\PAY SLIP\frontend"
npm ci
npm run build
Copy-Item -Path ".\dist\*" -Destination "..\backend\PaySlipStudio.Api\wwwroot\" -Recurse -Force
```

### Backend Release Publish (`.NET 10.0 LTS`)
```powershell
cd "G:\UAV\PAY SLIP\backend"
dotnet publish PaySlipStudio.Api/PaySlipStudio.Api.csproj -c Release -o ./publish
```

---

## 2. Environment Variables & Secret Management

Never store production credentials in source-controlled files or expose them to the React frontend. Configure the following environment variables on the host server (or via Azure Key Vault / Windows DPAPI / systemd environment file):

| Variable | Description |
| :--- | :--- |
| `ConnectionStrings__DefaultConnection` | PostgreSQL 18 connection string (`Host=127.0.0.1;Port=5432;Database=payslip_studio;Username=payslip_app;Password=<STRONG_SECRET>;SslMode=Require`) |
| `Jwt__SecretKey` | Minimum 64-character cryptographically random signing secret for JWT bearer tokens |
| `PAYSLIP_STUDIO_SMTP_PASSWORD` | Authenticated SMTP password read exclusively on the server by [`EmailDeliveryService.cs`](file:///G:/UAV/PAY%20SLIP/backend/PaySlipStudio.Api/Services/EmailDeliveryService.cs) |
| `Cors__AllowedOrigins__0` | Explicit HTTPS origin for the frontend (e.g., `https://payslip.amtdc.org`) |

---

## 3. PostgreSQL 18 Security, Backup & Restore

### Automated Daily Backup (`pg_dump`)
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h 127.0.0.1 -p 5432 -U postgres -F c -b -v -f "G:\Backups\payslip_studio_$(Get-Date -Format 'yyyyMMdd_HHmm').dump" payslip_studio
```

### Database Restore (`pg_restore`)
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -h 127.0.0.1 -p 5432 -U postgres -d payslip_studio --clean --if-exists -v "G:\Backups\payslip_studio_YYYYMMDD_HHMM.dump"
```

---

## 4. Private File Vault & Retention Policy

- All uploaded Excel source files (`App_Data/Vault/Imports`) and generated PDF payslips (`App_Data/Vault/Pdfs`) are stored **outside** `wwwroot` in a private server directory.
- No direct static URL is ever exposed for payslip PDFs; every download passes through `[Authorize]` controller endpoints (`/api/payroll/records/{id}/pdf/download` and `/api/payroll/pdfs/{pdfId}/download`) which verify JWT authentication, RBAC role membership, and record an audit trail entry.

---

## 5. Installing as a Windows Desktop App (Edge / Chrome PWA)

PaySlip Studio includes a Web App Manifest ([`frontend/public/manifest.json`](file:///G:/UAV/PAY%20SLIP/frontend/public/manifest.json)) optimized for Windows desktop monitors:
1. Open PaySlip Studio in **Microsoft Edge** or **Google Chrome** on Windows.
2. Click the **Install PaySlip Studio (App Available)** icon in the address bar.
3. Click **Install** to pin PaySlip Studio to the Windows Taskbar and Start Menu as a dedicated standalone window.

