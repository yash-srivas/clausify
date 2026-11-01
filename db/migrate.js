const fs = require('fs');
const path = require('path');
const { Pool } = require(path.join(__dirname, '../backend/node_modules/pg'));
require(path.join(__dirname, '../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../backend/.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/legal_risk_analyzer';
const pool = new Pool({ connectionString });

async function migrate() {
  console.log(`[Migrate] Running migrations against ${connectionString}...`);
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schemaSql);
    console.log('[Migrate] Schema successfully applied!');
  } catch (err) {
    console.error('[Migrate] Error applying schema:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = migrate;
