const express = require('express');
const { body, param, query } = require('express-validator');
const adminController = require('../controllers/admin.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');

const router = express.Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// All routes in this file require authenticated admin
router.use(auth);
router.use(requireRole('admin'));

// GET /api/admin/users
router.get('/users', adminController.getUsers);

// POST /api/admin/users
router.post(
  '/users',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['associate', 'partner', 'admin']).withMessage('Role must be associate, partner, or admin'),
  ],
  validate,
  adminController.createUser
);

// PUT /api/admin/users/:id
router.put(
  '/users/:id',
  [
    param('id').matches(UUID_REGEX).withMessage('Valid user UUID is required'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('role').optional().isIn(['associate', 'partner', 'admin']).withMessage('Role must be associate, partner, or admin'),
  ],
  validate,
  adminController.updateUser
);

// PATCH /api/admin/users/:id/status
router.patch(
  '/users/:id/status',
  [
    param('id').matches(UUID_REGEX).withMessage('Valid user UUID is required'),
    body('is_active').isBoolean().withMessage('is_active must be a boolean'),
  ],
  validate,
  adminController.setUserStatus
);

// POST /api/admin/users/:id/reset-password
router.post(
  '/users/:id/reset-password',
  [
    param('id').matches(UUID_REGEX).withMessage('Valid user UUID is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  validate,
  adminController.resetPassword
);

// GET /api/admin/analytics
router.get('/analytics', adminController.getAnalytics);

// GET /api/admin/audit-logs
router.get('/audit-logs', adminController.getAuditLogs);

// GET /api/admin/health
router.get('/health', adminController.getHealth);

module.exports = router;
