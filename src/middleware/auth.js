import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * Middleware to verify JWT token and authenticate user
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'MISSING_TOKEN'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Handle demo user
    if (decoded.userId === 'demo_user_1') {
      req.user = {
        id: 'demo_user_1',
        email: 'demo@example.com',
        role: 'user',
        createdAt: '2024-01-01T00:00:00Z'
      };
      return next();
    }

    // For non-demo users, check with Supabase if available
    if (!supabaseAdmin) {
      return res.status(503).json({ 
        error: 'Authentication service unavailable in demo mode',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // Get user from Supabase to ensure they still exist and are active
    const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(decoded.userId);
    
    if (error || !user) {
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Check if user is confirmed
    if (!user.user.email_confirmed_at) {
      return res.status(401).json({ 
        error: 'Email not confirmed',
        code: 'EMAIL_NOT_CONFIRMED'
      });
    }

    // Add user info to request object
    req.user = {
      id: user.user.id,
      email: user.user.email,
      role: user.user.user_metadata?.role || 'user',
      createdAt: user.user.created_at
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token format',
        code: 'MALFORMED_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(500).json({ 
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

/**
 * Middleware to check user role
 */
export const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    if (req.user.role !== requiredRole && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: `Access denied. Required role: ${requiredRole}`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

/**
 * Middleware to validate user owns the resource
 */
export const validateResourceOwnership = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.id;

    // Check if document belongs to the user
    const { data: document, error } = await supabaseAdmin
      .from('documents')
      .select('user_id')
      .eq('id', documentId)
      .single();

    if (error) {
      return res.status(404).json({ 
        error: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    if (document.user_id !== userId) {
      return res.status(403).json({ 
        error: 'Access denied. You do not own this document',
        code: 'NOT_RESOURCE_OWNER'
      });
    }

    next();
  } catch (error) {
    console.error('Resource ownership validation error:', error);
    return res.status(500).json({ 
      error: 'Authorization service error',
      code: 'AUTHZ_SERVICE_ERROR'
    });
  }
};

/**
 * Generate JWT token for user
 */
export const generateToken = (userId, email, role = 'user') => {
  const payload = {
    userId,
    email,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };

  return jwt.sign(payload, process.env.JWT_SECRET);
};

/**
 * Refresh token validation
 */
export const validateRefreshToken = async (refreshToken) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.refreshSession(refreshToken);
    
    if (error || !data.session) {
      return { success: false, error: 'Invalid refresh token' };
    }

    return { 
      success: true, 
      session: data.session,
      user: data.user 
    };
  } catch (error) {
    console.error('Refresh token validation error:', error);
    return { success: false, error: 'Token validation failed' };
  }
};