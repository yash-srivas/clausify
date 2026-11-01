const app = require('./app');
const config = require('./config/env');
const db = require('./config/db');

async function startServer() {
  try {
    // Verify DB connectivity
    await db.query('SELECT 1');
    console.log('[Database] Connected successfully to PostgreSQL');

    app.listen(config.port, () => {
      console.log(`[Backend] Intelligent Legal Risk Analyzer API running on port ${config.port}`);
    });
  } catch (err) {
    console.error('[Backend] Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = startServer;

