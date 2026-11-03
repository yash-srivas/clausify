const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

describe('RBAC & Admin User Management', () => {
  let associateToken;
  let partnerToken;
  let adminToken;
  let createdUserId;

  beforeAll(async () => {
    // Acquire tokens for all 3 roles
    const assocRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'associate@demo.com', password: 'Demo@123' });
    associateToken = assocRes.body.token;

    const partRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'partner@demo.com', password: 'Demo@123' });
    partnerToken = partRes.body.token;

    const admRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@demo.com', password: 'Demo@123' });
    adminToken = admRes.body.token;
  });

  afterAll(async () => {
    if (createdUserId) {
      await db.query('DELETE FROM users WHERE id = $1', [createdUserId]);
    }
    await db.pool.end();
  });

  test('Associate cannot access GET /api/admin/users (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${associateToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('Partner cannot access GET /api/admin/users (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${partnerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('Admin can access GET /api/admin/users (200 OK)', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThanOrEqual(3);
  });

  test('Admin creates a new user, audit log is written', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Jordan Junior',
        email: 'jordan@demo.com',
        password: 'Password@123',
        role: 'associate',
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user.email).toBe('jordan@demo.com');
    createdUserId = res.body.user.id;

    // Verify audit log entry
    const auditRes = await db.query(
      "SELECT * FROM audit_logs WHERE action LIKE 'POST /api/admin/users%' ORDER BY created_at DESC LIMIT 1"
    );
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].entity).toBe('users');
  });

  test('Admin deactivates user, user is blocked at login and auth middleware', async () => {
    // 1. Log in while active to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jordan@demo.com', password: 'Password@123' });
    expect(loginRes.status).toBe(200);
    const userToken = loginRes.body.token;

    // 2. Admin deactivates user
    const deactivateRes = await request(app)
      .patch(`/api/admin/users/${createdUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.user.is_active).toBe(false);

    // 3. User login must fail
    const blockedLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jordan@demo.com', password: 'Password@123' });
    expect(blockedLogin.status).toBe(401);
    expect(blockedLogin.body.error.code).toBe('ACCOUNT_DEACTIVATED');

    // 4. Existing JWT must be rejected by auth middleware
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(meRes.status).toBe(401);
    expect(meRes.body.error.code).toBe('ACCOUNT_DEACTIVATED');

    // 5. Admin reactivates user
    const reactivateRes = await request(app)
      .patch(`/api/admin/users/${createdUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: true });
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.user.is_active).toBe(true);

    // 6. User can log in again
    const reLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jordan@demo.com', password: 'Password@123' });
    expect(reLogin.status).toBe(200);
  });
});

