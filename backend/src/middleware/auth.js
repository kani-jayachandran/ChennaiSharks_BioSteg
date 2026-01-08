import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase.js';

// JWT authentication middleware
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'MISSING_TOKEN'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user exists in Supabase
    const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(decoded.sub);
    
    if (error || !user) {
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Check if user is active
    if (user.user.banned_until || user.user.deleted_at) {
      return res.status(403).json({ 
        error: 'Account suspended or deleted',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    // Attach user info to request
    req.user = {
      id: user.user.id,
      email: user.user.email,
      role: user.user.user_metadata?.role || 'user',
      created_at: user.user.created_at
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token format',
        code: 'MALFORMED_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'EXPIRED_TOKEN'
      });
    }

    return res.status(500).json({ 
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

// Role-based authorization middleware
export const requireRole = (allowedRoles = ['user']) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const userRole = req.user.role || 'user';
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: allowedRoles,
        current: userRole
      });
    }

    next();
  };
};

// Generate JWT token
export const generateToken = (userId, email, role = 'user') => {
  const payload = {
    sub: userId,
    email: email,
    role: role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    issuer: 'biosteg-locker',
    audience: 'biosteg-locker-users'
  });
};

// Refresh token validation
export const validateRefreshToken = async (refreshToken) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.refreshSession(refreshToken);
    
    if (error || !data.session) {
      return { valid: false, error: 'Invalid refresh token' };
    }

    return {
      valid: true,
      session: data.session,
      user: data.user
    };
  } catch (error) {
    console.error('Refresh token validation error:', error);
    return { valid: false, error: 'Token validation failed' };
  }
};