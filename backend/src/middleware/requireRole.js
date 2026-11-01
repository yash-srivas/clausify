function requireRole(...allowedRoles) {
  // Flatten if passed as an array
  const roles = allowedRoles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Forbidden: requires one of the following roles: ${roles.join(', ')}`,
        },
      });
    }

    next();
  };
}

module.exports = requireRole;

