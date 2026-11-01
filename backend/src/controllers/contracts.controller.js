const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const aiClient = require('../services/aiClient');
const workflow = require('../services/contractWorkflow');
const { validatePdfMagicBytes } = require('../utils/fileValidator');

// Helper to run ingestion and analysis asynchronously
async function runAsyncPipeline(contractId, filePath, templateId) {
  try {
    // 1. Mark as processing
    await workflow.transitionContract(contractId, workflow.STATUSES.PROCESSING);

    // 2. Call AI service /ingest
    await aiClient.ingestContract({ contractId, filePath });

    // 3. Call AI service /analyze
    await aiClient.analyzeContract({ contractId, templateId });
    console.log(`[Pipeline] Contract ${contractId} successfully analyzed!`);
  } catch (err) {
    const reason =
      err.response?.data?.detail?.error?.code ||
      err.response?.data?.detail?.error?.message ||
      err.message ||
      'Analysis pipeline failed';

    console.error(`[Pipeline Error] Contract ${contractId} failed:`, reason);

    await db.query(
      `UPDATE contracts
       SET status = 'failed', failure_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [reason, contractId]
    );
  }
}

// POST /api/contracts (Upload & Trigger Analysis)
async function uploadContract(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { code: 'FILE_REQUIRED', message: 'PDF file upload is required' },
      });
    }

    // Verify magic bytes
    if (!validatePdfMagicBytes(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
      return res.status(400).json({
        error: { code: 'INVALID_PDF_HEADER', message: 'Uploaded file is not a valid PDF document' },
      });
    }

    const title = (req.body.title || req.file.originalname).trim();
    let templateId = req.body.template_id;

    // Default to active template if not provided
    if (!templateId) {
      const tplRes = await db.query(
        "SELECT id FROM templates WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1"
      );
      if (tplRes.rows.length > 0) {
        templateId = tplRes.rows[0].id;
      }
    }

    const insertRes = await db.query(
      `INSERT INTO contracts (
        title, original_filename, file_path, uploaded_by, template_id, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'uploaded', NOW(), NOW())
      RETURNING id, title, original_filename, file_path, template_id, status, created_at`,
      [title, req.file.originalname, req.file.path, req.user.id, templateId || null]
    );

    const contract = insertRes.rows[0];
    res.locals.entityId = contract.id;

    // Respond 202 immediately per Section 6.3
    res.status(202).json({
      message: 'Contract uploaded successfully and queued for analysis',
      contract,
    });

    // Run pipeline in background
    runAsyncPipeline(contract.id, contract.file_path, contract.template_id);
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }
    next(err);
  }
}

// GET /api/contracts
async function getContracts(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = (page - 1) * limit;
    const { status, mine, search } = req.query;

    let queryText = `
      SELECT c.id, c.title, c.original_filename, c.page_count, c.status,
             c.failure_reason, c.overall_risk_score, c.created_at, c.updated_at, c.analyzed_at,
             u.id AS uploader_id, u.name AS uploader_name, u.email AS uploader_email,
             t.id AS template_id, t.name AS template_name
      FROM contracts c
      LEFT JOIN users u ON c.uploaded_by = u.id
      LEFT JOIN templates t ON c.template_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      queryText += ` AND c.status = $${params.length}`;
    }

    // Associates can see their own contracts, or if mine=true requested
    if (mine === 'true' || req.user.role === 'associate') {
      params.push(req.user.id);
      queryText += ` AND c.uploaded_by = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      queryText += ` AND (c.title ILIKE $${params.length} OR c.original_filename ILIKE $${params.length})`;
    }

    const countRes = await db.query(
      `SELECT count(*) FROM (${queryText}) AS total_count`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    params.push(limit, offset);
    queryText += ` ORDER BY c.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await db.query(queryText, params);

    return res.status(200).json({
      contracts: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/contracts/:id
async function getContractById(req, res, next) {
  const { id } = req.params;
  try {
    const contractRes = await db.query(
      `SELECT c.*, u.name AS uploader_name, u.email AS uploader_email,
              t.name AS template_name, t.version AS template_version
       FROM contracts c
       LEFT JOIN users u ON c.uploaded_by = u.id
       LEFT JOIN templates t ON c.template_id = t.id
       WHERE c.id = $1`,
      [id]
    );

    if (contractRes.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });
    }

    const contract = contractRes.rows[0];

    // Fetch approvals / history
    const approvalsRes = await db.query(
      `SELECT a.*, u.name AS decided_by_name, u.role AS decided_by_role
       FROM approvals a
       JOIN users u ON a.decided_by = u.id
       WHERE a.contract_id = $1
       ORDER BY a.decided_at DESC`,
      [id]
    );

    return res.status(200).json({
      contract,
      approvals: approvalsRes.rows,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/contracts/:id/file (Stream PDF)
async function streamContractFile(req, res, next) {
  const { id } = req.params;
  try {
    const result = await db.query('SELECT file_path, original_filename FROM contracts WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });
    }

    const { file_path, original_filename } = result.rows[0];
    const absolutePath = path.isAbsolute(file_path) ? file_path : path.resolve(file_path);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        error: { code: 'FILE_NOT_FOUND_ON_DISK', message: 'PDF file is missing on server storage' },
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(original_filename)}"`);
    const stream = fs.createReadStream(absolutePath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

// GET /api/contracts/:id/findings
async function getContractFindings(req, res, next) {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT f.*, tc.title AS template_clause_title
       FROM findings f
       LEFT JOIN template_clauses tc ON f.template_clause_id = tc.id
       WHERE f.contract_id = $1
       ORDER BY f.page ASC, f.created_at ASC`,
      [id]
    );

    return res.status(200).json({
      findings: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/contracts/:id/reanalyze
async function reanalyzeContract(req, res, next) {
  const { id } = req.params;
  const { template_id } = req.body;

  try {
    const contractRes = await db.query('SELECT * FROM contracts WHERE id = $1', [id]);
    if (contractRes.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });
    }

    const contract = contractRes.rows[0];
    const targetTemplateId = template_id || contract.template_id;

    if (template_id) {
      await db.query('UPDATE contracts SET template_id = $1 WHERE id = $2', [targetTemplateId, id]);
    }

    // Trigger pipeline
    res.locals.entityId = id;
    res.status(202).json({
      message: 'Reanalysis started',
      contract_id: id,
    });

    runAsyncPipeline(contract.id, contract.file_path, targetTemplateId);
  } catch (err) {
    next(err);
  }
}

// POST /api/contracts/:id/submit (Associate submits for approval)
async function submitForApproval(req, res, next) {
  const { id } = req.params;
  try {
    const updated = await workflow.transitionContract(id, workflow.STATUSES.ESCALATED);
    res.locals.entityId = id;
    return res.status(200).json({
      message: 'Contract submitted for partner review',
      contract: updated,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/contracts/:id/approve (Partner approves)
async function approveContract(req, res, next) {
  const { id } = req.params;
  const { note } = req.body;
  try {
    const updated = await workflow.transitionContract(id, workflow.STATUSES.APPROVED);

    await db.query(
      `INSERT INTO approvals (contract_id, decided_by, decision, note, decided_at)
       VALUES ($1, $2, 'approved', $3, NOW())`,
      [id, req.user.id, note || null]
    );

    res.locals.entityId = id;
    return res.status(200).json({
      message: 'Contract approved successfully',
      contract: updated,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/contracts/:id/reject (Partner rejects)
async function rejectContract(req, res, next) {
  const { id } = req.params;
  const { note } = req.body;
  try {
    const updated = await workflow.transitionContract(id, workflow.STATUSES.REJECTED);

    await db.query(
      `INSERT INTO approvals (contract_id, decided_by, decision, note, decided_at)
       VALUES ($1, $2, 'rejected', $3, NOW())`,
      [id, req.user.id, note || null]
    );

    res.locals.entityId = id;
    return res.status(200).json({
      message: 'Contract rejected',
      contract: updated,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/contracts/:id/request-changes (Partner requests changes)
async function requestChanges(req, res, next) {
  const { id } = req.params;
  const { note } = req.body;
  try {
    const updated = await workflow.transitionContract(id, workflow.STATUSES.IN_REVIEW);

    await db.query(
      `INSERT INTO approvals (contract_id, decided_by, decision, note, decided_at)
       VALUES ($1, $2, 'changes_requested', $3, NOW())`,
      [id, req.user.id, note || null]
    );

    res.locals.entityId = id;
    return res.status(200).json({
      message: 'Changes requested, returned to associate review',
      contract: updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadContract,
  getContracts,
  getContractById,
  streamContractFile,
  getContractFindings,
  reanalyzeContract,
  submitForApproval,
  approveContract,
  rejectContract,
  requestChanges,
  runAsyncPipeline,
};

