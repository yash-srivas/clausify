const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

describe('Priority 3: Executive Risk Reports API', () => {
  let associateToken;
  let contractId;
  let findingId;

  beforeAll(async () => {
    // 1. Authenticate
    const authRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'associate@demo.com', password: 'Demo@123' });
    associateToken = authRes.body.token;

    // 2. Insert test contract
    const cRes = await db.query(
      `INSERT INTO contracts (title, original_filename, file_path, uploaded_by, status, overall_risk_score, page_count)
       VALUES ('Executive Report Test Agreement', 'test_agreement.pdf', '/tmp/test.pdf', '11111111-1111-1111-1111-111111111111', 'in_review', 82, 3)
       RETURNING id`
    );
    contractId = cRes.rows[0].id;

    // 3. Insert findings
    const fRes = await db.query(
      `INSERT INTO findings (contract_id, clause_type, risk_level, page, text_span, reason, suggested_rewrite, status)
       VALUES ($1, 'limitation_of_liability', 'HIGH', 2, 'Vendor liability shall be completely uncapped.', 'Exposes company to unlimited damages.', 'Liability shall be capped at 12 months fees.', 'accepted')
       RETURNING id`,
      [contractId]
    );
    findingId = fRes.rows[0].id;

    // 4. Insert comment
    await db.query(
      `INSERT INTO comments (finding_id, user_id, body)
       VALUES ($1, '11111111-1111-1111-1111-111111111111', 'Verified with General Counsel; standard cap requested.')`,
      [findingId]
    );

    // 5. Insert approval
    await db.query(
      `INSERT INTO approvals (contract_id, decided_by, decision, note)
       VALUES ($1, '22222222-2222-2222-2222-222222222222', 'approved', 'Approved subject to standard 12-month cap.')`,
      [contractId]
    );
  });

  afterAll(async () => {
    if (contractId) {
      await db.query('DELETE FROM comments WHERE finding_id = $1', [findingId]);
      await db.query('DELETE FROM findings WHERE contract_id = $1', [contractId]);
      await db.query('DELETE FROM approvals WHERE contract_id = $1', [contractId]);
      await db.query('DELETE FROM contracts WHERE id = $1', [contractId]);
    }
    await db.pool.end();
  });

  test('GET /api/contracts/:id/report returns structured JSON report data', async () => {
    const res = await request(app)
      .get(`/api/contracts/${contractId}/report`)
      .set('Authorization', `Bearer ${associateToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('report');
    const { contract, findings, approval } = res.body.report;

    expect(contract.title).toBe('Executive Report Test Agreement');
    expect(contract.overall_risk_score).toBe(82);
    expect(findings.length).toBeGreaterThanOrEqual(1);

    const firstFinding = findings[0];
    expect(firstFinding.clause_type).toBe('limitation_of_liability');
    expect(firstFinding.risk_level).toBe('HIGH');
    expect(firstFinding.comments.length).toBe(1);
    expect(firstFinding.comments[0].body).toContain('General Counsel');

    expect(approval).not.toBeNull();
    expect(approval.decision).toBe('approved');
    expect(approval.note).toContain('12-month cap');
  });

  test('GET /api/contracts/:id/report/pdf streams downloadable binary PDF', async () => {
    const res = await request(app)
      .get(`/api/contracts/${contractId}/report/pdf`)
      .set('Authorization', `Bearer ${associateToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.pdf');

    // Verify valid PDF magic bytes (%PDF-)
    expect(res.body.slice(0, 5).toString('utf-8')).toBe('%PDF-');
    expect(res.body.length).toBeGreaterThan(1000);
  });

  test('GET /api/contracts/:id/report?format=pdf streams PDF directly', async () => {
    const res = await request(app)
      .get(`/api/contracts/${contractId}/report?format=pdf`)
      .set('Authorization', `Bearer ${associateToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.slice(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  test('GET /api/contracts/:id/report returns 404 for nonexistent contract', async () => {
    const res = await request(app)
      .get('/api/contracts/a0000000-0000-4000-8000-000000000000/report')
      .set('Authorization', `Bearer ${associateToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONTRACT_NOT_FOUND');
  });

  test('GET /api/contracts/:id/report rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get(`/api/contracts/${contractId}/report`);
    expect(res.status).toBe(401);
  });
});
