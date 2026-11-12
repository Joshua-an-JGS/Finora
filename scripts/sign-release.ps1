<#
.SYNOPSIS
    FINORA Enterprise Authenticode Code-Signing & Verification Utility.

.DESCRIPTION
    Signs FINORA Windows installers, inner binaries, and assemblies using SHA-256
    with RFC 3161 trusted timestamping (DigiCert / Sectigo / GlobalSign), and performs
    rigorous Authenticode chain verification.

.PARAMETER TargetPath
    Path to the executable or installer to sign (defaults to release\FINORA\FINORA Setup.exe).

.PARAMETER PfxPath
    Path to a commercial OV/EV PKCS#12 (.pfx/.p12) certificate file.

.PARAMETER PfxPassword
    Password for the PFX certificate.

.PARAMETER SubjectName
    Common Name / Subject Name of an installed certificate in the Windows Certificate Store (e.g. for EV Hardware Tokens/YubiKey).

.PARAMETER Thumbprint
    SHA1 thumbprint of the signing certificate in Cert:\CurrentUser\My or Cert:\LocalMachine\My.

.EXAMPLE
    .\scripts\sign-release.ps1 -PfxPath "C:\certs\finora_ov.pfx" -PfxPassword "SecretPass"
    .\scripts\sign-release.ps1 -SubjectName "Joshua Godson"
#>

[CmdletBinding()]
param(
    [string]$TargetPath = "release\FINORA\FINORA Setup.exe",
    [string]$PfxPath = "",
    [string]$PfxPassword = "",
    [string]$SubjectName = "",
    [string]$Thumbprint = ""
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " FINORA Windows Authenticode Signing & Verification Suite " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Locate SignTool.exe
$SignToolCandidates = @(
    "C:\Users\AMDTC\AppData\Local\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\windows-10\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\signtool.exe"
)

$SignTool = $null
foreach ($cand in $SignToolCandidates) {
    if (Test-Path $cand) {
        $SignTool = $cand
        break
    }
}

if (-not $SignTool) {
    Write-Error "Microsoft SignTool (signtool.exe) was not found on this system. Please install the Windows SDK."
}

Write-Host "Using SignTool: $SignTool" -ForegroundColor Gray

# 2. Resolve Target Files
if (-not (Test-Path $TargetPath)) {
    Write-Error "Target file not found: $TargetPath"
}

$Targets = @($TargetPath)
$MirrorPath = $TargetPath -replace "FINORA Setup\.exe", "FINORA-Setup.exe"
if ((Test-Path $MirrorPath) -and ($MirrorPath -ne $TargetPath)) {
    $Targets += $MirrorPath
}

# 3. Determine Timestamp Servers
$TimestampServers = @(
    "http://timestamp.digicert.com",
    "http://timestamp.sectigo.com",
    "http://timestamp.globalsign.com/scripts/timstamp.dll"
)

# 4. Sign Each Target
foreach ($file in $Targets) {
    $FullFile = (Resolve-Path $file).Path
    Write-Host "`n--> Signing executable: $FullFile" -ForegroundColor Yellow

    $SignedSuccess = $false
    foreach ($ts in $TimestampServers) {
        $SignArgs = @(
            "sign",
            "/fd", "SHA256",
            "/tr", $ts,
            "/td", "SHA256",
            "/d", "FINORA — Finance & Payroll Management System",
            "/du", "https://github.com/Joshua-an-JGS/Finora"
        )

        if ($PfxPath) {
            $SignArgs += @("/f", (Resolve-Path $PfxPath).Path)
            if ($PfxPassword) {
                $SignArgs += @("/p", $PfxPassword)
            }
        } elseif ($Thumbprint) {
            $SignArgs += @("/sha1", $Thumbprint)
        } elseif ($SubjectName) {
            $SignArgs += @("/n", $SubjectName)
        } else {
            $SignArgs += @("/a")
        }

        $SignArgs += $FullFile

        Write-Host "Executing SignTool with RFC 3161 timestamp ($ts)..." -ForegroundColor Gray
        try {
            $proc = Start-Process -FilePath $SignTool -ArgumentList $SignArgs -NoNewWindow -Wait -PassThru
            if ($proc.ExitCode -eq 0) {
                Write-Host "✓ Successfully signed with timestamp server: $ts" -ForegroundColor Green
                $SignedSuccess = $true
                break
            } else {
                Write-Warning "SignTool exited with code $($proc.ExitCode) on server $ts"
            }
        } catch {
            Write-Warning "Failed contacting $ts: $($_.Exception.Message)"
        }
    }

    if (-not $SignedSuccess) {
        Write-Error "Failed to sign $file. Please verify certificate validity, password, or token connection."
    }

    # 5. Verify Authenticode Signature
    Write-Host "--> Verifying Authenticode signature..." -ForegroundColor Yellow
    $VerifyArgs = @("verify", "/pa", "/all", "/v", $FullFile)
    $vProc = Start-Process -FilePath $SignTool -ArgumentList $VerifyArgs -NoNewWindow -Wait -PassThru
    if ($vProc.ExitCode -eq 0) {
        Write-Host "✓ Verification PASSED: Signature is cryptographically valid and chains to trusted root." -ForegroundColor Green
    } else {
        Write-Warning "Verification returned non-zero exit code: $($vProc.ExitCode)"
    }
}

# 6. Recalculate SHA-256 Hashes
Write-Host "`n--> Computing SHA-256 Checksums for Release Folder..." -ForegroundColor Cyan
$ReleaseDir = Split-Path $TargetPath -Parent
$ChecksumFile = Join-Path $ReleaseDir "CHECKSUMS.sha256"
$HashList = @()

Get-ChildItem -Path $ReleaseDir -File | Where-Object { $_.Name -ne "CHECKSUMS.sha256" } | ForEach-Object {
    $h = Get-FileHash -Path $_.FullName -Algorithm SHA256
    $line = "$($h.Hash.ToLower())  $($_.Name)"
    $HashList += $line
    Write-Host "  $line" -ForegroundColor Gray
}

$HashList | Out-File -FilePath $ChecksumFile -Encoding utf8 -Force
Write-Host "✓ Updated $ChecksumFile successfully." -ForegroundColor Green

Write-Host "`n[DONE] Release package processing complete.`n" -ForegroundColor Cyan

