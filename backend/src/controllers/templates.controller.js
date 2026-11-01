const db = require('../config/db');
const aiClient = require('../services/aiClient');

// GET /api/templates
async function getTemplates(req, res, next) {
  try {
    const result = await db.query(
      `SELECT t.*, u.name AS creator_name,
              COUNT(tc.id) AS clause_count
       FROM templates t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN template_clauses tc ON t.id = tc.template_id
       GROUP BY t.id, u.name
       ORDER BY t.created_at DESC`
    );

    return res.status(200).json({
      templates: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/templates/:id
async function getTemplateById(req, res, next) {
  const { id } = req.params;
  try {
    const tplRes = await db.query(
      `SELECT t.*, u.name AS creator_name
       FROM templates t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.id = $1`,
      [id]
    );

    if (tplRes.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }

    const clausesRes = await db.query(
      `SELECT id, clause_type, title, text, is_required, version, created_at
       FROM template_clauses
       WHERE template_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    return res.status(200).json({
      template: tplRes.rows[0],
      clauses: clausesRes.rows,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/templates (Create Template)
async function createTemplate(req, res, next) {
  const { name, description, clauses = [] } = req.body;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const tplRes = await client.query(
      `INSERT INTO templates (name, description, version, status, created_by, created_at, updated_at)
       VALUES ($1, $2, 1, 'draft', $3, NOW(), NOW())
       RETURNING *`,
      [name.trim(), description || null, req.user.id]
    );

    const template = tplRes.rows[0];

    for (const c of clauses) {
      await client.query(
        `INSERT INTO template_clauses (template_id, clause_type, title, text, is_required, version, created_at)
         VALUES ($1, $2, $3, $4, $5, 1, NOW())`,
        [template.id, c.clause_type, c.title || c.clause_type, c.text, c.is_required !== false]
      );
    }

    await client.query('COMMIT');
    res.locals.entityId = template.id;

    // Trigger embedding in background
    if (clauses.length > 0) {
      aiClient.embedTemplate({ templateId: template.id }).catch((err) => {
        console.error(`[EmbedTemplate Error] Failed for ${template.id}:`, err.message);
      });
    }

    return res.status(201).json({
      template,
      clauses_count: clauses.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// PUT /api/templates/:id (Update Template with version snapshot)
async function updateTemplate(req, res, next) {
  const { id } = req.params;
  const { name, description, clauses = [] } = req.body;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Fetch current template & clauses for snapshotting
    const currentTplRes = await client.query('SELECT * FROM templates WHERE id = $1', [id]);
    if (currentTplRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }

    const currentTpl = currentTplRes.rows[0];
    const currentClausesRes = await client.query(
      'SELECT id, clause_type, title, text, is_required, version FROM template_clauses WHERE template_id = $1',
      [id]
    );

    // 2. Insert into template_versions
    const snapshot = {
      template: currentTpl,
      clauses: currentClausesRes.rows,
    };

    await client.query(
      `INSERT INTO template_versions (template_id, version, snapshot, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [id, currentTpl.version, JSON.stringify(snapshot), req.user.id]
    );

    // 3. Update template header
    const nextVersion = currentTpl.version + 1;
    const updatedTplRes = await client.query(
      `UPDATE templates
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           version = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name ? name.trim() : null, description !== undefined ? description : null, nextVersion, id]
    );

    // 4. Update or Insert clauses
    for (const c of clauses) {
      await client.query(
        `INSERT INTO template_clauses (template_id, clause_type, title, text, is_required, version, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (template_id, clause_type) DO UPDATE
         SET title = EXCLUDED.title,
             text = EXCLUDED.text,
             is_required = EXCLUDED.is_required,
             version = $6`,
        [id, c.clause_type, c.title || c.clause_type, c.text, c.is_required !== false, nextVersion]
      );
    }

    await client.query('COMMIT');
    res.locals.entityId = id;

    // 5. Trigger re-embedding
    aiClient.embedTemplate({ templateId: id }).catch((err) => {
      console.error(`[Re-embedding Error] Failed for template ${id}:`, err.message);
    });

    return res.status(200).json({
      message: `Template updated to version ${nextVersion} and re-embedding queued`,
      template: updatedTplRes.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/templates/:id/activate
async function activateTemplate(req, res, next) {
  const { id } = req.params;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Archive current active templates
    await client.query("UPDATE templates SET status = 'archived' WHERE status = 'active'");

    // Set target template active
    const result = await client.query(
      "UPDATE templates SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }

    await client.query('COMMIT');
    res.locals.entityId = id;
    return res.status(200).json({
      message: 'Template activated successfully',
      template: result.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// GET /api/templates/:id/versions
async function getTemplateVersions(req, res, next) {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT tv.*, u.name AS changed_by_name, u.email AS changed_by_email
       FROM template_versions tv
       LEFT JOIN users u ON tv.changed_by = u.id
       WHERE tv.template_id = $1
       ORDER BY tv.version DESC`,
      [id]
    );

    return res.status(200).json({
      versions: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  activateTemplate,
  getTemplateVersions,
};

