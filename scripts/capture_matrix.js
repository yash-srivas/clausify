/**
 * Comprehensive Multi-Theme Matrix Screenshot Generator
 * Captures all 8 core platform pages across all 6 themes (48 screenshots total)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\itzme\\.gemini\\antigravity\\brain\\1e6ceb8c-24e9-49ad-b46a-8a3f731e6e2b';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const THEMES = [
  'claymorphism',
  'material-you',
  'neo-brutalism',
  'neumorphism',
  'glassmorphism',
  'monochrome',
];

async function loginUser(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.statusText}`);
  const data = await res.json();
  return {
    token: data.token,
    userParam: encodeURIComponent(JSON.stringify(data.user)),
  };
}

async function main() {
  console.log('================================================================');
  console.log('   MULTI-THEME MATRIX SCREENSHOT GENERATOR (8 Pages x 6 Themes)  ');
  console.log('================================================================');

  // 1. Authenticate Personas
  console.log('Logging in demo personas...');
  const assoc = await loginUser('associate@demo.com', 'Demo@123');
  const partner = await loginUser('partner@demo.com', 'Demo@123');
  const admin = await loginUser('admin@demo.com', 'Demo@123');

  // 2. Fetch a contract ID for review workspace
  const contractsRes = await fetch(`${BASE_URL}/api/contracts`, {
    headers: { Authorization: `Bearer ${assoc.token}` },
  });
  const contractsData = await contractsRes.json();
  const contracts = contractsData.contracts || contractsData || [];
  const targetContract =
    contracts.find((c) => c.overall_risk_score !== null && (c.status === 'analyzed' || c.status === 'in_review')) ||
    contracts.find((c) => c.overall_risk_score !== null) ||
    contracts[0];
  const contractId = targetContract ? targetContract.id : '';
  console.log(`Using contract for review page: ${contractId} (${targetContract ? targetContract.title : 'None'})`);

  const rootScreenshotDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(rootScreenshotDir)) {
    fs.mkdirSync(rootScreenshotDir, { recursive: true });
  }

  let totalCaptured = 0;

  for (const theme of THEMES) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`[THEME] Capturing Theme: [${theme.toUpperCase()}]`);
    console.log(`------------------------------------------------------------`);

    const themeDir = path.join(rootScreenshotDir, theme);
    if (!fs.existsSync(themeDir)) {
      fs.mkdirSync(themeDir, { recursive: true });
    }

    const pages = [
      {
        id: 'login',
        title: 'Login Page',
        url: `${BASE_URL}/login.html?theme=${theme}`,
        budget: 2500,
      },
      {
        id: 'associate_dashboard',
        title: 'Associate Dashboard',
        url: `${BASE_URL}/associate/dashboard.html?token=${assoc.token}&user=${assoc.userParam}&theme=${theme}`,
        budget: 3000,
      },
      {
        id: 'associate_review',
        title: 'Associate Review Workspace',
        url: `${BASE_URL}/associate/review.html?id=${contractId}&token=${assoc.token}&user=${assoc.userParam}&theme=${theme}`,
        budget: 5000,
      },
      {
        id: 'partner_approvals',
        title: 'Partner Approvals Queue',
        url: `${BASE_URL}/partner/approvals.html?token=${partner.token}&user=${partner.userParam}&theme=${theme}`,
        budget: 3000,
      },
      {
        id: 'partner_templates',
        title: 'Safe Legal Templates',
        url: `${BASE_URL}/partner/templates.html?token=${partner.token}&user=${partner.userParam}&theme=${theme}`,
        budget: 3000,
      },
      {
        id: 'admin_analytics',
        title: 'Admin Risk Analytics',
        url: `${BASE_URL}/admin/analytics.html?token=${admin.token}&user=${admin.userParam}&theme=${theme}`,
        budget: 3500,
      },
      {
        id: 'admin_users',
        title: 'Admin Users & RBAC',
        url: `${BASE_URL}/admin/users.html?token=${admin.token}&user=${admin.userParam}&theme=${theme}`,
        budget: 3000,
      },
      {
        id: 'admin_audit',
        title: 'Admin Audit Logs & Health',
        url: `${BASE_URL}/admin/audit.html?token=${admin.token}&user=${admin.userParam}&theme=${theme}`,
        budget: 3000,
      },
    ];

    for (const p of pages) {
      const outFileName = `${p.id}.png`;
      const outPath = path.join(themeDir, outFileName);
      const artifactFileName = `screenshot_${theme}_${p.id}.png`;
      const artifactPath = path.join(ARTIFACT_DIR, artifactFileName);

      process.stdout.write(`  [CAPTURE] [${theme}] -> ${p.title} ... `);

      try {
        const cmd = `powershell -Command "Start-Process -FilePath '${EDGE_PATH}' -ArgumentList '--headless', '--screenshot=${outPath}', '--window-size=1360,900', '--virtual-time-budget=${p.budget}', '${p.url}' -Wait"`;
        execSync(cmd, { stdio: 'ignore' });

        if (fs.existsSync(outPath)) {
          fs.copyFileSync(outPath, artifactPath);
          totalCaptured++;
          process.stdout.write(`OK (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)\n`);
        } else {
          process.stdout.write(`FAILED (file not created)\n`);
        }
      } catch (err) {
        process.stdout.write(`ERROR: ${err.message}\n`);
      }
    }
  }

  console.log('\n================================================================');
  console.log(`[OK] COMPLETED: ${totalCaptured} screenshots captured successfully!`);
  console.log(`Screenshots saved to /screenshots/<theme>/ and artifact directory.`);
  console.log('================================================================\n');
}

main().catch(console.error);
