const fs = require('fs');
const path = require('path');
const cp = require('child_process');

async function getGitHubToken() {
  return new Promise((resolve, reject) => {
    const p = cp.spawn('C:\\Program Files\\Git\\mingw64\\bin\\git-credential-manager.exe', ['get']);
    p.stdin.write('protocol=https\nhost=github.com\nusername=Joshua-an-JGS\n\n');
    let output = '';
    p.stdout.on('data', d => { output += d.toString(); });
    p.on('close', code => {
      for (const line of output.split(/\r?\n/)) {
        if (line.startsWith('password=')) {
          return resolve(line.slice(9).trim());
        }
      }
      reject(new Error('Password token not found in git-credential-manager output'));
    });
  });
}

async function main() {
  const token = await getGitHubToken();
  console.log('Successfully acquired GitHub token for Joshua-an-JGS.');

  const owner = 'Joshua-an-JGS';
  const repo = 'Finora';
  const tag = 'v1.0.3';

  const headers = {
    'Authorization': 'token ' + token,
    'User-Agent': 'FINORA-Release-Tool',
    'Accept': 'application/vnd.github.v3+json'
  };

  // 1. Check existing release for tag
  console.log(`Checking existing releases for tag ${tag}...`);
  let release = null;
  const listRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, { headers });
  if (listRes.ok) {
    const releases = await listRes.json();
    release = releases.find(r => r.tag_name === tag);
  }

  const releasePayload = {
    tag_name: tag,
    target_commitish: 'main',
    name: 'FINORA v1.0.3',
    body: `## FINORA Finance & Payroll Management System — Version 1.0.3

### 🚀 Highlights & New Features
- **Smart Excel Payroll Import Engine**: 4 flexible import modes: Single Month, Full Year, Multiple Months, and Auto-Detect from Excel workbook data.
- **Master Payroll Export Centre**: Export organized payroll records by year with separate monthly worksheets and ZIP archive downloads.
- **Centralized Dynamic Payroll Year Service**: Automatic discovery of all active payroll periods across the entire application without hardcoded year limits.
- **Redesigned Payslip Templates Library**: Compact cards with layout preview thumbnails, single-sentence descriptions, and streamlined action hierarchy.
- **Default FINORA Brand Logo**: Pre-seeded official FINORA branding for new and existing setups with seamless custom logo upload and reset capabilities.
- **Desktop UI Stabilization**: Fixed sidebar layout with independent workspace scrolling, refined badge aesthetics, and clean user indicators.

### 📦 Installation & Verification
Download \`FINORA_Setup.exe\` to automatically update your existing FINORA desktop installation. All employee records, historical payrolls, templates, and company settings are 100% preserved.`,
    draft: false,
    prerelease: false
  };

  if (release) {
    console.log(`Release found with ID ${release.id}. Updating metadata...`);
    const updateRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${release.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(releasePayload)
    });
    release = await updateRes.json();
  } else {
    console.log(`Creating new release for ${tag}...`);
    const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(releasePayload)
    });
    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create release: ${createRes.status} ${errText}`);
    }
    release = await createRes.json();
    console.log(`Created release with ID ${release.id}`);
  }

  // Assets to upload
  const filesToUpload = [
    { name: 'FINORA_Setup.exe', path: 'build_out/FINORA_Setup.exe', contentType: 'application/octet-stream' },
    { name: 'FINORA-Setup.exe', path: 'build_out/FINORA_Setup.exe', contentType: 'application/octet-stream' },
    { name: 'latest.yml', path: 'build_out/latest.yml', contentType: 'text/yaml' },
    { name: 'FINORA_Setup.exe.blockmap', path: 'build_out/FINORA_Setup.exe.blockmap', contentType: 'application/octet-stream' }
  ];

  for (const file of filesToUpload) {
    if (!fs.existsSync(file.path)) {
      console.warn(`File not found: ${file.path}`);
      continue;
    }

    // Check if asset already exists in release
    const existingAsset = (release.assets || []).find(a => a.name === file.name);
    if (existingAsset) {
      console.log(`Deleting existing asset ${file.name} (ID: ${existingAsset.id})...`);
      await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${existingAsset.id}`, {
        method: 'DELETE',
        headers
      });
    }

    console.log(`Uploading ${file.name} (${fs.statSync(file.path).size} bytes)...`);
    const fileBuf = fs.readFileSync(file.path);
    const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(file.name)}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': file.contentType,
        'Content-Length': fileBuf.length
      },
      body: fileBuf
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error(`Failed to upload ${file.name}:`, err);
    } else {
      console.log(`Successfully uploaded ${file.name}`);
    }
  }

  // Verify releases/latest
  console.log('\nVerifying releases/latest endpoint...');
  const latestRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers });
  if (latestRes.ok) {
    const latest = await latestRes.json();
    console.log(`Latest release is now: ${latest.tag_name} (${latest.name})`);
    console.log(`Available assets: ${latest.assets.map(a => a.name).join(', ')}`);
  }
}

main().catch(err => {
  console.error('Fatal error in publish script:', err);
  process.exit(1);
});
