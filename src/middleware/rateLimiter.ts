import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.ts';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const clientLimits = new Map<string, RateLimitRecord>();

// Cleanup stale rate limit records every 5 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of clientLimits.entries()) {
    if (now > record.resetTime) {
      clientLimits.delete(key);
    }
  }
}, 300000);
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const record = clientLimits.get(ip);
  if (!record || now > record.resetTime) {
    clientLimits.set(ip, {
      count: 1,
      resetTime: now + config.rateLimit.windowMs,
    });
    next();
    return;
  }

  record.count += 1;
  if (record.count > config.rateLimit.max) {
    res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000),
    });
    return;
  }

  next();
}
