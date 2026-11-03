const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

describe('Auth Endpoints & Credentials', () => {
  test('POST /api/auth/login succeeds for associate@demo.com', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'associate@demo.com', password: 'Demo@123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      email: 'associate@demo.com',
      role: 'associate',
    });
  });

  test('POST /api/auth/login succeeds for partner@demo.com', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'partner@demo.com', password: 'Demo@123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      email: 'partner@demo.com',
      role: 'partner',
    });
  });

  test('POST /api/auth/login succeeds for admin@demo.com', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@demo.com', password: 'Demo@123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      email: 'admin@demo.com',
      role: 'admin',
    });
  });

  test('POST /api/auth/login fails on incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'associate@demo.com', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('POST /api/auth/login fails on nonexistent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@demo.com', password: 'Demo@123' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('POST /api/auth/login fails with 400 on malformed input', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/auth/me returns user profile with valid Bearer token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'associate@demo.com', password: 'Demo@123' });

    const token = loginRes.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toMatchObject({
      email: 'associate@demo.com',
      role: 'associate',
    });
  });

  test('GET /api/auth/me fails with 401 when token is missing', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('GET /api/auth/me fails with 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.payload');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  afterAll(async () => {
    await db.pool.end();
  });
});

