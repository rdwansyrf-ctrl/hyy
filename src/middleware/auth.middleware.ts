import { Request, Response, NextFunction } from 'express';
import { authService } from '../auth/auth.service.ts';
import { JWTPayload } from '../models/types.ts';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header with Bearer token',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = authService.verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired access token',
    });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Ensures that the authenticated caller has a registered deviceId or is an authorized device
 */
export function requireDevice(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  // Device id may come from the token or from request body/headers
  const deviceId = (req.headers['x-device-id'] as string) || req.user.deviceId || req.body?.deviceId;
  if (!deviceId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Device ID is required in token, header (X-Device-Id), or body',
    });
    return;
  }

  next();
}
