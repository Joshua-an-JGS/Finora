const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Enterprise Authenticode Signing Hook for FINORA
 * Automatically called by electron-builder for every Windows binary:
 * - FINORA.exe
 * - PaySlipStudio.Api.exe
 * - elevate.exe
 * - createdump.exe
 * - __uninstaller-nsis-finora.exe
 * - FINORA Setup.exe
 */
exports.default = async function (configuration) {
  const filePath = configuration.path;
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }

  // 1. Check for certificate configuration
  const pfxPath = process.env.CSC_LINK || process.env.WIN_CSC_LINK;
  const pfxPassword = process.env.CSC_KEY_PASSWORD || process.env.WIN_CSC_KEY_PASSWORD;
  const certSubject = process.env.CSC_NAME || process.env.CERT_SUBJECT;
  const certSha1 = process.env.CERT_SHA1;

  // 2. Locate signtool.exe
  const signtoolPaths = [
    'C:\\Users\\AMDTC\\AppData\\Local\\electron-builder\\Cache\\winCodeSign\\winCodeSign-2.6.0\\windows-10\\x64\\signtool.exe',
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.22621.0\\x64\\signtool.exe',
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.19041.0\\x64\\signtool.exe',
    'C:\\Program Files (x86)\\Windows Kits\\10\\App Certification Kit\\signtool.exe'
  ];

  let signtoolExe = null;
  for (const candidate of signtoolPaths) {
    if (fs.existsSync(candidate)) {
      signtoolExe = candidate;
      break;
    }
  }

  // If no certificate credentials provided in environment, record staging status
  if (!pfxPath && !certSubject && !certSha1) {
    // Staging / Unsigned build note
    return;
  }

  if (!signtoolExe) {
    console.warn(`[Authenticode Signing] Warning: signtool.exe not found. Skipping signature for ${filePath}`);
    return;
  }

  // 3. Assemble SignTool command arguments (SHA-256 + RFC 3161 Timestamp)
  const timestampServers = [
    'http://timestamp.digicert.com',
    'http://timestamp.sectigo.com',
    'http://timestamp.globalsign.com/scripts/timstamp.dll'
  ];

  for (const timestampServer of timestampServers) {
    const args = [
      'sign',
      '/fd', 'SHA256',
      '/tr', timestampServer,
      '/td', 'SHA256',
      '/d', 'FINORA — Finance & Payroll Management System',
      '/du', 'https://github.com/Joshua-an-JGS/Finora'
    ];

    if (pfxPath) {
      args.push('/f', pfxPath);
      if (pfxPassword) {
        args.push('/p', pfxPassword);
      }
    } else if (certSha1) {
      args.push('/sha1', certSha1);
    } else if (certSubject) {
      args.push('/n', certSubject);
    }

    args.push(filePath);

    try {
      execFileSync(signtoolExe, args, { stdio: 'pipe' });
      console.log(`[Authenticode Signing] ✓ Successfully signed & timestamped: ${path.basename(filePath)}`);
      return;
    } catch (err) {
      console.warn(`[Authenticode Signing] Timestamp server ${timestampServer} failed, trying next...`);
    }
  }

  console.error(`[Authenticode Signing] Failed to sign ${filePath} with all timestamp servers.`);
};
