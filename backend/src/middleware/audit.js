const db = require('../config/db');

function sanitizeMetadata(data) {
  if (!data || typeof data !== 'object') return data;
  const sanitized = Array.isArray(data) ? [] : {};
  const sensitiveKeys = ['password', 'token', 'jwt', 'secret', 'authorization', 'apiKey'];

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

async function recordAuditLog({ userId, organizationId, action, entity, entityId, metadata, ip }) {
  try {
    const cleanMeta = sanitizeMetadata(metadata);
    await db.query(
      `INSERT INTO audit_logs (organization_id, user_id, action, entity, entity_id, metadata, ip, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [organizationId || null, userId || null, action, entity, entityId ? String(entityId) : null, cleanMeta ? JSON.stringify(cleanMeta) : null, ip || null]
    );
  } catch (err) {
    console.error('[Audit Logger Error]', err);
  }
}

function auditMiddleware(req, res, next) {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  // Hook into response finish event to capture outcome
  res.on('finish', () => {
    // Determine entity from url path
    const pathParts = req.baseUrl.split('/').concat(req.path.split('/')).filter(Boolean);
    const nonApiParts = pathParts.filter((p) => p !== 'api');
    
    let entity = res.locals.auditEntity;
    if (!entity) {
      if (nonApiParts[0] === 'admin' && nonApiParts[1]) {
        entity = nonApiParts[1];
      } else {
        entity = nonApiParts[0] || 'unknown';
      }
    }

    const entityId = req.params.id || req.body.id || res.locals.entityId || null;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;

    const action = `${req.method} ${req.baseUrl}${req.path} [${res.statusCode}]`;

    recordAuditLog({
      userId: req.user?.id || null,
      organizationId: req.user?.organization_id || req.orgId || null,
      action,
      entity,
      entityId,
      metadata: {
        statusCode: res.statusCode,
        body: req.body,
        query: req.query,
      },
      ip: clientIp,
    });
  });

  next();
}

module.exports = {
  auditMiddleware,
  recordAuditLog,
  sanitizeMetadata,
};
