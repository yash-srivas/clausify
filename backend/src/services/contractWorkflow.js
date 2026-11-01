const db = require('../config/db');

// Allowed status values
const STATUSES = {
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',
  ANALYZED: 'analyzed',
  FAILED: 'failed',
  IN_REVIEW: 'in_review',
  ESCALATED: 'escalated',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

// Permitted state transitions
const VALID_TRANSITIONS = {
  [STATUSES.UPLOADED]: [STATUSES.PROCESSING, STATUSES.FAILED],
  [STATUSES.PROCESSING]: [STATUSES.ANALYZED, STATUSES.FAILED],
  [STATUSES.ANALYZED]: [STATUSES.IN_REVIEW, STATUSES.ESCALATED, STATUSES.PROCESSING],
  [STATUSES.FAILED]: [STATUSES.PROCESSING],
  [STATUSES.IN_REVIEW]: [STATUSES.ESCALATED, STATUSES.PROCESSING],
  [STATUSES.ESCALATED]: [STATUSES.APPROVED, STATUSES.REJECTED, STATUSES.IN_REVIEW],
  [STATUSES.APPROVED]: [], // Terminal state
  [STATUSES.REJECTED]: [STATUSES.PROCESSING, STATUSES.IN_REVIEW],
};

function canTransition(currentStatus, nextStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.includes(nextStatus));
}

async function transitionContract(contractId, nextStatus, options = {}) {
  const { failureReason = null } = options;

  const result = await db.query('SELECT status FROM contracts WHERE id = $1', [contractId]);
  if (result.rows.length === 0) {
    const err = new Error('Contract not found');
    err.status = 404;
    err.code = 'CONTRACT_NOT_FOUND';
    throw err;
  }

  const currentStatus = result.rows[0].status;

  // Allow idempotent transition to the exact same status
  if (currentStatus === nextStatus) {
    return { id: contractId, status: nextStatus };
  }

  if (!canTransition(currentStatus, nextStatus)) {
    const err = new Error(
      `Illegal contract status transition from '${currentStatus}' to '${nextStatus}'.`
    );
    err.status = 409;
    err.code = 'INVALID_STATUS_TRANSITION';
    throw err;
  }

  const updateResult = await db.query(
    `UPDATE contracts
     SET status = $1,
         failure_reason = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, title, status, failure_reason, overall_risk_score, updated_at`,
    [nextStatus, failureReason, contractId]
  );

  return updateResult.rows[0];
}

module.exports = {
  STATUSES,
  VALID_TRANSITIONS,
  canTransition,
  transitionContract,
};

