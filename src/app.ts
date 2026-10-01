import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config/index.ts';
import apiRoutes from './routes/api.routes.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { rateLimiter } from './middleware/rateLimiter.ts';

export function createApp(): Express {
  const app = express();

  // Basic security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // CORS Configuration
  app.use(
    cors({
      origin: config.cors.origin === '*' ? true : config.cors.origin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'Accept'],
    })
  );

  // Body Parsing
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Rate Limiting
  app.use('/api/', rateLimiter);

  // Root Server Banner / JSON Status
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      service: 'DOBBLE BACKEND V1',
      version: '1.0.0',
      status: 'ONLINE',
      mode: config.nodeEnv,
      endpoints: {
        health: '/api/health',
        status: '/api/status',
        spec: '/api/docs/spec',
        websocket: '/ws',
      },
      message: 'DOBBLE R ↔ DOBBLE BACKEND ↔ DOBBLE R1 Gateway is operational',
    });
  });

  // API Routes
  app.use('/api', apiRoutes);

  // 404 Handler for undefined routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: `Endpoint ${req.method} ${req.originalUrl} does not exist on DOBBLE BACKEND V1`,
    });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
