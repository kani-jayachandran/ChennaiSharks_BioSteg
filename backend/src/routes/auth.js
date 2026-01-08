import express from 'express';
import jwt from 'jsonwebtoken';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { generateToken, validateRefreshToken } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ValidationError, AuthenticationError } from '../middleware/errorHandler.js';

const router = express.Router();

// Apply auth rate limiting to all routes
router.use(authRateLimiter);

// Input validation helper
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return password && password.length >= 8;
};

// Register new user
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  // Validate input
  if (!email || !validateEmail(email)) {
    throw new ValidationError('Valid email is required', 'email');
  }

  if (!password || !validatePassword(password)) {
    throw new ValidationError('Password must be at least 8 characters long', 'password');
  }

  if (!firstName || firstName.trim().length < 2) {
    throw new ValidationError('First name must be at least 2 characters', 'firstName');
  }

  if (!lastName || lastName.trim().length < 2) {
    throw new ValidationError('Last name must be at least 2 characters', 'lastName');
  }

  try {
    // Create user in Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true, // Auto-confirm for demo
      user_metadata: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: 'user',
        createdAt: new Date().toISOString()
      }
    });

    if (error) {
      if (error.message.includes('already registered')) {
        throw new ValidationError('Email already registered', 'email');
      }
      throw new Error(error.message);
    }

    // Generate JWT token
    const token = generateToken(data.user.id, data.user.email, 'user');

    // Create user profile in database
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: data.user.id,
        email: data.user.email,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role: 'user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Continue anyway - profile can be created later
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: data.user.id,
        email: data.user.email,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: 'user'
      },
      token,
      expiresIn: '24h'
    });

  } catch (error) {
    console.error('Registration error:', error);
    throw new AuthenticationError(error.message || 'Registration failed');
  }
}));

// Login user
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !validateEmail(email)) {
    throw new ValidationError('Valid email is required', 'email');
  }

  if (!password) {
    throw new ValidationError('Password is required', 'password');
  }

  try {
    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        throw new AuthenticationError('Invalid email or password');
      }
      throw new AuthenticationError(error.message);
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    // Generate JWT token
    const role = profile?.role || data.user.user_metadata?.role || 'user';
    const token = generateToken(data.user.id, data.user.email, role);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: data.user.id,
        email: data.user.email,
        firstName: profile?.first_name || data.user.user_metadata?.firstName,
        lastName: profile?.last_name || data.user.user_metadata?.lastName,
        role: role
      },
      token,
      expiresIn: '24h'
    });

  } catch (error) {
    console.error('Login error:', error);
    throw new AuthenticationError(error.message || 'Login failed');
  }
}));

// Refresh token
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new ValidationError('Refresh token is required', 'refreshToken');
  }

  try {
    const validation = await validateRefreshToken(refreshToken);
    
    if (!validation.valid) {
      throw new AuthenticationError(validation.error);
    }

    // Generate new JWT token
    const role = validation.user.user_metadata?.role || 'user';
    const token = generateToken(validation.user.id, validation.user.email, role);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      token,
      expiresIn: '24h'
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    throw new AuthenticationError(error.message || 'Token refresh failed');
  }
}));

// Logout user
router.post('/logout', asyncHandler(async (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  // Here we could implement token blacklisting if needed
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

// Get current user profile
router.get('/profile', asyncHandler(async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    throw new AuthenticationError('Access token required');
  }

  try {
    // Verify token and get user
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(decoded.sub);
    
    if (error || !user) {
      throw new AuthenticationError('Invalid token');
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.user.id)
      .single();

    res.json({
      success: true,
      user: {
        id: user.user.id,
        email: user.user.email,
        firstName: profile?.first_name || user.user.user_metadata?.firstName,
        lastName: profile?.last_name || user.user.user_metadata?.lastName,
        role: profile?.role || user.user.user_metadata?.role || 'user',
        createdAt: user.user.created_at
      }
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    throw new AuthenticationError('Failed to fetch profile');
  }
}));

// Change password
router.post('/change-password', asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    throw new AuthenticationError('Access token required');
  }

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current and new passwords are required');
  }

  if (!validatePassword(newPassword)) {
    throw new ValidationError('New password must be at least 8 characters long', 'newPassword');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify current password by attempting login
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: decoded.email,
      password: currentPassword
    });

    if (loginError) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      decoded.sub,
      { password: newPassword }
    );

    if (updateError) {
      throw new Error(updateError.message);
    }

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    throw new AuthenticationError(error.message || 'Password change failed');
  }
}));

export default router;