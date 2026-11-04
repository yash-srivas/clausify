const axios = require('axios');
const config = require('../config/env');

const TIMEOUTS = {
  HEALTH: 4000,
  REWRITE: 15000,
  EMBED: 30000,
  INGEST: 45000,
  ANALYZE: 120000,
};

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 3;
    this.cooldownMs = options.cooldownMs || 10000;
    this.state = 'CLOSED'; // 'CLOSED', 'OPEN', 'HALF_OPEN'
    this.consecutiveFailures = 0;
    this.lastStateChange = Date.now();
  }

  isOpen() {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastStateChange >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        this.lastStateChange = Date.now();
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
    if (this.state !== 'CLOSED') {
      this.state = 'CLOSED';
      this.lastStateChange = Date.now();
    }
  }

  recordFailure(isTransientConnectionError) {
    if (isTransientConnectionError) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold || this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        this.lastStateChange = Date.now();
      }
    }
  }

  reset() {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.lastStateChange = Date.now();
  }
}

const circuitBreaker = new CircuitBreaker();

const client = axios.create({
  baseURL: config.aiServiceUrl,
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-Key': config.internalApiKey,
  },
});

function isTransientError(err) {
  // Network connection drops or DNS failures
  if (!err.response) {
    const code = err.code || '';
    return ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code) || err.message?.includes('network');
  }

  // HTTP rate limit or transient server errors
  const status = err.response.status;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

// In-flight contract pipeline deduplication
const inFlightPipelines = new Map();

function withDeduplication(key, fn) {
  if (!key) return fn();
  if (inFlightPipelines.has(key)) {
    return inFlightPipelines.get(key);
  }
  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlightPipelines.delete(key);
    }
  })();
  inFlightPipelines.set(key, promise);
  return promise;
}

// Exponential backoff retry with jitter
async function withRetry(fn, options = {}) {
  const retries = options.retries !== undefined ? options.retries : 2;
  const delayMs = options.delayMs || 500;
  const isIdempotent = options.isIdempotent !== false;

  // Circuit breaker guard
  if (circuitBreaker.isOpen()) {
    const err = new Error('AI microservice is currently unavailable (circuit open).');
    err.code = 'AI_SERVICE_UNAVAILABLE';
    err.status = 503;
    throw err;
  }

  try {
    const result = await fn();
    circuitBreaker.recordSuccess();
    return result;
  } catch (err) {
    const transient = isTransientError(err);
    circuitBreaker.recordFailure(transient);

    // Stop retry if retries exhausted, non-transient error, or non-idempotent socket read timeout
    if (retries <= 0 || !transient) {
      throw err;
    }

    if (!isIdempotent && err.code === 'ECONNABORTED') {
      // Do not blindly retry non-idempotent operations on read timeout to avoid duplicate LLM charges
      throw err;
    }

    // Exponential backoff with random jitter (0-150ms)
    const jitter = Math.floor(Math.random() * 150);
    const backoff = delayMs * 2 + jitter;

    await new Promise((res) => setTimeout(res, delayMs));
    return withRetry(fn, { ...options, retries: retries - 1, delayMs: backoff });
  }
}

async function checkHealth() {
  return withRetry(
    async () => {
      const res = await client.get('/health', { timeout: TIMEOUTS.HEALTH });
      return res.data;
    },
    { retries: 1, delayMs: 300, isIdempotent: true }
  );
}

async function ingestContract({ contractId, filePath }) {
  return withDeduplication(`ingest_${contractId}`, () =>
    withRetry(
      async () => {
        const res = await client.post(
          '/ingest',
          {
            contract_id: contractId,
            file_path: filePath,
          },
          { timeout: TIMEOUTS.INGEST }
        );
        return res.data;
      },
      { retries: 2, delayMs: 800, isIdempotent: true }
    )
  );
}

async function analyzeContract({ contractId, templateId, clauseTypes = null }) {
  return withDeduplication(`analyze_${contractId}`, () =>
    withRetry(
      async () => {
        const payload = {
          contract_id: contractId,
          template_id: templateId,
        };
        if (clauseTypes) {
          payload.clause_types = clauseTypes;
        }
        const res = await client.post('/analyze', payload, { timeout: TIMEOUTS.ANALYZE });
        return res.data;
      },
      // Non-idempotent on read timeouts to prevent duplicate LLM charges
      { retries: 1, delayMs: 1000, isIdempotent: false }
    )
  );
}

async function rewriteClause({ findingId, clauseText, clauseType, templateClauseText, tone = 'neutral' }) {
  return withRetry(
    async () => {
      const res = await client.post(
        '/rewrite',
        {
          finding_id: findingId,
          clause_text: clauseText,
          clause_type: clauseType,
          template_clause_text: templateClauseText,
          tone,
        },
        { timeout: TIMEOUTS.REWRITE }
      );
      return res.data;
    },
    { retries: 2, delayMs: 500, isIdempotent: true }
  );
}

async function embedTemplate({ templateId }) {
  return withRetry(
    async () => {
      const res = await client.post(
        '/templates/embed',
        {
          template_id: templateId,
        },
        { timeout: TIMEOUTS.EMBED }
      );
      return res.data;
    },
    { retries: 2, delayMs: 800, isIdempotent: true }
  );
}

module.exports = {
  TIMEOUTS,
  CircuitBreaker,
  circuitBreaker,
  isTransientError,
  withRetry,
  checkHealth,
  ingestContract,
  analyzeContract,
  rewriteClause,
  embedTemplate,
};
