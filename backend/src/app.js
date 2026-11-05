const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const config = require('./config/env');
const { auditMiddleware } = require('./middleware/audit');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const contractsRoutes = require('./routes/contracts.routes');
const findingsRoutes = require('./routes/findings.routes');
const templatesRoutes = require('./routes/templates.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled for PDF.js / CDN scripts in development
  })
);

// CORS Allow-List
app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : [config.corsOrigin, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  })
);

// HTTP Request Logger
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' || process.env.NODE_ENV !== 'production',
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this IP, please try again later',
    },
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  skip: () => process.env.NODE_ENV === 'test' || process.env.NODE_ENV !== 'production',
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts, please try again later',
    },
  },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);

// Audit middleware on API routes
app.use('/api', auditMiddleware);

// Serve Frontend statically with no-cache headers in development so browser immediately receives updates
const frontendDir = path.join(__dirname, '../../frontend');
app.use(
  express.static(frontendDir, {
    etag: false,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
      }
    },
  })
);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/findings', findingsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'backend',
    timestamp: new Date().toISOString(),
  });
});

// 404 Handler for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    },
  });
});

// Central Error Handler
app.use(errorHandler);

module.exports = app;
