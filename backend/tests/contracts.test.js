const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const db = require('../src/config/db');
const aiClient = require('../src/services/aiClient');

describe('Contracts, Findings, Templates & Workflow API Flow', () => {
  let associateToken;
  let partnerToken;
  let adminToken;
  let uploadedContractId;
  let createdFindingId;
  let createdTemplateId;

  beforeAll(async () => {
    // Acquire tokens for all 3 roles
    const aRes = await request(app).post('/api/auth/login').send({ email: 'associate@demo.com', password: 'Demo@123' });
    associateToken = aRes.body.token;

    const pRes = await request(app).post('/api/auth/login').send({ email: 'partner@demo.com', password: 'Demo@123' });
    partnerToken = pRes.body.token;

    const admRes = await request(app).post('/api/auth/login').send({ email: 'admin@demo.com', password: 'Demo@123' });
    adminToken = admRes.body.token;
  });

  afterAll(async () => {
    if (uploadedContractId) {
      await db.query('DELETE FROM findings WHERE contract_id = $1', [uploadedContractId]);
      await db.query('DELETE FROM approvals WHERE contract_id = $1', [uploadedContractId]);
      await db.query('DELETE FROM contracts WHERE id = $1', [uploadedContractId]);
    }
    if (createdTemplateId) {
      await db.query('DELETE FROM template_versions WHERE template_id = $1', [createdTemplateId]);
      await db.query('DELETE FROM template_clauses WHERE template_id = $1', [createdTemplateId]);
      await db.query('DELETE FROM templates WHERE id = $1', [createdTemplateId]);
    }
  });

  test('POST /api/contracts rejects non-PDF file upload with 400', async () => {
    // Create temporary text file
    const txtPath = path.join(__dirname, 'temp_test.txt');
    fs.writeFileSync(txtPath, 'Not a PDF file');

    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${associateToken}`)
      .attach('file', txtPath);

    fs.unlinkSync(txtPath);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  test('POST /api/contracts uploads valid PDF, responds with 202 Accepted', async () => {
    const pdfPath = path.resolve(__dirname, '../../samples/contract_risky_1.pdf');

    // Spy on aiClient background calls
    jest.spyOn(aiClient, 'ingestContract').mockResolvedValue({ contract_id: 'test', page_count: 3, chunk_count: 5 });
    jest.spyOn(aiClient, 'analyzeContract').mockImplementation(async ({ contractId }) => {
      await db.query("UPDATE contracts SET status = 'analyzed', overall_risk_score = 75 WHERE id = $1", [contractId]);
      return { overall_risk_score: 75, risk_band: 'HIGH', findings: [] };
    });

    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${associateToken}`)
      .field('title', 'Supertest Vendor Contract')
      .attach('file', pdfPath);

    expect(res.status).toBe(202);
    expect(res.body.contract).toHaveProperty('id');
    expect(res.body.contract.status).toBe('uploaded');
    uploadedContractId = res.body.contract.id;

    // Wait briefly for background pipeline mock to execute
    await new Promise((r) => setTimeout(r, 200));

    const checkRes = await request(app)
      .get(`/api/contracts/${uploadedContractId}`)
      .set('Authorization', `Bearer ${associateToken}`);

    expect(checkRes.status).toBe(200);
    expect(checkRes.body.contract.status).toBe('analyzed');
    expect(checkRes.body.contract.overall_risk_score).toBe(75);
  });

  test('Findings: insert, query, patch status, and comments thread', async () => {
    // Insert a test finding into the contract
    const fRes = await db.query(
      `INSERT INTO findings (
        contract_id, clause_type, risk_level, page, text_span, reason, suggested_rewrite, status, source
      ) VALUES ($1, 'liability', 'HIGH', 2, 'Vendor liability shall be unlimited', 'Deviates from standard cap', 'Cap at 12 months fees', 'open', 'llm')
      RETURNING id`,
      [uploadedContractId]
    );
    createdFindingId = fRes.rows[0].id;

    // 1. Query findings
    const listRes = await request(app)
      .get(`/api/contracts/${uploadedContractId}/findings`)
      .set('Authorization', `Bearer ${associateToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.findings.length).toBeGreaterThanOrEqual(1);

    // 2. Patch finding status to 'accepted'
    const patchRes = await request(app)
      .patch(`/api/findings/${createdFindingId}`)
      .set('Authorization', `Bearer ${associateToken}`)
      .send({ status: 'accepted' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.finding.status).toBe('accepted');

    // 3. Add comment
    const commentRes = await request(app)
      .post(`/api/findings/${createdFindingId}/comments`)
      .set('Authorization', `Bearer ${associateToken}`)
      .send({ body: 'Accepted: we will counter-propose the standard 12-month fee cap.' });

    expect(commentRes.status).toBe(201);
    expect(commentRes.body.comment.body).toContain('counter-propose');

    // 4. Get comments
    const getCommentsRes = await request(app)
      .get(`/api/findings/${createdFindingId}/comments`)
      .set('Authorization', `Bearer ${associateToken}`);

    expect(getCommentsRes.status).toBe(200);
    expect(getCommentsRes.body.comments.length).toBe(1);
  });

  test('Workflow Escalation: Associate submits, Partner approves', async () => {
    // 1. Associate submits contract for approval -> escalated
    const submitRes = await request(app)
      .post(`/api/contracts/${uploadedContractId}/submit`)
      .set('Authorization', `Bearer ${associateToken}`);

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.contract.status).toBe('escalated');

    // 2. Associate cannot approve contract (403 Forbidden)
    const blockedApprove = await request(app)
      .post(`/api/contracts/${uploadedContractId}/approve`)
      .set('Authorization', `Bearer ${associateToken}`)
      .send({ note: 'I approve my own contract' });

    expect(blockedApprove.status).toBe(403);
    expect(blockedApprove.body.error.code).toBe('FORBIDDEN');

    // 3. Partner approves contract
    const approveRes = await request(app)
      .post(`/api/contracts/${uploadedContractId}/approve`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ note: 'Reviewed and approved with redlined liability terms.' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.contract.status).toBe('approved');
  });

  test('Templates: Partner creates, snapshots version on update, and activates', async () => {
    jest.spyOn(aiClient, 'embedTemplate').mockResolvedValue({ template_id: 't', clauses_embedded: 1 });

    // 1. Create template
    const createRes = await request(app)
      .post('/api/templates')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({
        name: 'Enterprise Safe Template v2',
        description: 'New corporate standard',
        clauses: [
          { clause_type: 'liability', title: 'Liability Cap', text: 'Liability capped at 24 months fees.' }
        ]
      });

    expect(createRes.status).toBe(201);
    createdTemplateId = createRes.body.template.id;
    expect(createRes.body.template.version).toBe(1);

    // 2. Update template: creates version 2 and saves snapshot to template_versions
    const updateRes = await request(app)
      .put(`/api/templates/${createdTemplateId}`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({
        description: 'Updated corporate standard with stronger indemnity',
        clauses: [
          { clause_type: 'liability', title: 'Updated Cap', text: 'Liability strictly capped at 12 months fees.' }
        ]
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.template.version).toBe(2);

    // 3. Verify version history
    const historyRes = await request(app)
      .get(`/api/templates/${createdTemplateId}/versions`)
      .set('Authorization', `Bearer ${partnerToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.versions.length).toBe(1);
    expect(historyRes.body.versions[0].version).toBe(1);

    // 4. Activate template
    const activateRes = await request(app)
      .post(`/api/templates/${createdTemplateId}/activate`)
      .set('Authorization', `Bearer ${partnerToken}`);

    expect(activateRes.status).toBe(200);
    expect(activateRes.body.template.status).toBe('active');
  });

  test('Admin Analytics & Health endpoints return valid KPIs', async () => {
    // 1. Analytics
    const analyticsRes = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body).toHaveProperty('contracts_processed');
    expect(analyticsRes.body).toHaveProperty('avg_risk_score');
    expect(analyticsRes.body).toHaveProperty('status_breakdown');
    expect(analyticsRes.body).toHaveProperty('top_flagged_clause_types');

    // 2. Health
    jest.spyOn(aiClient, 'checkHealth').mockResolvedValue({ status: 'healthy', service: 'ai-service' });

    const healthRes = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('healthy');
    expect(healthRes.body.database).toBe('connected');
  });
});
