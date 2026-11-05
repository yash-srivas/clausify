const db = require('../config/db');
const aiClient = require('../services/aiClient');

// Helper to enforce multi-tenant organization boundary and role access on findings
async function verifyFindingAccess(findingId, user) {
  const result = await db.query(
    `SELECT f.*, c.organization_id, c.uploaded_by
     FROM findings f
     JOIN contracts c ON f.contract_id = c.id
     WHERE f.id = $1`,
    [findingId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Finding not found');
    err.status = 404;
    err.code = 'FINDING_NOT_FOUND';
    throw err;
  }

  const finding = result.rows[0];

  // Organization tenant isolation
  if (user && user.organization_id && finding.organization_id && finding.organization_id !== user.organization_id) {
    const err = new Error('Finding not found');
    err.status = 404;
    err.code = 'FINDING_NOT_FOUND';
    throw err;
  }

  // Associate ownership isolation
  if (user && user.role === 'associate' && finding.uploaded_by !== user.id) {
    const err = new Error('You do not have permission to access this finding');
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  return finding;
}

// PATCH /api/findings/:id (Update finding status: accepted / dismissed / open)
async function updateFindingStatus(req, res, next) {
  const { id } = req.params;
  const { status } = req.body;

  try {
    await verifyFindingAccess(id, req.user);

    const result = await db.query(
      `UPDATE findings
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    res.locals.entityId = id;
    return res.status(200).json({
      finding: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/findings/:id/comments
async function addComment(req, res, next) {
  const { id } = req.params;
  const { body } = req.body;

  try {
    await verifyFindingAccess(id, req.user);

    const result = await db.query(
      `INSERT INTO comments (finding_id, user_id, body, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, finding_id, user_id, body, created_at`,
      [id, req.user.id, body.trim()]
    );

    res.locals.entityId = result.rows[0].id;
    return res.status(201).json({
      comment: {
        ...result.rows[0],
        user_name: req.user.name,
        user_role: req.user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/findings/:id/comments
async function getComments(req, res, next) {
  const { id } = req.params;

  try {
    await verifyFindingAccess(id, req.user);

    const result = await db.query(
      `SELECT c.*, u.name AS user_name, u.role AS user_role
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.finding_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );

    return res.status(200).json({
      comments: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/findings/:id/rewrite
async function regenerateRewrite(req, res, next) {
  const { id } = req.params;
  const { tone = 'neutral' } = req.body;

  try {
    const finding = await verifyFindingAccess(id, req.user);

    const tplRes = await db.query(
      `SELECT tc.text AS template_text
       FROM findings f
       LEFT JOIN template_clauses tc ON f.template_clause_id = tc.id
       WHERE f.id = $1`,
      [id]
    );
    const templateText = (tplRes.rows[0] && tplRes.rows[0].template_text) || 'Standard safe legal template benchmark clause.';

    const aiRes = await aiClient.rewriteClause({
      findingId: id,
      clauseText: finding.text_span,
      clauseType: finding.clause_type,
      templateClauseText: templateText,
      tone,
    });

    await db.query(
      'UPDATE findings SET suggested_rewrite = $1 WHERE id = $2',
      [aiRes.suggested_rewrite, id]
    );

    res.locals.entityId = id;
    return res.status(200).json({
      finding_id: id,
      suggested_rewrite: aiRes.suggested_rewrite,
      rationale: aiRes.rationale,
      tone,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  updateFindingStatus,
  addComment,
  getComments,
  regenerateRewrite,
};
