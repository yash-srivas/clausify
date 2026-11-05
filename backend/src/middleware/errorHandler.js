const fs = require('fs');

function errorHandler(err, req, res, next) {
  // Clean up uploaded files if an error occurs during processing
  if (req.file && req.file.path) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
  }
  if (req.files && Array.isArray(req.files)) {
    req.files.forEach((f) => {
      try { fs.unlinkSync(f.path); } catch (e) {}
    });
  }

  const status = err.status || err.statusCode || 500;
  const code = err.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
  const message = err.message || 'An unexpected error occurred';

  if (status === 500) {
    console.error(`[Error] 500 at ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(process.env.NODE_ENV === 'development' && status !== 500 && err.details ? { details: err.details } : {}),
    },
  });
}

module.exports = errorHandler;
