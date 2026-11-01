/**
 * Unified Runner & Supervisor for Intelligent Legal Risk Analyzer
 * Starts Docker DB (if needed), runs migrations, spawns AI service & Backend,
 * streams consolidated logs, and opens http://localhost:3000 in the browser.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const AI_DIR = path.join(ROOT_DIR, 'ai-service');

console.log('======================================================================');
console.log('   INTELLIGENT LEGAL CONTRACT & VENDOR RISK ANALYZER - SUPERVISOR');
console.log('======================================================================\n');

// 1. Ensure Docker & Database
function ensureDatabase() {
  process.stdout.write('[1/4] Checking PostgreSQL + pgvector container... ');
  try {
    const isRunning = execSync('docker inspect -f "{{.State.Running}}" legal_risk_db 2>nul', { encoding: 'utf8' }).trim();
    if (isRunning === 'true') {
      console.log('[OK] Running on port 5432');
      return;
    }
  } catch {
    // container not found or stopped
  }

  try {
    console.log('Starting legal_risk_db...');
    execSync('docker start legal_risk_db 2>nul || docker compose up -d db', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log('[1/4] [OK] Database started successfully');
  } catch (err) {
    console.warn('[!] Could not automatically start Docker container:', err.message);
    console.warn('    Please ensure Docker Desktop is open or PostgreSQL is listening on port 5432.');
  }
}

// 2. Run Database Migrations & Seeds
function runMigrationsAndSeeds() {
  console.log('[2/4] Verifying database schema and demo accounts...');
  try {
    execSync('node ../db/migrate.js', { cwd: BACKEND_DIR, stdio: 'ignore' });
    execSync('node ../db/seed.js', { cwd: BACKEND_DIR, stdio: 'ignore' });
    console.log('[2/4] [OK] Schema and demo accounts verified (associate/partner/admin @ demo.com)');
  } catch (err) {
    console.warn('[!] Migration/seed notice:', err.message);
  }
}

// 3. Spawn Subprocesses
let aiProcess = null;
let backendProcess = null;

function startAiService() {
  console.log('[3/4] Launching AI Microservice on port 8000...');
  aiProcess = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: AI_DIR,
    shell: true,
  });

  aiProcess.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((l) => console.log(`\x1b[36m[AI-Service]\x1b[0m ${l}`));
  });

  aiProcess.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((l) => console.log(`\x1b[33m[AI-Service]\x1b[0m ${l}`));
  });
}

function startBackend() {
  console.log('[4/4] Launching Backend Gateway & Web UI on port 3000...');
  backendProcess = spawn('node', ['src/server.js'], {
    cwd: BACKEND_DIR,
    shell: true,
  });

  backendProcess.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((l) => console.log(`\x1b[32m[Backend]\x1b[0m ${l}`));
  });

  backendProcess.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((l) => console.log(`\x1b[31m[Backend]\x1b[0m ${l}`));
  });
}

function waitForHealthAndOpenBrowser() {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
      if (res.statusCode === 200) {
        clearInterval(interval);
        console.log('\n======================================================================');
        console.log('   [READY] PLATFORM READY! ALL SERVICES OPERATIONAL');
        console.log('   - Web Application: http://localhost:3000');
        console.log('   - AI Microservice: http://localhost:8000');
        console.log('   - Database:        localhost:5432 (pgvector)');
        console.log('');
        console.log('   Demo Logins (Password: Demo@123):');
        console.log('   - Associate: associate@demo.com');
        console.log('   - Partner:   partner@demo.com');
        console.log('   - Admin:     admin@demo.com');
        console.log('======================================================================\n');
        console.log('Opening http://localhost:3000 in your browser...\n');

        // Open browser
        try {
          execSync('start http://localhost:3000');
        } catch {}
      }
    });

    req.on('error', () => {
      if (attempts >= 30) {
        clearInterval(interval);
        console.warn('Server initialization taking longer than expected. Check logs above.');
      }
    });
  }, 1000);
}

function cleanup() {
  console.log('\nGracefully shutting down services...');
  if (aiProcess) {
    try {
      execSync(`taskkill /f /t /pid ${aiProcess.pid} 2>nul`);
    } catch {}
  }
  if (backendProcess) {
    try {
      execSync(`taskkill /f /t /pid ${backendProcess.pid} 2>nul`);
    } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Execution
ensureDatabase();
runMigrationsAndSeeds();
startAiService();
startBackend();
waitForHealthAndOpenBrowser();

