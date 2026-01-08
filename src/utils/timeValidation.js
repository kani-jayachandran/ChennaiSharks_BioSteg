/**
 * Time validation utilities
 */

export const validateAccessTime = (startTime, endTime, currentTime = null) => {
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
        timeRemainingFormatted: formatDuration(end.getTime() - now.getTime())
      };
    } else if (now < start) {
      timeInfo = {
        status: 'not_started',
        timeUntilStart: start.getTime() - now.getTime(),
        timeUntilStartFormatted: formatDuration(start.getTime() - now.getTime())
      };
    } else {
      timeInfo = {
        status: 'expired',
        timeSinceExpiry: now.getTime() - end.getTime(),
        timeSinceExpiryFormatted: formatDuration(now.getTime() - end.getTime())
      };
    }

    return {
      valid: isWithinWindow,
      currentTime: now.toISOString(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      timezone: 'UTC',
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
};

const formatDuration = (milliseconds) => {
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
};