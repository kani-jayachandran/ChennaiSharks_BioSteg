/**
 * Time-based access control service
 * Validates document access based on configured time windows
 */
export class TimeValidationService {
  constructor() {
    this.timezone = process.env.TZ || 'UTC';
  }

  /**
   * Validate if current time is within the allowed access window
   */
  validateAccessTime(startTime, endTime, currentTime = null) {
    try {
      const now = currentTime ? new Date(currentTime) : new Date();
      const start = new Date(startTime);
      const end = new Date(endTime);

      // Validate date objects
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return {
          valid: false,
          error: 'Invalid date format',
          code: 'INVALID_DATE_FORMAT'
        };
      }

      // Check if start time is before end time
      if (start >= end) {
        return {
          valid: false,
          error: 'Start time must be before end time',
          code: 'INVALID_TIME_RANGE'
        };
      }

      // Check if current time is within the window
      const isWithinWindow = now >= start && now <= end;
      
      // Calculate time remaining or time since expiry
      let timeInfo = {};
      if (isWithinWindow) {
        timeInfo = {
          status: 'active',
          timeRemaining: end.getTime() - now.getTime(),
          timeRemainingFormatted: this.formatDuration(end.getTime() - now.getTime())
        };
      } else if (now < start) {
        timeInfo = {
          status: 'not_started',
          timeUntilStart: start.getTime() - now.getTime(),
          timeUntilStartFormatted: this.formatDuration(start.getTime() - now.getTime())
        };
      } else {
        timeInfo = {
          status: 'expired',
          timeSinceExpiry: now.getTime() - end.getTime(),
          timeSinceExpiryFormatted: this.formatDuration(now.getTime() - end.getTime())
        };
      }

      return {
        valid: isWithinWindow,
        currentTime: now.toISOString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        timezone: this.timezone,
        ...timeInfo
      };
    } catch (error) {
      console.error('Time validation error:', error);
      return {
        valid: false,
        error: error.message,
        code: 'TIME_VALIDATION_ERROR'
      };
    }
  }

  /**
   * Validate time window configuration
   */
  validateTimeWindow(startTime, endTime) {
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      const now = new Date();

      const errors = [];
      const warnings = [];

      // Check date validity
      if (isNaN(start.getTime())) {
        errors.push('Invalid start time format');
      }

      if (isNaN(end.getTime())) {
        errors.push('Invalid end time format');
      }

      if (errors.length > 0) {
        return { valid: false, errors, warnings };
      }

      // Check logical constraints
      if (start >= end) {
        errors.push('Start time must be before end time');
      }

      // Check if the window is too short (less than 1 minute)
      const duration = end.getTime() - start.getTime();
      if (duration < 60000) { // 1 minute
        warnings.push('Time window is very short (less than 1 minute)');
      }

      // Check if the window is too long (more than 1 year)
      if (duration > 365 * 24 * 60 * 60 * 1000) { // 1 year
        warnings.push('Time window is very long (more than 1 year)');
      }

      // Check if start time is in the past
      if (start < now) {
        warnings.push('Start time is in the past');
      }

      // Check if the window has already expired
      if (end < now) {
        warnings.push('End time is in the past - document will be immediately inaccessible');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        duration: duration,
        durationFormatted: this.formatDuration(duration)
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message],
        warnings: []
      };
    }
  }

  /**
   * Format duration in human-readable format
   */
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get time zones information
   */
  getTimezoneInfo() {
    const now = new Date();
    return {
      current: this.timezone,
      offset: now.getTimezoneOffset(),
      offsetFormatted: this.formatTimezoneOffset(now.getTimezoneOffset()),
      currentTime: now.toISOString(),
      localTime: now.toLocaleString()
    };
  }

  /**
   * Format timezone offset
   */
  formatTimezoneOffset(offsetMinutes) {
    const hours = Math.floor(Math.abs(offsetMinutes) / 60);
    const minutes = Math.abs(offsetMinutes) % 60;
    const sign = offsetMinutes <= 0 ? '+' : '-';
    return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Calculate optimal access window suggestions
   */
  suggestAccessWindows(requestedDuration = 24 * 60 * 60 * 1000) { // Default 24 hours
    const now = new Date();
    const suggestions = [];

    // Immediate access
    suggestions.push({
      name: 'Immediate Access',
      startTime: now.toISOString(),
      endTime: new Date(now.getTime() + requestedDuration).toISOString(),
      description: 'Access starts immediately'
    });

    // Start in 1 hour
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    suggestions.push({
      name: 'Start in 1 Hour',
      startTime: oneHourLater.toISOString(),
      endTime: new Date(oneHourLater.getTime() + requestedDuration).toISOString(),
      description: 'Access starts in 1 hour'
    });

    // Start tomorrow at 9 AM
    const tomorrow9AM = new Date(now);
    tomorrow9AM.setDate(tomorrow9AM.getDate() + 1);
    tomorrow9AM.setHours(9, 0, 0, 0);
    suggestions.push({
      name: 'Tomorrow 9 AM',
      startTime: tomorrow9AM.toISOString(),
      endTime: new Date(tomorrow9AM.getTime() + requestedDuration).toISOString(),
      description: 'Access starts tomorrow at 9:00 AM'
    });

    // Business hours (9 AM - 5 PM)
    const businessStart = new Date(now);
    businessStart.setHours(9, 0, 0, 0);
    if (businessStart <= now) {
      businessStart.setDate(businessStart.getDate() + 1);
    }
    const businessEnd = new Date(businessStart);
    businessEnd.setHours(17, 0, 0, 0);
    
    suggestions.push({
      name: 'Business Hours',
      startTime: businessStart.toISOString(),
      endTime: businessEnd.toISOString(),
      description: 'Access during business hours (9 AM - 5 PM)'
    });

    return suggestions;
  }

  /**
   * Check if document access should be automatically revoked
   */
  shouldRevokeAccess(endTime, gracePeriodMinutes = 5) {
    const now = new Date();
    const end = new Date(endTime);
    const gracePeriod = gracePeriodMinutes * 60 * 1000;

    return now > new Date(end.getTime() + gracePeriod);
  }

  /**
   * Get access status for multiple documents
   */
  batchValidateAccessTime(documents, currentTime = null) {
    const now = currentTime ? new Date(currentTime) : new Date();
    
    return documents.map(doc => {
      const validation = this.validateAccessTime(doc.start_time, doc.end_time, now);
      return {
        documentId: doc.id,
        ...validation
      };
    });
  }

  /**
   * Schedule access revocation check
   */
  scheduleAccessCheck(documentId, endTime, callback) {
    const now = new Date();
    const end = new Date(endTime);
    const delay = end.getTime() - now.getTime();

    if (delay > 0) {
      setTimeout(() => {
        callback(documentId);
      }, delay);
      
      return {
        scheduled: true,
        delay,
        delayFormatted: this.formatDuration(delay)
      };
    }

    return {
      scheduled: false,
      reason: 'End time is in the past'
    };
  }

  /**
   * Parse various date formats
   */
  parseDateTime(dateTimeString) {
    try {
      // Try ISO format first
      let date = new Date(dateTimeString);
      if (!isNaN(date.getTime())) {
        return date;
      }

      // Try other common formats
      const formats = [
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, // YYYY-MM-DD HH:MM:SS
        /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/, // MM/DD/YYYY HH:MM
        /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/, // MM-DD-YYYY HH:MM
      ];

      for (const format of formats) {
        if (format.test(dateTimeString)) {
          date = new Date(dateTimeString);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }

      throw new Error('Unsupported date format');
    } catch (error) {
      throw new Error(`Failed to parse date: ${error.message}`);
    }
  }
}

// Export singleton instance
export const timeValidationService = new TimeValidationService();