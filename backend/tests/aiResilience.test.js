const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const {
  CircuitBreaker,
  isTransientError,
  withRetry,
  TIMEOUTS,
} = require('../src/services/aiClient');

describe('Priority 2: AI Microservice Resilience & Circuit Breaker', () => {
  let associateToken;
  let testContractId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'associate@demo.com', password: 'Demo@123' });
    associateToken = res.body.token;

    // Insert a test contract in processing status
    const contractRes = await db.query(
      `INSERT INTO contracts (title, original_filename, file_path, uploaded_by, status)
       VALUES ('Resilience Concurrency Test', 'test.pdf', '/tmp/test.pdf', '11111111-1111-1111-1111-111111111111', 'processing')
       RETURNING id`
    );
    testContractId = contractRes.rows[0].id;
  });

  afterAll(async () => {
    if (testContractId) {
      await db.query('DELETE FROM contracts WHERE id = $1', [testContractId]);
    }
    await db.pool.end();
  });

  describe('CircuitBreaker Unit Tests', () => {
    test('starts in CLOSED state with 0 failures', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 100 });
      expect(cb.state).toBe('CLOSED');
      expect(cb.isOpen()).toBe(false);
    });

    test('transitions to OPEN when failure threshold is reached', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 500 });
      cb.recordFailure(true);
      cb.recordFailure(true);
      expect(cb.isOpen()).toBe(false);

      cb.recordFailure(true); // 3rd failure
      expect(cb.state).toBe('OPEN');
      expect(cb.isOpen()).toBe(true);
    });

    test('transitions to HALF_OPEN after cooldown period passes', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });
      cb.recordFailure(true);
      cb.recordFailure(true);
      expect(cb.state).toBe('OPEN');

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 60));
      expect(cb.isOpen()).toBe(false);
      expect(cb.state).toBe('HALF_OPEN');
    });

    test('resets to CLOSED upon successful request', () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });
      cb.recordFailure(true);
      cb.recordFailure(true);
      expect(cb.state).toBe('OPEN');

      cb.recordSuccess();
      expect(cb.state).toBe('CLOSED');
      expect(cb.consecutiveFailures).toBe(0);
    });
  });

  describe('Transient vs Permanent Error Classification', () => {
    test('identifies network drop codes as transient', () => {
      expect(isTransientError({ code: 'ECONNREFUSED' })).toBe(true);
      expect(isTransientError({ code: 'ENOTFOUND' })).toBe(true);
      expect(isTransientError({ code: 'ECONNRESET' })).toBe(true);
      expect(isTransientError({ code: 'ETIMEDOUT' })).toBe(true);
    });

    test('identifies 429, 502, 503, 504 as transient', () => {
      expect(isTransientError({ response: { status: 429 } })).toBe(true);
      expect(isTransientError({ response: { status: 502 } })).toBe(true);
      expect(isTransientError({ response: { status: 503 } })).toBe(true);
      expect(isTransientError({ response: { status: 504 } })).toBe(true);
    });

    test('identifies 400, 401, 404, 422 as permanent non-retryable errors', () => {
      expect(isTransientError({ response: { status: 400 } })).toBe(false);
      expect(isTransientError({ response: { status: 401 } })).toBe(false);
      expect(isTransientError({ response: { status: 404 } })).toBe(false);
      expect(isTransientError({ response: { status: 422 } })).toBe(false);
    });
  });

  describe('Retry Mechanism & Non-Idempotent Protection', () => {
    test('does not retry permanent 422 errors and throws immediately', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        const err = new Error('No extractable text');
        err.response = { status: 422 };
        throw err;
      };

      await expect(withRetry(fn, { retries: 2, delayMs: 10 })).rejects.toThrow('No extractable text');
      expect(callCount).toBe(1); // Never retried
    });

    test('retries transient 503 errors with backoff', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        if (callCount < 2) {
          const err = new Error('Service Unavailable');
          err.response = { status: 503 };
          throw err;
        }
        return 'success';
      };

      const result = await withRetry(fn, { retries: 2, delayMs: 10 });
      expect(result).toBe('success');
      expect(callCount).toBe(2);
    });

    test('does not retry non-idempotent operations on read timeout (ECONNABORTED)', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        const err = new Error('timeout of 120000ms exceeded');
        err.code = 'ECONNABORTED';
        throw err;
      };

      await expect(
        withRetry(fn, { retries: 2, delayMs: 10, isIdempotent: false })
      ).rejects.toThrow('timeout of 120000ms exceeded');
      expect(callCount).toBe(1); // Preserves LLM cost
    });
  });

  describe('Concurrency & Duplicate Processing Prevention', () => {
    test('POST /api/contracts/:id/reanalyze rejects with 409 when status is already processing', async () => {
      const res = await request(app)
        .post(`/api/contracts/${testContractId}/reanalyze`)
        .set('Authorization', `Bearer ${associateToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ANALYSIS_ALREADY_IN_PROGRESS');
      expect(res.body.error.message).toContain('currently being analyzed');
    });
  });

  describe('SLA Timeouts Configured', () => {
    test('defines specialized timeouts per operation', () => {
      expect(TIMEOUTS.HEALTH).toBe(4000);
      expect(TIMEOUTS.REWRITE).toBe(15000);
      expect(TIMEOUTS.EMBED).toBe(30000);
      expect(TIMEOUTS.INGEST).toBe(45000);
      expect(TIMEOUTS.ANALYZE).toBe(120000);
    });
  });
});

