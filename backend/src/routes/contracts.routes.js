const express = require('express');
const { param, body } = require('express-validator');
const contractsController = require('../controllers/contracts.controller');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const { upload } = require('../utils/fileValidator');

const router = express.Router();

router.use(auth);

// POST /api/contracts (Upload & Analyze single contract)
router.post(
  '/',
  upload.single('file'),
  contractsController.uploadContract
);

// POST /api/contracts/batch (Batch Ingestion of multiple contracts, up to 10 files)
router.post(
  '/batch',
  upload.array('files', 10),
  contractsController.uploadBatchContracts
);

// GET /api/contracts
router.get('/', contractsController.getContracts);

// GET /api/contracts/:id
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Valid contract UUID is required')],
  validate,
  contractsController.getContractById
);

// GET /api/contracts/:id/file (Stream PDF)
router.get(
  '/:id/file',
  [param('id').isUUID().withMessage('Valid contract UUID is required')],
  validate,
  contractsController.streamContractFile
);

// GET /api/contracts/:id/findings
router.get(
  '/:id/findings',
  [param('id').isUUID().withMessage('Valid contract UUID is required')],
  validate,
  contractsController.getContractFindings
);

// POST /api/contracts/:id/reanalyze
router.post(
  '/:id/reanalyze',
  [
    param('id').isUUID().withMessage('Valid contract UUID is required'),
    body('template_id').optional().isUUID().withMessage('Valid template UUID is required'),
  ],
  validate,
  contractsController.reanalyzeContract
);

// POST /api/contracts/:id/submit (Associate submits)
router.post(
  '/:id/submit',
  requireRole('associate', 'partner'),
  [param('id').isUUID().withMessage('Valid contract UUID is required')],
  validate,
  contractsController.submitForApproval
);

// Partner workflow approvals
router.post(
  '/:id/approve',
  requireRole('partner'),
  [param('id').isUUID().withMessage('Valid contract UUID is required')],
  validate,
  contractsController.approveContract
);

router.post(
  '/:id/reject',
  requireRole('partner'),
  [param('id').isUUID().withMessage('Valid contract UUID is required')],
  validate,
  contractsController.rejectContract
);

router.post(
  '/:id/request-changes',
  requireRole('partner'),
  [param('id').isUUID().withMessage('Valid contract UUID is required')],
  validate,
  contractsController.requestChanges
);

// GET /api/contracts/:id/report (JSON executive report)
router.get(
  '/:id/report',
  [param('id').isUUID().withMessage('Valid contract UUID is required')],
  validate,
  contractsController.getContractReport
);

// GET /api/contracts/:id/report/pdf (Downloadable PDF executive report)
router.get(
  '/:id/report/pdf',
  [param('id').isUUID().withMessage('Valid contract UUID is required')],
  validate,
  contractsController.exportContractPdfReport
);

// GET /api/contracts/:id/progress (Server-Sent Events for real-time analysis pipeline progress)
router.get(
  '/:id/progress',
  [param('id').isUUID().withMessage('Valid contract UUID is required')],
  validate,
  contractsController.streamContractProgress
);

module.exports = router;

