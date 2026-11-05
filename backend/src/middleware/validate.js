const fs = require('fs');
const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Clean up uploaded files if validation fails
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach((f) => {
        try { fs.unlinkSync(f.path); } catch (e) {}
      });
    }

    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: errors.array()[0].msg,
        details: errors.array(),
      },
    });
  }
  next();
}

module.exports = validate;
