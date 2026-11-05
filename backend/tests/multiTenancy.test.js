const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const db = require('../src/config/db');

describe('Priority 7: Multi-Tenancy and Organization Isolation', () => {
  const orgAlphaId = 'aaaaaaaa-1111-4000-8000-000000000001';
  const orgBetaId = 'bbbbbbbb-2222-4000-8000-000000000002';

  let userAlphaAssocId;
  let userAlphaPartnerId;
  let userBetaPartnerId;
  let userBetaAdminId;

  let tokenAlphaAssoc;
  let tokenAlphaPartner;
  let tokenBetaPartner;
  let tokenBetaAdmin;

  let contractAlphaId;
  let findingAlphaId;
  let templateAlphaId;

  beforeAll(async () => {
    // 1. Create two separate organizations
    await db.query(
      `INSERT INTO organizations (id, name, slug)
       VALUES ($1, 'Firm Alpha', 'firm-alpha'), ($2, 'Firm Beta', 'firm-beta')
       ON CONFLICT (id) DO NOTHING`,
      [orgAlphaId, orgBetaId]
    );

    const passwordHash = bcrypt.hashSync('TestPass@123', 8);

    // 2. Create users for Firm Alpha
    const u1 = await db.query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, is_active)
       VALUES ($1, 'Alpha Associate', 'alpha.assoc@test.com', $2, 'associate', true)
       ON CONFLICT (email) DO UPDATE SET organization_id = EXCLUDED.organization_id
       RETURNING id`,
      [orgAlphaId, passwordHash]
    );
    userAlphaAssocId = u1.rows[0].id;

    const u2 = await db.query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, is_active)
       VALUES ($1, 'Alpha Partner', 'alpha.partner@test.com', $2, 'partner', true)
       ON CONFLICT (email) DO UPDATE SET organization_id = EXCLUDED.organization_id
       RETURNING id`,
      [orgAlphaId, passwordHash]
    );
    userAlphaPartnerId = u2.rows[0].id;

    // 3. Create users for Firm Beta
    const u3 = await db.query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, is_active)
       VALUES ($1, 'Beta Partner', 'beta.partner@test.com', $2, 'partner', true)
       ON CONFLICT (email) DO UPDATE SET organization_id = EXCLUDED.organization_id
       RETURNING id`,
      [orgBetaId, passwordHash]
    );
    userBetaPartnerId = u3.rows[0].id;

    const u4 = await db.query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, is_active)
       VALUES ($1, 'Beta Admin', 'beta.admin@test.com', $2, 'admin', true)
       ON CONFLICT (email) DO UPDATE SET organization_id = EXCLUDED.organization_id
       RETURNING id`,
      [orgBetaId, passwordHash]
    );
    userBetaAdminId = u4.rows[0].id;

    // 4. Acquire login tokens
    const r1 = await request(app).post('/api/auth/login').send({ email: 'alpha.assoc@test.com', password: 'TestPass@123' });
    tokenAlphaAssoc = r1.body.token;

    const r2 = await request(app).post('/api/auth/login').send({ email: 'alpha.partner@test.com', password: 'TestPass@123' });
    tokenAlphaPartner = r2.body.token;

    const r3 = await request(app).post('/api/auth/login').send({ email: 'beta.partner@test.com', password: 'TestPass@123' });
    tokenBetaPartner = r3.body.token;

    const r4 = await request(app).post('/api/auth/login').send({ email: 'beta.admin@test.com', password: 'TestPass@123' });
    tokenBetaAdmin = r4.body.token;

    // 5. Seed a contract in Firm Alpha
    const cRes = await db.query(
      `INSERT INTO contracts (organization_id, title, original_filename, file_path, uploaded_by, status, overall_risk_score, created_at, updated_at)
       VALUES ($1, 'Alpha Confidential Contract', 'alpha.pdf', 'uploads/alpha.pdf', $2, 'escalated', 65, NOW(), NOW())
       RETURNING id`,
      [orgAlphaId, userAlphaAssocId]
    );
    contractAlphaId = cRes.rows[0].id;

    // Seed finding for this contract
    const fRes = await db.query(
      `INSERT INTO findings (contract_id, clause_type, risk_level, page, text_span, reason, suggested_rewrite, status, source)
       VALUES ($1, 'liability', 'HIGH', 1, 'Unlimited Alpha Liability', 'Risk alert', 'Cap liability', 'open', 'rule')
       RETURNING id`,
      [contractAlphaId]
    );
    findingAlphaId = fRes.rows[0].id;

    // 6. Seed a template in Firm Alpha
    const tRes = await db.query(
      `INSERT INTO templates (organization_id, name, description, version, status, created_by, created_at, updated_at)
       VALUES ($1, 'Alpha Custom Template', 'Firm Alpha confidential benchmark', 1, 'active', $2, NOW(), NOW())
       RETURNING id`,
      [orgAlphaId, userAlphaPartnerId]
    );
    templateAlphaId = tRes.rows[0].id;
  });

  afterAll(async () => {
    // Teardown test artifacts
    if (contractAlphaId) {
      await db.query('DELETE FROM findings WHERE contract_id = $1', [contractAlphaId]);
      await db.query('DELETE FROM approvals WHERE contract_id = $1', [contractAlphaId]);
      await db.query('DELETE FROM contracts WHERE id = $1', [contractAlphaId]);
    }
    if (templateAlphaId) {
      await db.query('DELETE FROM template_clauses WHERE template_id = $1', [templateAlphaId]);
      await db.query('DELETE FROM template_versions WHERE template_id = $1', [templateAlphaId]);
      await db.query('DELETE FROM templates WHERE id = $1', [templateAlphaId]);
    }
    await db.query('DELETE FROM audit_logs WHERE organization_id IN ($1, $2)', [orgAlphaId, orgBetaId]);
    await db.query('DELETE FROM users WHERE organization_id IN ($1, $2)', [orgAlphaId, orgBetaId]);
    await db.query('DELETE FROM organizations WHERE id IN ($1, $2)', [orgAlphaId, orgBetaId]);
    await db.pool.end();
  });

  test('Tenant contract listing isolation: Firm Beta partner does NOT see Firm Alpha contract', async () => {
    const res = await request(app)
      .get('/api/contracts')
      .set('Authorization', `Bearer ${tokenBetaPartner}`);

    expect(res.status).toBe(200);
    const ids = res.body.contracts.map((c) => c.id);
    expect(ids).not.toContain(contractAlphaId);
  });

  test('Tenant contract access isolation: Firm Beta partner cannot query Firm Alpha contract by ID (404)', async () => {
    const res = await request(app)
      .get(`/api/contracts/${contractAlphaId}`)
      .set('Authorization', `Bearer ${tokenBetaPartner}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONTRACT_NOT_FOUND');
  });

  test('Tenant findings isolation: Firm Beta partner cannot query Firm Alpha contract findings (404)', async () => {
    const res = await request(app)
      .get(`/api/contracts/${contractAlphaId}/findings`)
      .set('Authorization', `Bearer ${tokenBetaPartner}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONTRACT_NOT_FOUND');
  });

  test('Tenant approval workflow isolation: Firm Beta partner cannot approve Firm Alpha contract (404)', async () => {
    const res = await request(app)
      .post(`/api/contracts/${contractAlphaId}/approve`)
      .set('Authorization', `Bearer ${tokenBetaPartner}`)
      .send({ note: 'Malicious cross-tenant approval attempt' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONTRACT_NOT_FOUND');
  });

  test('Tenant SSE stream isolation: Firm Beta partner cannot observe Firm Alpha SSE progress (404)', async () => {
    const res = await request(app)
      .get(`/api/contracts/${contractAlphaId}/progress`)
      .set('Authorization', `Bearer ${tokenBetaPartner}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONTRACT_NOT_FOUND');
  });

  test('Tenant template modification isolation: Firm Beta partner cannot update Firm Alpha template (403)', async () => {
    const res = await request(app)
      .put(`/api/templates/${templateAlphaId}`)
      .set('Authorization', `Bearer ${tokenBetaPartner}`)
      .send({ name: 'Tampered Template Name' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('Tenant admin user listing isolation: Firm Beta admin cannot view Firm Alpha users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${tokenBetaAdmin}`);

    expect(res.status).toBe(200);
    const emails = res.body.users.map((u) => u.email);
    expect(emails).not.toContain('alpha.assoc@test.com');
    expect(emails).not.toContain('alpha.partner@test.com');
  });

  test('Tenant admin user modification isolation: Firm Beta admin cannot deactivate Firm Alpha user (404)', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${userAlphaAssocId}/status`)
      .set('Authorization', `Bearer ${tokenBetaAdmin}`)
      .send({ is_active: false });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  test('Tenant audit log isolation: Firm Beta admin does not see Firm Alpha activity in audit logs', async () => {
    // Generate an audit action in Firm Alpha
    await request(app)
      .get(`/api/contracts/${contractAlphaId}`)
      .set('Authorization', `Bearer ${tokenAlphaPartner}`);

    // Query audit logs as Firm Beta Admin
    const res = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${tokenBetaAdmin}`);

    expect(res.status).toBe(200);
    const userIds = res.body.audit_logs.map((log) => log.user_id);
    expect(userIds).not.toContain(userAlphaPartnerId);
    expect(userIds).not.toContain(userAlphaAssocId);
  });

  test('Tenant finding isolation: Firm Beta partner cannot update status or read comments of Firm Alpha finding (404)', async () => {
    const patchRes = await request(app)
      .patch(`/api/findings/${findingAlphaId}`)
      .set('Authorization', `Bearer ${tokenBetaPartner}`)
      .send({ status: 'accepted' });

    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe('FINDING_NOT_FOUND');

    const getRes = await request(app)
      .get(`/api/findings/${findingAlphaId}/comments`)
      .set('Authorization', `Bearer ${tokenBetaPartner}`);

    expect(getRes.status).toBe(404);
    expect(getRes.body.error.code).toBe('FINDING_NOT_FOUND');
  });
});

