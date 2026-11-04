const bcrypt = require('bcryptjs');
const db = require('../config/db');
const aiClient = require('../services/aiClient');

// List Users
async function getUsers(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = (page - 1) * limit;
    const { role, is_active } = req.query;

    let queryText = 'SELECT id, organization_id, name, email, role, is_active, created_at, last_login_at FROM users WHERE 1=1';
    const params = [];

    // Tenant isolation: scope to admin's organization
    if (req.user.organization_id) {
      params.push(req.user.organization_id);
      queryText += ` AND organization_id = $${params.length}`;
    }

    if (role) {
      params.push(role);
      queryText += ` AND role = $${params.length}`;
    }

    if (is_active !== undefined) {
      params.push(is_active === 'true');
      queryText += ` AND is_active = $${params.length}`;
    }

    const countResult = await db.query(
      `SELECT count(*) FROM (${queryText}) AS total_count`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    queryText += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await db.query(queryText, params);

    return res.status(200).json({
      users: result.rows,
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

// Create User
async function createUser(req, res, next) {
  const { name, email, password, role } = req.body;
  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'A user with this email address already exists',
        },
      });
    }

    const passwordHash = bcrypt.hashSync(password, 12);
    const orgId = req.user.organization_id || null;
    const result = await db.query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, organization_id, name, email, role, is_active, created_at`,
      [orgId, name.trim(), email.toLowerCase().trim(), passwordHash, role]
    );

    res.locals.entityId = result.rows[0].id;
    return res.status(201).json({
      user: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// Update User details
async function updateUser(req, res, next) {
  const { id } = req.params;
  const { name, email, role } = req.body;

  try {
    const existing = await db.query('SELECT id, organization_id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0 || (req.user.organization_id && existing.rows[0].organization_id !== req.user.organization_id)) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Check email uniqueness if email updated
    if (email) {
      const emailCheck = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [
        email.toLowerCase().trim(),
        id,
      ]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'Email address already in use by another user',
          },
        });
      }
    }

    const result = await db.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           role = COALESCE($3, role)
       WHERE id = $4
       RETURNING id, organization_id, name, email, role, is_active, created_at, last_login_at`,
      [name ? name.trim() : null, email ? email.toLowerCase().trim() : null, role || null, id]
    );

    res.locals.entityId = id;
    return res.status(200).json({
      user: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// Toggle active status (deactivate/reactivate)
async function setUserStatus(req, res, next) {
  const { id } = req.params;
  const { is_active } = req.body;

  try {
    const existing = await db.query('SELECT id, organization_id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0 || (req.user.organization_id && existing.rows[0].organization_id !== req.user.organization_id)) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    const result = await db.query(
      `UPDATE users
       SET is_active = $1
       WHERE id = $2
       RETURNING id, organization_id, name, email, role, is_active`,
      [Boolean(is_active), id]
    );

    res.locals.entityId = id;
    return res.status(200).json({
      user: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// Reset Password
async function resetPassword(req, res, next) {
  const { id } = req.params;
  const { password } = req.body;

  try {
    const existing = await db.query('SELECT id, organization_id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0 || (req.user.organization_id && existing.rows[0].organization_id !== req.user.organization_id)) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    const passwordHash = bcrypt.hashSync(password, 12);
    const result = await db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, email',
      [passwordHash, id]
    );

    res.locals.entityId = id;
    return res.status(200).json({
      message: 'Password reset successfully',
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/analytics (KPIs + Chart.js aggregates)
async function getAnalytics(req, res, next) {
  try {
    const orgId = req.user.organization_id;
    const orgFilter = orgId ? 'AND organization_id = $1' : '';
    const orgWhere = orgId ? 'WHERE organization_id = $1' : '';
    const params = orgId ? [orgId] : [];

    // 1. Processed count
    const processedRes = await db.query(
      `SELECT count(*) FROM contracts WHERE status IN ('analyzed', 'in_review', 'escalated', 'approved', 'rejected') ${orgFilter}`,
      params
    );
    const contractsProcessed = parseInt(processedRes.rows[0].count, 10);

    // 2. Average risk score
    const avgScoreRes = await db.query(
      `SELECT round(avg(overall_risk_score)::numeric, 1) FROM contracts WHERE overall_risk_score IS NOT NULL ${orgFilter}`,
      params
    );
    const avgRiskScore = parseFloat(avgScoreRes.rows[0].round) || 0;

    // 3. Status breakdown
    const statusRes = await db.query(
      `SELECT status, count(*) AS count FROM contracts ${orgWhere} GROUP BY status`,
      params
    );
    const statusBreakdown = statusRes.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {});

    // 4. Top flagged clause types
    const clauseRes = await db.query(
      `SELECT f.clause_type,
              count(*) AS flag_count,
              count(CASE WHEN f.risk_level = 'HIGH' THEN 1 END) AS high_count,
              count(CASE WHEN f.risk_level = 'MEDIUM' THEN 1 END) AS medium_count,
              count(CASE WHEN f.risk_level = 'LOW' THEN 1 END) AS low_count
       FROM findings f
       JOIN contracts c ON f.contract_id = c.id
       ${orgId ? 'WHERE c.organization_id = $1' : ''}
       GROUP BY f.clause_type
       ORDER BY count(*) DESC
       LIMIT 6`,
      params
    );

    // 5. API token usage
    const apiRes = await db.query(
      `SELECT service,
              coalesce(sum(tokens_in), 0) AS tokens_in,
              coalesce(sum(tokens_out), 0) AS tokens_out,
              count(*) AS call_count
       FROM api_usage
       GROUP BY service`
    );

    // 6. Contracts per day (timeline for Chart.js)
    const perDayRes = await db.query(
      `SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*) AS count
       FROM contracts
       ${orgWhere}
       GROUP BY to_char(created_at, 'YYYY-MM-DD')
       ORDER BY day ASC
       LIMIT 14`,
      params
    );

    return res.status(200).json({
      contracts_processed: contractsProcessed,
      avg_risk_score: avgRiskScore,
      status_breakdown: statusBreakdown,
      top_flagged_clause_types: clauseRes.rows,
      api_usage: apiRes.rows,
      contracts_per_day: perDayRes.rows,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/audit-logs
async function getAuditLogs(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const offset = (page - 1) * limit;
    const { user_id, action, entity } = req.query;

    let queryText = `
      SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Tenant isolation: scope to admin's organization
    if (req.user.organization_id) {
      params.push(req.user.organization_id);
      queryText += ` AND a.organization_id = $${params.length}`;
    }

    if (user_id) {
      params.push(user_id);
      queryText += ` AND a.user_id = $${params.length}`;
    }

    if (action) {
      params.push(`%${action}%`);
      queryText += ` AND a.action ILIKE $${params.length}`;
    }

    if (entity) {
      params.push(entity);
      queryText += ` AND a.entity = $${params.length}`;
    }

    const countRes = await db.query(
      `SELECT count(*) FROM (${queryText}) AS total_count`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    params.push(limit, offset);
    queryText += ` ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await db.query(queryText, params);

    return res.status(200).json({
      audit_logs: result.rows,
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

// GET /api/admin/health (Backend, DB, AI Service health check)
async function getHealth(req, res, next) {
  let dbStatus = 'disconnected';
  let aiServiceStatus = 'unavailable';

  try {
    await db.query('SELECT 1');
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'error';
  }

  try {
    const aiHealth = await aiClient.checkHealth();
    aiServiceStatus = aiHealth.status || 'healthy';
  } catch (e) {
    aiServiceStatus = 'unreachable';
  }

  const isHealthy = dbStatus === 'connected';

  return res.status(isHealthy ? 200 : 503).json({
    status: isHealthy && aiServiceStatus === 'healthy' ? 'healthy' : 'degraded',
    backend: 'connected',
    database: dbStatus,
    ai_service: aiServiceStatus,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  setUserStatus,
  resetPassword,
  getAnalytics,
  getAuditLogs,
  getHealth,
};
