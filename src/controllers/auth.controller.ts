import { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../auth/auth.service.ts';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: (parseResult.error as any).issues || (parseResult.error as any).errors,
      });
      return;
    }

    try {
      const { email, password } = parseResult.data;
      const result = await authService.register(email, password);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message || 'Registration failed',
      });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: (parseResult.error as any).issues || (parseResult.error as any).errors,
      });
      return;
    }

    try {
      const { email, password } = parseResult.data;
      const result = await authService.login(email, password);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      res.status(401).json({
        success: false,
        error: err.message || 'Authentication failed',
      });
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const parseResult = refreshSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: (parseResult.error as any).issues || (parseResult.error as any).errors,
      });
      return;
    }

    try {
      const { refreshToken } = parseResult.data;
      const result = await authService.refresh(refreshToken);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      res.status(401).json({
        success: false,
        error: err.message || 'Token refresh failed',
      });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    const token = req.body?.refreshToken || req.headers.authorization?.split(' ')[1] || '';
    if (token) {
      await authService.logout(token);
    }
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
}

export const authController = new AuthController();
