import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.ts';
import { JWTPayload, User } from '../models/types.ts';
import { userRepo, sessionRepo } from '../repositories/store.ts';

const SALT_ROUNDS = 10;

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    } as jwt.SignOptions);
  }

  generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    } as jwt.SignOptions);
  }

  verifyAccessToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, config.jwt.secret) as JWTPayload;
    } catch {
      return null;
    }
  }

  verifyRefreshToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, config.jwt.refreshSecret) as JWTPayload;
    } catch {
      return null;
    }
  }

  async register(email: string, password: string): Promise<{
    user: Omit<User, 'passwordHash'>;
    accessToken: string;
    refreshToken: string;
  }> {
    const existing = await userRepo.findByEmail(email);
    if (existing) {
      throw new Error('Email is already registered');
    }

    const passwordHash = await this.hashPassword(password);
    const user = await userRepo.create({ email, passwordHash });

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      email: user.email,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken,
      refreshToken,
    };
  }

  async login(email: string, password: string): Promise<{
    user: Omit<User, 'passwordHash'>;
    accessToken: string;
    refreshToken: string;
  }> {
    const user = await userRepo.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isMatch = await this.comparePassword(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      email: user.email,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; newRefreshToken: string }> {
    const payload = this.verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new Error('Invalid or expired refresh token');
    }

    const user = await userRepo.findById(payload.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const newPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      email: user.email,
      deviceId: payload.deviceId,
      appType: payload.appType,
    };

    const newAccessToken = this.generateAccessToken(newPayload);
    const newRefreshToken = this.generateRefreshToken(newPayload);

    return {
      accessToken: newAccessToken,
      newRefreshToken,
    };
  }

  async logout(token: string): Promise<void> {
    await sessionRepo.deleteByToken(token);
  }
}

export const authService = new AuthService();
