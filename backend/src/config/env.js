const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/legal_risk_analyzer',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-super-secret-key-must-be-long-and-random-12345',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  internalApiKey: process.env.INTERNAL_API_KEY || 'dev-internal-secret-key-32chars-min!',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'),
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB, 10) || 20,
};

module.exports = config;

