const express = require('express');
const { param, body } = require('express-validator');
const templatesController = require('../controllers/templates.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(auth);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/templates (Associates, Partners, Admins can view)
router.get('/', templatesController.getTemplates);

// GET /api/templates/:id
router.get(
  '/:id',
  [param('id').matches(UUID_REGEX).withMessage('Valid template UUID is required')],
  validate,
  templatesController.getTemplateById
);

// GET /api/templates/:id/versions
router.get(
  '/:id/versions',
  [param('id').matches(UUID_REGEX).withMessage('Valid template UUID is required')],
  validate,
  templatesController.getTemplateVersions
);

// Mutating template actions require Partner role (Section 6.2)
router.post(
  '/',
  requireRole('partner'),
  [
    body('name').trim().notEmpty().withMessage('Template name is required'),
    body('clauses').optional().isArray().withMessage('Clauses must be an array'),
  ],
  validate,
  templatesController.createTemplate
);

router.put(
  '/:id',
  requireRole('partner'),
  [
    param('id').matches(UUID_REGEX).withMessage('Valid template UUID is required'),
    body('name').optional().trim().notEmpty().withMessage('Template name cannot be empty'),
  ],
  validate,
  templatesController.updateTemplate
);

router.post(
  '/:id/activate',
  requireRole('partner'),
  [param('id').matches(UUID_REGEX).withMessage('Valid template UUID is required')],
  validate,
  templatesController.activateTemplate
);

module.exports = router;

