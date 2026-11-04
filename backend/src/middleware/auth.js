const jwt = require('jsonwebtoken');
const config = require('../config/env');
const db = require('../config/db');

async function auth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token missing or invalid format',
        },
      });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Session has expired, please log in again',
          },
        });
      }
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Authentication token is invalid',
        },
      });
    }

    // Verify user exists and is active in database
    const result = await db.query(
      'SELECT id, name, email, role, is_active, organization_id FROM users WHERE id = $1',
      [decoded.sub]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found',
        },
      });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(401).json({
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Account has been deactivated. Please contact an administrator.',
        },
      });
    }

    req.user = user;
    req.orgId = user.organization_id;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = auth;

