const axios = require('axios');
const config = require('../config/env');

const client = axios.create({
  baseURL: config.aiServiceUrl,
  timeout: 120000, // 2 minutes for heavy PDF processing
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-Key': config.internalApiKey,
  },
});

// Retry helper for network glitches
async function withRetry(fn, retries = 2, delayMs = 500) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0 || (err.response && err.response.status < 500 && err.response.status !== 429)) {
      throw err;
    }
    await new Promise((res) => setTimeout(res, delayMs));
    return withRetry(fn, retries - 1, delayMs * 2);
  }
}

async function checkHealth() {
  return withRetry(async () => {
    const res = await client.get('/health');
    return res.data;
  });
}

async function ingestContract({ contractId, filePath }) {
  return withRetry(async () => {
    const res = await client.post('/ingest', {
      contract_id: contractId,
      file_path: filePath,
    });
    return res.data;
  });
}

async function analyzeContract({ contractId, templateId, clauseTypes = null }) {
  return withRetry(async () => {
    const payload = {
      contract_id: contractId,
      template_id: templateId,
    };
    if (clauseTypes) {
      payload.clause_types = clauseTypes;
    }
    const res = await client.post('/analyze', payload);
    return res.data;
  });
}

async function rewriteClause({ findingId, clauseText, clauseType, templateClauseText, tone = 'neutral' }) {
  return withRetry(async () => {
    const res = await client.post('/rewrite', {
      finding_id: findingId,
      clause_text: clauseText,
      clause_type: clauseType,
      template_clause_text: templateClauseText,
      tone,
    });
    return res.data;
  });
}

async function embedTemplate({ templateId }) {
  return withRetry(async () => {
    const res = await client.post('/templates/embed', {
      template_id: templateId,
    });
    return res.data;
  });
}

module.exports = {
  checkHealth,
  ingestContract,
  analyzeContract,
  rewriteClause,
  embedTemplate,
};

