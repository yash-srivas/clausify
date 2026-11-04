const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const progressTracker = require('../src/services/progressTracker');

describe('Priority 4: Real-Time Analysis Progress SSE API', () => {
  let associateToken;
  let partnerToken;
  let associateId;
  let partnerId;
  let associateContractId;
  let partnerContractId;

  beforeAll(async () => {
    // Acquire tokens
    const aRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'associate@demo.com', password: 'Demo@123' });
    associateToken = aRes.body.token;
    associateId = aRes.body.user.id;

    const pRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'partner@demo.com', password: 'Demo@123' });
    partnerToken = pRes.body.token;
    partnerId = pRes.body.user.id;

    // Seed test contracts
    const c1 = await db.query(
      `INSERT INTO contracts (title, original_filename, file_path, uploaded_by, status, overall_risk_score, created_at, updated_at)
       VALUES ('Associate Contract', 'assoc.pdf', 'uploads/assoc.pdf', $1, 'analyzed', 42, NOW(), NOW())
       RETURNING id`,
      [associateId]
    );
    associateContractId = c1.rows[0].id;

    const c2 = await db.query(
      `INSERT INTO contracts (title, original_filename, file_path, uploaded_by, status, overall_risk_score, created_at, updated_at)
       VALUES ('Partner Contract', 'partner.pdf', 'uploads/partner.pdf', $1, 'processing', NULL, NOW(), NOW())
       RETURNING id`,
      [partnerId]
    );
    partnerContractId = c2.rows[0].id;
  });

  afterAll(async () => {
    if (associateContractId) {
      await db.query('DELETE FROM contracts WHERE id = $1', [associateContractId]);
    }
    if (partnerContractId) {
      await db.query('DELETE FROM contracts WHERE id = $1', [partnerContractId]);
    }
    progressTracker.clear();
    await db.pool.end();
  });

  test('GET /api/contracts/:id/progress rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get(`/api/contracts/${associateContractId}/progress`);
    expect(res.status).toBe(401);
  });

  test('GET /api/contracts/:id/progress rejects invalid contract UUID with 400', async () => {
    const res = await request(app)
      .get('/api/contracts/invalid-uuid/progress')
      .set('Authorization', `Bearer ${associateToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/contracts/:id/progress returns 404 for nonexistent contract', async () => {
    const res = await request(app)
      .get('/api/contracts/a0000000-0000-4000-8000-000000000000/progress')
      .set('Authorization', `Bearer ${associateToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONTRACT_NOT_FOUND');
  });

  test('GET /api/contracts/:id/progress prevents cross-user leakage (associate cannot access partner contract)', async () => {
    const res = await request(app)
      .get(`/api/contracts/${partnerContractId}/progress`)
      .set('Authorization', `Bearer ${associateToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('GET /api/contracts/:id/progress authenticates via query token parameter', async () => {
    const res = await request(app)
      .get(`/api/contracts/${associateContractId}/progress?token=${associateToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: progress');
    expect(res.text).toContain('COMPLETED');
  });

  test('GET /api/contracts/:id/progress returns immediate terminal event for completed contracts', async () => {
    const res = await request(app)
      .get(`/api/contracts/${associateContractId}/progress`)
      .set('Authorization', `Bearer ${associateToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: progress');
    expect(res.text).toContain('"stage":"COMPLETED"');
    expect(res.text).toContain('"overall_risk_score":42');
  });

  test('GET /api/contracts/:id/progress streams real-time updates for in-flight contract', (done) => {
    // Partner accesses partnerContractId which is 'processing'
    const server = app.listen(0, () => {
      const port = server.address().port;
      const http = require('http');

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/contracts/${partnerContractId}/progress`,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${partnerToken}`,
          },
        },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');

          let buffer = '';
          res.on('data', (chunk) => {
            buffer += chunk.toString();

            if (buffer.includes('PARSING') && !buffer.includes('EMBEDDING')) {
              // Emit next stage
              progressTracker.updateProgress(partnerContractId, {
                stage: 'EMBEDDING',
                progress: 65,
                message: 'Vector embedding generation in progress',
              });
            }

            if (buffer.includes('EMBEDDING') && !buffer.includes('COMPLETED')) {
              // Emit completed
              progressTracker.updateProgress(partnerContractId, {
                stage: 'COMPLETED',
                progress: 100,
                message: 'Analysis finished',
              });
            }

            if (buffer.includes('Analysis finished')) {
              req.destroy();
              server.close(() => {
                expect(buffer).toContain('EMBEDDING');
                expect(buffer).toContain('COMPLETED');
                done();
              });
            }
          });
        }
      );

      req.on('error', (err) => {
        // Ignore aborted error after destroying
        if (err.code !== 'ECONNRESET') {
          server.close(() => done(err));
        }
      });

      req.end();
    });
  });
});
