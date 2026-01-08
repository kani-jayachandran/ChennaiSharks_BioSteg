/**
 * Simple in-memory rate limiter
 * For production, consider using Redis-based rate limiting
 */

const rateLimitStore = new Map();

/**
 * Rate limiting middleware
 */
export const rateLimiter = (req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 100; // Max requests per window

  // Clean up old entries
  if (rateLimitStore.size > 10000) {
    const cutoff = now - windowMs;
    for (const [ip, data] of rateLimitStore.entries()) {
      if (data.resetTime < cutoff) {
        rateLimitStore.delete(ip);
      }
    }
  }

  // Get or create rate limit data for this IP
  let rateLimitData = rateLimitStore.get(key);
  
  if (!rateLimitData || now > rateLimitData.resetTime) {
    // Create new window
    rateLimitData = {
      count: 0,
      resetTime: now + windowMs,
      firstRequest: now
    };
  }

  rateLimitData.count++;
  rateLimitStore.set(key, rateLimitData);

  // Set rate limit headers
  res.set({
    'X-RateLimit-Limit': maxRequests,
    'X-RateLimit-Remaining': Math.max(0, maxRequests - rateLimitData.count),
    'X-RateLimit-Reset': new Date(rateLimitData.resetTime).toISOString()
  });

  // Check if rate limit exceeded
  if (rateLimitData.count > maxRequests) {
    return res.status(429).json({
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000),
      limit: maxRequests,
      windowMs: windowMs
    });
  }

  next();
};

/**
 * Strict rate limiter for sensitive operations
 */
export const strictRateLimiter = (req, res, next) => {
  const key = `strict_${req.ip || 'unknown'}`;
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const maxRequests = 5; // Max 5 requests per 5 minutes

  let rateLimitData = rateLimitStore.get(key);
  
  if (!rateLimitData || now > rateLimitData.resetTime) {
    rateLimitData = {
      count: 0,
      resetTime: now + windowMs,
      firstRequest: now
    };
  }

  rateLimitData.count++;
  rateLimitStore.set(key, rateLimitData);

  res.set({
    'X-RateLimit-Limit': maxRequests,
    'X-RateLimit-Remaining': Math.max(0, maxRequests - rateLimitData.count),
    'X-RateLimit-Reset': new Date(rateLimitData.resetTime).toISOString()
  });

  if (rateLimitData.count > maxRequests) {
    return res.status(429).json({
      error: 'Rate limit exceeded for sensitive operation',
      code: 'STRICT_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000)
    });
  }

  next();
};

/**
 * Upload rate limiter
 */
export const uploadRateLimiter = (req, res, next) => {
  const key = `upload_${req.ip || 'unknown'}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 10; // Max 10 uploads per hour

  let rateLimitData = rateLimitStore.get(key);
  
  if (!rateLimitData || now > rateLimitData.resetTime) {
    rateLimitData = {
      count: 0,
      resetTime: now + windowMs,
      firstRequest: now
    };
  }

  rateLimitData.count++;
  rateLimitStore.set(key, rateLimitData);

  res.set({
    'X-RateLimit-Limit': maxRequests,
    'X-RateLimit-Remaining': Math.max(0, maxRequests - rateLimitData.count),
    'X-RateLimit-Reset': new Date(rateLimitData.resetTime).toISOString()
  });

  if (rateLimitData.count > maxRequests) {
    return res.status(429).json({
      error: 'Upload rate limit exceeded',
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000)
    });
  }

  next();
};