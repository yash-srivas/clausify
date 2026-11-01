const db = require('../config/db');
const aiClient = require('../services/aiClient');

// PATCH /api/findings/:id (Update finding status: accepted / dismissed)
async function updateFindingStatus(req, res, next) {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const result = await db.query(
      `UPDATE findings
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'FINDING_NOT_FOUND', message: 'Finding not found' },
      });
    }

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
    const findingCheck = await db.query('SELECT id FROM findings WHERE id = $1', [id]);
    if (findingCheck.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'FINDING_NOT_FOUND', message: 'Finding not found' },
      });
    }

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
    const findingRes = await db.query(
      `SELECT f.*, tc.text AS template_text
       FROM findings f
       LEFT JOIN template_clauses tc ON f.template_clause_id = tc.id
       WHERE f.id = $1`,
      [id]
    );

    if (findingRes.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'FINDING_NOT_FOUND', message: 'Finding not found' },
      });
    }

    const finding = findingRes.rows[0];
    const templateText = finding.template_text || 'Standard safe legal template benchmark clause.';

    const aiRes = await aiClient.rewriteClause({
      findingId: id,
      clauseText: finding.text_span,
      clauseType: finding.clause_type,
      templateClauseText: templateText,
      tone,
    });

    // Optionally update suggested_rewrite in DB
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

