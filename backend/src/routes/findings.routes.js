const express = require('express');
const { param, body } = require('express-validator');
const findingsController = require('../controllers/findings.controller');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(auth);

// PATCH /api/findings/:id
router.patch(
  '/:id',
  [
    param('id').isUUID().withMessage('Valid finding UUID is required'),
    body('status').isIn(['accepted', 'dismissed', 'open']).withMessage('Status must be open, accepted, or dismissed'),
  ],
  validate,
  findingsController.updateFindingStatus
);

// POST /api/findings/:id/comments
router.post(
  '/:id/comments',
  [
    param('id').isUUID().withMessage('Valid finding UUID is required'),
    body('body').trim().notEmpty().withMessage('Comment body is required'),
  ],
  validate,
  findingsController.addComment
);

// GET /api/findings/:id/comments
router.get(
  '/:id/comments',
  [param('id').isUUID().withMessage('Valid finding UUID is required')],
  validate,
  findingsController.getComments
);

// POST /api/findings/:id/rewrite
router.post(
  '/:id/rewrite',
  [
    param('id').isUUID().withMessage('Valid finding UUID is required'),
    body('tone').optional().isIn(['neutral', 'firm']).withMessage('Tone must be neutral or firm'),
  ],
  validate,
  findingsController.regenerateRewrite
);

module.exports = router;

