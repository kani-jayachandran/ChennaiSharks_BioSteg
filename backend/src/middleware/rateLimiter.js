import { RateLimitError } from './errorHandler.js';

// Simple in-memory rate limiter
class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.cleanup();
  }

  // Clean up old entries every 5 minutes
  cleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.requests.entries()) {
        if (now - data.resetTime > 0) {
          this.requests.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  // Check if request is allowed
  isAllowed(identifier, limit, windowMs) {
    const now = Date.now();
    const key = identifier;
    
    if (!this.requests.has(key)) {
      this.requests.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return { allowed: true, remaining: limit - 1 };
    }

    const data = this.requests.get(key);
    
    // Reset window if expired
    if (now > data.resetTime) {
      this.requests.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return { allowed: true, remaining: limit - 1 };
    }

    // Check if limit exceeded
    if (data.count >= limit) {
      return { 
        allowed: false, 
        remaining: 0,
        resetTime: data.resetTime
      };
    }

    // Increment count
    data.count++;
    return { 
      allowed: true, 
      remaining: limit - data.count 
    };
  }
}

const limiter = new RateLimiter();

// Rate limiting configurations
const RATE_LIMITS = {
  // General API requests
  general: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // requests per window
  },
  
  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10 // requests per window
  },
  
  // Document upload
  upload: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20 // requests per window
  },
  
  // Biometric verification
  biometric: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10 // requests per window
  }
};

// Create rate limiter middleware
export const createRateLimiter = (type = 'general') => {
  const config = RATE_LIMITS[type] || RATE_LIMITS.general;
  
  return (req, res, next) => {
    // Use IP address as identifier, could be enhanced with user ID
    const identifier = req.ip || req.connection.remoteAddress || 'unknown';
    
    const result = limiter.isAllowed(identifier, config.max, config.windowMs);
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': config.max,
      'X-RateLimit-Remaining': result.remaining || 0,
      'X-RateLimit-Window': Math.ceil(config.windowMs / 1000)
    });
    
    if (result.resetTime) {
      res.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
    }
    
    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      res.set('Retry-After', retryAfter);
      
      throw new RateLimitError(`Too many requests. Try again in ${retryAfter} seconds.`);
    }
    
    next();
  };
};

// Default rate limiter for all routes
export const rateLimiter = createRateLimiter('general');

// Specific rate limiters
export const authRateLimiter = createRateLimiter('auth');
export const uploadRateLimiter = createRateLimiter('upload');
export const biometricRateLimiter = createRateLimiter('biometric');