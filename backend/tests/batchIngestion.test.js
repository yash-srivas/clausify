const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const db = require('../src/config/db');
const aiClient = require('../src/services/aiClient');
const pipelineQueue = require('../src/services/pipelineQueue');

describe('Priority 5: Batch Document Ingestion & Deduplication', () => {
  let associateToken;
  let createdContractIds = [];
  const validPdf1 = path.join(__dirname, 'batch_test_1.pdf');
  const validPdf2 = path.join(__dirname, 'batch_test_2.pdf');
  const corruptFile = path.join(__dirname, 'batch_corrupt.pdf');

  beforeAll(async () => {
    // Acquire associate token
    const aRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'associate@demo.com', password: 'Demo@123' });
    associateToken = aRes.body.token;

    // Create minimal valid PDFs with distinct contents
    fs.writeFileSync(validPdf1, '%PDF-1.4\n%Test PDF One Content\n%%EOF');
    fs.writeFileSync(validPdf2, '%PDF-1.4\n%Test PDF Two Distinct Content\n%%EOF');
    // Create a corrupt file with non-PDF header
    fs.writeFileSync(corruptFile, 'NOT_A_VALID_PDF_HEADER_CONTENT');

    // Mock aiClient so pipeline runs smoothly without calling real LLM
    jest.spyOn(aiClient, 'ingestContract').mockResolvedValue({ page_count: 1, chunk_count: 1 });
    jest.spyOn(aiClient, 'analyzeContract').mockResolvedValue({ overall_risk_score: 50, risk_band: 'MEDIUM', findings: [] });
  });

  afterAll(async () => {
    // Clean up disk files
    [validPdf1, validPdf2, corruptFile].forEach((f) => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });

    // Clean up created contracts from DB
    for (const cid of createdContractIds) {
      const cRes = await db.query('SELECT file_path FROM contracts WHERE id = $1', [cid]);
      if (cRes.rows.length > 0 && cRes.rows[0].file_path) {
        const fullP = path.resolve(__dirname, '..', cRes.rows[0].file_path);
        if (fs.existsSync(fullP)) {
          try { fs.unlinkSync(fullP); } catch (e) {}
        }
      }
      await db.query('DELETE FROM findings WHERE contract_id = $1', [cid]);
      await db.query('DELETE FROM contracts WHERE id = $1', [cid]);
    }
    pipelineQueue.clear();
    await db.pool.end();
  });

  test('POST /api/contracts/batch rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/contracts/batch');
    expect(res.status).toBe(401);
  });

  test('POST /api/contracts/batch rejects empty files with 400', async () => {
    const res = await request(app)
      .post('/api/contracts/batch')
      .set('Authorization', `Bearer ${associateToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILES_REQUIRED');
  });

  test('POST /api/contracts/batch processes multiple PDFs and isolates corrupt file', async () => {
    const res = await request(app)
      .post('/api/contracts/batch')
      .set('Authorization', `Bearer ${associateToken}`)
      .attach('files', validPdf1)
      .attach('files', corruptFile);

    expect(res.status).toBe(202);
    expect(res.body.total).toBe(2);
    expect(res.body.succeeded).toBe(1);
    expect(res.body.failed).toBe(1);

    const validResult = res.body.results.find((r) => r.original_filename.includes('batch_test_1'));
    expect(validResult.success).toBe(true);
    expect(validResult.contract).toHaveProperty('id');
    createdContractIds.push(validResult.contract.id);

    const corruptResult = res.body.results.find((r) => r.original_filename.includes('batch_corrupt'));
    expect(corruptResult.success).toBe(false);
    expect(corruptResult.error.code).toBe('INVALID_PDF_HEADER');
  });

  test('POST /api/contracts/batch detects intra-batch duplicate files', async () => {
    const res = await request(app)
      .post('/api/contracts/batch')
      .set('Authorization', `Bearer ${associateToken}`)
      .attach('files', validPdf2)
      .attach('files', validPdf2); // Same file twice in the same batch

    expect(res.status).toBe(202);
    expect(res.body.total).toBe(2);
    expect(res.body.succeeded).toBe(1);
    expect(res.body.failed).toBe(1);

    const succeeded = res.body.results.find((r) => r.success);
    createdContractIds.push(succeeded.contract.id);

    const rejected = res.body.results.find((r) => !r.success);
    expect(rejected.error.code).toBe('DUPLICATE_IN_BATCH');
  });

  test('POST /api/contracts rejects duplicate submission with 409', async () => {
    // Attempting to upload validPdf1 again should return 409 DUPLICATE_DOCUMENT
    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${associateToken}`)
      .attach('file', validPdf1);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_DOCUMENT');
    expect(res.body.error).toHaveProperty('existing_contract_id');
  });
});
