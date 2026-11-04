const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/env');

// Ensure upload directory exists
if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (req, file, cb) => {
    const uuid = crypto.randomUUID();
    cb(null, `${uuid}.pdf`);
  },
});

function fileFilter(req, file, cb) {
  // Check extension and mime
  const isPdf =
    file.mimetype === 'application/pdf' ||
    file.mimetype === 'application/x-pdf' ||
    file.originalname.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    const err = new Error('Invalid file format. Only PDF files are supported.');
    err.status = 400;
    err.code = 'INVALID_FILE_TYPE';
    return cb(err, false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxUploadMb * 1024 * 1024,
  },
  fileFilter,
});

function validatePdfMagicBytes(filePath) {
  try {
    const buffer = Buffer.alloc(5);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 5, 0);
    fs.closeSync(fd);
    return buffer.toString('utf-8') === '%PDF-';
  } catch (err) {
    return false;
  }
}

function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

module.exports = {
  upload,
  validatePdfMagicBytes,
  computeFileSha256,
};

