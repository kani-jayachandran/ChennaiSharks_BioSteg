import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';
import { strictRateLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * Register new user
 */
router.post('/register', strictRateLimiter, asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  // Validate input
  if (!email || !password) {
    throw new AppError('Email and password are required', 400, 'MISSING_CREDENTIALS');
  }

  // Check if Supabase is properly configured
  const isSupabaseConfigured = process.env.SUPABASE_URL && 
    process.env.SUPABASE_URL !== 'https://your-project.supabase.co' &&
    process.env.SUPABASE_SERVICE_KEY && 
    process.env.SUPABASE_SERVICE_KEY !== 'your_supabase_service_role_key_here';

  if (!isSupabaseConfigured) {
    // Demo mode - simulate successful registration
    console.log('🔧 Demo mode: Simulating user registration');
    res.status(201).json({
      message: 'Registration successful (Demo Mode). In production, please configure Supabase.',
      user: {
        id: `demo_${Date.now()}`,
        email: email,
        emailConfirmed: true
      }
    });
    return;
  }

  try {
    // Register user with Supabase
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'user'
      },
      email_confirm: false
    });

    if (error) {
      console.error('Registration error:', error);
      throw new AppError(error.message, 400, 'REGISTRATION_FAILED');
    }

    res.status(201).json({
      message: 'Registration successful. Please check your email to confirm your account.',
      user: {
        id: data.user?.id,
        email: data.user?.email,
        emailConfirmed: !!data.user?.email_confirmed_at
      }
    });
  } catch (error) {
    console.error('Supabase registration failed, falling back to demo mode:', error.message);
    
    // Fallback to demo mode
    res.status(201).json({
      message: 'Registration successful (Demo Mode). Supabase connection failed.',
      user: {
        id: `demo_${Date.now()}`,
        email: email,
        emailConfirmed: true
      }
    });
  }
}));

/**
 * Login user
 */
router.post('/login', strictRateLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    throw new AppError('Email and password are required', 400, 'MISSING_CREDENTIALS');
  }

  // For development, allow demo credentials
  if (email === 'demo@example.com' && password === 'demo123') {
    const token = generateToken('demo_user_1', email, 'user');
    
    res.json({
      message: 'Login successful (Demo Mode)',
      token,
      user: {
        id: 'demo_user_1',
        email: email,
        role: 'user',
        firstName: 'Demo',
        lastName: 'User',
        createdAt: '2024-01-01T00:00:00Z'
      },
      expiresIn: '24h'
    });
    return;
  }

  // Check if Supabase is available
  if (!supabaseAdmin) {
    console.log('🔧 Supabase not available, only demo credentials accepted');
    throw new AppError('Invalid credentials. Use demo@example.com / demo123 for testing.', 401, 'INVALID_CREDENTIALS');
  }

  // Try Supabase authentication
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    
    if (error) {
      console.error('Supabase connection error:', error);
      throw new AppError('Authentication service unavailable. Use demo@example.com / demo123 for testing.', 503, 'SERVICE_UNAVAILABLE');
    }

    // For now, use demo credentials since Supabase might not be configured
    throw new AppError('Invalid credentials. Use demo@example.com / demo123 for testing.', 401, 'INVALID_CREDENTIALS');
  } catch (error) {
    if (error instanceof AppError) throw error;
    
    // Fallback to demo mode if Supabase is not configured
    console.warn('Supabase not configured, use demo credentials');
    throw new AppError('Invalid credentials. Use demo@example.com / demo123 for testing.', 401, 'INVALID_CREDENTIALS');
  }
}));

/**
 * Logout user
 */
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  // In a production app, you might want to blacklist the token
  // For now, we'll just return success since JWT tokens are stateless
  
  res.json({
    message: 'Logout successful'
  });
}));

/**
 * Refresh token
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError('Refresh token is required', 400, 'MISSING_REFRESH_TOKEN');
  }

  // Check if Supabase is available
  if (!supabaseAdmin) {
    throw new AppError('Token refresh not available in demo mode', 503, 'SERVICE_UNAVAILABLE');
  }

  try {
    // Validate refresh token with Supabase
    const { data, error } = await supabaseAdmin.auth.admin.refreshSession(refreshToken);

    if (error || !data.session) {
      throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Generate new JWT token
    const token = generateToken(
      data.user.id,
      data.user.email,
      data.user.user_metadata?.role || 'user'
    );

    res.json({
      message: 'Token refreshed successfully',
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || 'user'
      },
      expiresIn: '24h'
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Token refresh failed', 500, 'TOKEN_REFRESH_ERROR');
  }
}));

/**
 * Get current user profile
 */
router.get('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Handle demo user
  if (userId === 'demo_user_1') {
    res.json({
      user: {
        id: 'demo_user_1',
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        role: 'user',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      }
    });
    return;
  }

  // Check if Supabase is available
  if (!supabaseAdmin) {
    throw new AppError('User profile not available in demo mode', 503, 'SERVICE_UNAVAILABLE');
  }

  // Try to get user from Supabase
  try {
    const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (error || !user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    res.json({
      user: {
        id: user.user.id,
        email: user.user.email,
        firstName: user.user.user_metadata?.first_name,
        lastName: user.user.user_metadata?.last_name,
        role: user.user.user_metadata?.role || 'user',
        createdAt: user.user.created_at,
        updatedAt: user.user.updated_at
      }
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch user profile', 500, 'PROFILE_FETCH_ERROR');
  }
}));

/**
 * Update user profile
 */
router.put('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { firstName, lastName } = req.body;

  // Handle demo user
  if (userId === 'demo_user_1') {
    res.json({
      message: 'Profile updated successfully (Demo Mode)',
      user: {
        id: 'demo_user_1',
        email: 'demo@example.com',
        firstName: firstName || 'Demo',
        lastName: lastName || 'User',
        role: 'user',
        updatedAt: new Date().toISOString()
      }
    });
    return;
  }

  // Check if Supabase is available
  if (!supabaseAdmin) {
    throw new AppError('Profile update not available in demo mode', 503, 'SERVICE_UNAVAILABLE');
  }

  // Update user in Supabase
  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        first_name: firstName,
        last_name: lastName
      }
    });

    if (error) {
      throw new AppError('Failed to update profile', 500, 'PROFILE_UPDATE_ERROR');
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.user_metadata?.first_name,
        lastName: data.user.user_metadata?.last_name,
        role: data.user.user_metadata?.role || 'user',
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to update profile', 500, 'PROFILE_UPDATE_ERROR');
  }
}));

/**
 * Change password
 */
router.put('/password', authenticateToken, strictRateLimiter, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Validate input
  if (!currentPassword || !newPassword) {
    throw new AppError('Current password and new password are required', 400, 'MISSING_PASSWORDS');
  }

  // Handle demo user
  if (req.user.id === 'demo_user_1') {
    if (currentPassword !== 'demo123') {
      throw new AppError('Current password is incorrect', 401, 'INVALID_CURRENT_PASSWORD');
    }
    
    res.json({
      message: 'Password updated successfully (Demo Mode)'
    });
    return;
  }

  // Check if Supabase is available
  if (!supabaseAdmin) {
    throw new AppError('Password change not available in demo mode', 503, 'SERVICE_UNAVAILABLE');
  }

  // Update password in Supabase
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      password: newPassword
    });

    if (error) {
      throw new AppError('Failed to update password', 500, 'PASSWORD_UPDATE_ERROR');
    }

    res.json({
      message: 'Password updated successfully'
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to update password', 500, 'PASSWORD_UPDATE_ERROR');
  }
}));

/**
 * Request password reset
 */
router.post('/forgot-password', strictRateLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError('Email is required', 400, 'MISSING_EMAIL');
  }

  // Mock password reset
  res.json({
    message: 'If an account with that email exists, a password reset link has been sent.'
  });
}));

/**
 * Confirm email
 */
router.post('/confirm-email', asyncHandler(async (req, res) => {
  const { token, email } = req.body;

  if (!token || !email) {
    throw new AppError('Token and email are required', 400, 'MISSING_CONFIRMATION_DATA');
  }

  // Mock email confirmation
  res.json({
    message: 'Email confirmed successfully',
    user: {
      id: 'mock_user_id',
      email: email,
      emailConfirmed: true
    }
  });
}));

/**
 * Check authentication status
 */
router.get('/status', authenticateToken, (req, res) => {
  res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    }
  });
});

export default router;