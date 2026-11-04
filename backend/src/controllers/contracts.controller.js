const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const aiClient = require('../services/aiClient');
const workflow = require('../services/contractWorkflow');
const reportGenerator = require('../services/reportGenerator');
const progressTracker = require('../services/progressTracker');
const pipelineQueue = require('../services/pipelineQueue');
const { validatePdfMagicBytes, computeFileSha256 } = require('../utils/fileValidator');

// Core execution routine for ingestion and risk analysis
async function executePipeline(contractId, filePath, templateId) {
  try {
    // 1. Mark as processing
    await workflow.transitionContract(contractId, workflow.STATUSES.PROCESSING);
    progressTracker.updateProgress(contractId, {
      stage: 'PARSING',
      progress: 20,
      message: 'Extracting text and verifying document pages...',
    });

    // 2. Call AI service /ingest
    const ingestRes = await aiClient.ingestContract({ contractId, filePath });
    progressTracker.updateProgress(contractId, {
      stage: 'CHUNKING',
      progress: 45,
      message: 'Document parsed and chunked into clauses',
      details: { page_count: ingestRes?.page_count, chunk_count: ingestRes?.chunk_count },
    });

    progressTracker.updateProgress(contractId, {
      stage: 'EMBEDDING',
      progress: 65,
      message: 'Generating vector embeddings and semantic indexing...',
    });

    // 3. Call AI service /analyze
    progressTracker.updateProgress(contractId, {
      stage: 'ANALYZING',
      progress: 80,
      message: 'Evaluating risks against benchmark rules and LLM...',
    });

    const analyzeRes = await aiClient.analyzeContract({ contractId, templateId });
    console.log(`[Pipeline] Contract ${contractId} successfully analyzed!`);

    progressTracker.updateProgress(contractId, {
      stage: 'COMPLETED',
      progress: 100,
      message: 'Contract risk analysis complete',
      details: { overall_risk_score: analyzeRes?.overall_risk_score, risk_band: analyzeRes?.risk_band },
    });
  } catch (err) {
    let reason = 'Analysis pipeline failed';
    if (err.code === 'AI_SERVICE_UNAVAILABLE') {
      reason = 'AI microservice is currently offline. Please ensure the AI service is running and retry.';
    } else if (err.response?.data?.detail?.error?.message) {
      reason = err.response.data.detail.error.message;
    } else if (err.response?.data?.detail?.error?.code) {
      reason = err.response.data.detail.error.code;
    } else if (err.message) {
      reason = err.message;
    }

    console.error(`[Pipeline Error] Contract ${contractId} failed:`, reason);

    await db.query(
      `UPDATE contracts
       SET status = 'failed', failure_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [reason, contractId]
    );

    progressTracker.updateProgress(contractId, {
      stage: 'FAILED',
      progress: 100,
      message: reason,
    });
  }
}

// Queue-managed pipeline invoker to respect server resource limits
function runAsyncPipeline(contractId, filePath, templateId) {
  pipelineQueue.enqueue(contractId, () => executePipeline(contractId, filePath, templateId)).catch((err) => {
    console.error(`[Queue Error] Contract ${contractId} execution failed:`, err);
  });
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

    // Compute checksum for deduplication
    const fileHash = await computeFileSha256(req.file.path);
    const orgId = req.user.organization_id || null;

    // Prevent duplicate upload from the same user within organization
    const dupRes = await db.query(
      `SELECT id, title, status FROM contracts
       WHERE uploaded_by = $1 AND file_hash = $2 AND status != 'failed'
         AND (organization_id = $3 OR (organization_id IS NULL AND $3 IS NULL))
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, fileHash, orgId]
    );

    if (dupRes.rows.length > 0) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
      return res.status(409).json({
        error: {
          code: 'DUPLICATE_DOCUMENT',
          message: `A contract with identical content was already uploaded ("${dupRes.rows[0].title}").`,
          existing_contract_id: dupRes.rows[0].id,
          status: dupRes.rows[0].status,
        },
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
        organization_id, title, original_filename, file_path, file_hash, uploaded_by, template_id, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'uploaded', NOW(), NOW())
      RETURNING id, organization_id, title, original_filename, file_path, template_id, status, created_at`,
      [orgId, title, req.file.originalname, req.file.path, fileHash, req.user.id, templateId || null]
    );

    const contract = insertRes.rows[0];
    res.locals.entityId = contract.id;

    progressTracker.updateProgress(contract.id, {
      stage: 'QUEUED',
      progress: 5,
      message: 'Contract uploaded and queued for analysis',
    });

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

// POST /api/contracts/batch (Batch Ingestion of multiple contracts)
async function uploadBatchContracts(req, res, next) {
  const files = req.files;
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({
      error: { code: 'FILES_REQUIRED', message: 'At least one PDF file must be provided in files field' },
    });
  }

  try {
    let templateId = req.body.template_id;
    if (!templateId) {
      const tplRes = await db.query(
        "SELECT id FROM templates WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1"
      );
      if (tplRes.rows.length > 0) {
        templateId = tplRes.rows[0].id;
      }
    }

    const results = [];
    const seenHashesInBatch = new Set();

    for (const file of files) {
      // 1. Verify magic bytes
      if (!validatePdfMagicBytes(file.path)) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        results.push({
          original_filename: file.originalname,
          success: false,
          error: { code: 'INVALID_PDF_HEADER', message: 'Uploaded file is not a valid PDF document' },
        });
        continue;
      }

      // 2. Compute checksum
      let fileHash;
      try {
        fileHash = await computeFileSha256(file.path);
      } catch (e) {
        try { fs.unlinkSync(file.path); } catch (err) {}
        results.push({
          original_filename: file.originalname,
          success: false,
          error: { code: 'HASH_COMPUTATION_FAILED', message: 'Failed to compute file checksum' },
        });
        continue;
      }

      // 3. Intra-batch duplicate check
      if (seenHashesInBatch.has(fileHash)) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        results.push({
          original_filename: file.originalname,
          success: false,
          error: { code: 'DUPLICATE_IN_BATCH', message: 'Identical file appears more than once in this batch' },
        });
        continue;
      }
      seenHashesInBatch.add(fileHash);

      // 4. Database duplicate check
      const orgId = req.user.organization_id || null;
      const dupRes = await db.query(
        `SELECT id, title, status FROM contracts
         WHERE uploaded_by = $1 AND file_hash = $2 AND status != 'failed'
           AND (organization_id = $3 OR (organization_id IS NULL AND $3 IS NULL))
         ORDER BY created_at DESC LIMIT 1`,
        [req.user.id, fileHash, orgId]
      );

      if (dupRes.rows.length > 0) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        results.push({
          original_filename: file.originalname,
          success: false,
          error: {
            code: 'DUPLICATE_DOCUMENT',
            message: `A contract with identical content was already uploaded ("${dupRes.rows[0].title}").`,
            existing_contract_id: dupRes.rows[0].id,
            status: dupRes.rows[0].status,
          },
        });
        continue;
      }

      // 5. Valid contract - save and queue
      const title = file.originalname.replace(/\.[^/.]+$/, '').trim();
      const insertRes = await db.query(
        `INSERT INTO contracts (
          organization_id, title, original_filename, file_path, file_hash, uploaded_by, template_id, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'uploaded', NOW(), NOW())
        RETURNING id, organization_id, title, original_filename, file_path, template_id, status, created_at`,
        [orgId, title, file.originalname, file.path, fileHash, req.user.id, templateId || null]
      );

      const contract = insertRes.rows[0];

      progressTracker.updateProgress(contract.id, {
        stage: 'QUEUED',
        progress: 5,
        message: 'Contract uploaded in batch and queued for analysis',
      });

      // Enqueue in worker queue
      runAsyncPipeline(contract.id, contract.file_path, contract.template_id);

      results.push({
        original_filename: file.originalname,
        success: true,
        contract,
      });
    }

    const succeededCount = results.filter((r) => r.success).length;
    const failedCount = results.length - succeededCount;

    if (succeededCount === 0) {
      return res.status(400).json({
        message: 'All uploaded files in batch failed validation',
        total: results.length,
        succeeded: 0,
        failed: failedCount,
        results,
      });
    }

    return res.status(202).json({
      message: `Batch processed: ${succeededCount} queued, ${failedCount} rejected`,
      total: results.length,
      succeeded: succeededCount,
      failed: failedCount,
      results,
    });
  } catch (err) {
    for (const file of files) {
      if (file.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch (e) {}
      }
    }
    next(err);
  }
}

// Access control validator: enforces multi-tenant organization boundary and role ownership
function verifyContractAccess(contract, user) {
  if (!contract) {
    const err = new Error('Contract not found');
    err.status = 404;
    err.code = 'CONTRACT_NOT_FOUND';
    throw err;
  }
  // Multi-tenant organization isolation
  if (user && user.organization_id && contract.organization_id && contract.organization_id !== user.organization_id) {
    const err = new Error('Contract not found');
    err.status = 404;
    err.code = 'CONTRACT_NOT_FOUND';
    throw err;
  }
  // Associate ownership isolation
  if (user && user.role === 'associate' && (contract.uploaded_by || contract.uploader_id) !== user.id) {
    const err = new Error('You do not have permission to access this contract');
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
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
      SELECT c.id, c.organization_id, c.title, c.original_filename, c.page_count, c.status,
             c.failure_reason, c.overall_risk_score, c.created_at, c.updated_at, c.analyzed_at,
             u.id AS uploader_id, u.name AS uploader_name, u.email AS uploader_email,
             t.id AS template_id, t.name AS template_name
      FROM contracts c
      LEFT JOIN users u ON c.uploaded_by = u.id
      LEFT JOIN templates t ON c.template_id = t.id
      WHERE 1=1
    `;
    const params = [];

    // Tenant isolation: scope to user's organization
    if (req.user.organization_id) {
      params.push(req.user.organization_id);
      queryText += ` AND (c.organization_id = $${params.length} OR c.organization_id IS NULL)`;
    }

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

    // Validate access (tenant boundary + role ownership)
    verifyContractAccess(contract, req.user);

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
    const result = await db.query('SELECT id, organization_id, uploaded_by, file_path, original_filename FROM contracts WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });
    }

    const contract = result.rows[0];
    verifyContractAccess(contract, req.user);

    const { file_path, original_filename } = contract;
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
    const cRes = await db.query('SELECT id, organization_id, uploaded_by FROM contracts WHERE id = $1', [id]);
    if (cRes.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });
    }
    verifyContractAccess(cRes.rows[0], req.user);

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
    verifyContractAccess(contract, req.user);

    // Concurrency guard: reject if already analyzing
    if (contract.status === 'processing' || contract.status === 'uploaded') {
      return res.status(409).json({
        error: {
          code: 'ANALYSIS_ALREADY_IN_PROGRESS',
          message: 'Contract is currently being analyzed. Please wait for completion.',
        },
      });
    }

    const targetTemplateId = template_id || contract.template_id;

    if (template_id) {
      await db.query('UPDATE contracts SET template_id = $1 WHERE id = $2', [targetTemplateId, id]);
    }

    progressTracker.updateProgress(id, {
      stage: 'QUEUED',
      progress: 5,
      message: 'Reanalysis queued',
    });

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
    const cRes = await db.query('SELECT id, organization_id, uploaded_by FROM contracts WHERE id = $1', [id]);
    if (cRes.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });
    }
    verifyContractAccess(cRes.rows[0], req.user);

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
    const cRes = await db.query('SELECT id, organization_id, uploaded_by FROM contracts WHERE id = $1', [id]);
    if (cRes.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });
    }
    verifyContractAccess(cRes.rows[0], req.user);

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
    const cRes = await db.query('SELECT id, organization_id, uploaded_by FROM contracts WHERE id = $1', [id]);
    if (cRes.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });
    }
    verifyContractAccess(cRes.rows[0], req.user);

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
    const cRes = await db.query('SELECT id, organization_id, uploaded_by FROM contracts WHERE id = $1', [id]);
    if (cRes.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });
    }
    verifyContractAccess(cRes.rows[0], req.user);

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

// GET /api/contracts/:id/report/pdf (Direct PDF report download)
async function exportContractPdfReport(req, res, next) {
  const { id } = req.params;
  try {
    const reportData = await reportGenerator.getContractReportData(id);
    verifyContractAccess(reportData.contract, req.user);

    const safeTitle = (reportData.contract.title || reportData.contract.original_filename || 'Contract')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Clausify-Risk-Report-${safeTitle}.pdf"`);

    reportGenerator.buildPdfReport(reportData, res);
  } catch (err) {
    next(err);
  }
}

// GET /api/contracts/:id/report (JSON structured report or PDF via ?format=pdf)
async function getContractReport(req, res, next) {
  const { id } = req.params;
  const { format } = req.query;

  try {
    if (format === 'pdf') {
      return exportContractPdfReport(req, res, next);
    }

    const reportData = await reportGenerator.getContractReportData(id);
    verifyContractAccess(reportData.contract, req.user);

    res.json({
      report: reportData,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/contracts/:id/progress (Server-Sent Events)
async function streamContractProgress(req, res, next) {
  const { id } = req.params;

  try {
    const contractRes = await db.query(
      'SELECT id, organization_id, title, status, failure_reason, overall_risk_score, uploaded_by FROM contracts WHERE id = $1',
      [id]
    );

    if (contractRes.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });
    }

    const contract = contractRes.rows[0];
    verifyContractAccess(contract, req.user);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const sendSse = (eventType, data) => {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // If contract is already in a terminal state
    const isTerminal = ['analyzed', 'in_review', 'approved', 'rejected', 'changes_requested', 'failed'].includes(contract.status);

    if (isTerminal) {
      const isFailed = contract.status === 'failed';
      sendSse('progress', {
        contractId: id,
        stage: isFailed ? 'FAILED' : 'COMPLETED',
        progress: 100,
        message: isFailed ? (contract.failure_reason || 'Analysis failed') : 'Contract analysis completed',
        status: contract.status,
        overall_risk_score: contract.overall_risk_score,
        timestamp: new Date().toISOString(),
      });
      return res.end();
    }

    // Initial state
    const cached = progressTracker.getProgress(id);
    const initialProgress = cached || {
      contractId: id,
      stage: contract.status === 'processing' ? 'PARSING' : 'QUEUED',
      progress: contract.status === 'processing' ? 20 : 5,
      message: contract.status === 'processing' ? 'Processing contract...' : 'Queued for analysis',
      status: contract.status,
      timestamp: new Date().toISOString(),
    };
    sendSse('progress', initialProgress);

    // Heartbeat every 15 seconds
    const heartbeatTimer = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    const onProgress = (event) => {
      sendSse('progress', event);
      if (event.stage === 'COMPLETED' || event.stage === 'FAILED') {
        cleanup();
        res.end();
      }
    };

    progressTracker.on(`progress:${id}`, onProgress);

    const cleanup = () => {
      clearInterval(heartbeatTimer);
      progressTracker.removeListener(`progress:${id}`, onProgress);
    };

    req.on('close', cleanup);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadContract,
  uploadBatchContracts,
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
  getContractReport,
  exportContractPdfReport,
  streamContractProgress,
};

