const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const config = require('../config/env');
const { recordAuditLog } = require('../middleware/audit');

async function login(req, res, next) {
  const { email, password } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;

  try {
    const result = await db.query(
      'SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      await recordAuditLog({
        userId: null,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'auth',
        entityId: null,
        metadata: { email, reason: 'USER_NOT_FOUND' },
        ip: clientIp,
      });

      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      await recordAuditLog({
        userId: user.id,
        action: 'AUTH_LOGIN_BLOCKED',
        entity: 'auth',
        entityId: user.id,
        metadata: { email, reason: 'ACCOUNT_DEACTIVATED' },
        ip: clientIp,
      });

      return res.status(401).json({
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Account has been deactivated. Please contact an administrator.',
        },
      });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      await recordAuditLog({
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'auth',
        entityId: user.id,
        metadata: { email, reason: 'INCORRECT_PASSWORD' },
        ip: clientIp,
      });

      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Update last_login_at
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Issue JWT
    const token = jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    await recordAuditLog({
      userId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      entity: 'auth',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
      ip: clientIp,
    });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    return res.status(200).json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  getMe,
};

