import { Router } from 'express';
import authRoutes from './auth.routes.ts';
import deviceRoutes from './device.routes.ts';
import pairingRoutes from './pairing.routes.ts';
import locationRoutes from './location.routes.ts';
import { wsManager } from '../websocket/ws.manager.ts';
import { memoryStore } from '../repositories/store.ts';

const router = Router();

// Health Check
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'DOBBLE BACKEND V1',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// System Status & Real-time Metrics
router.get('/status', (_req, res) => {
  res.status(200).json({
    name: 'DOBBLE BACKEND V1',
    version: '1.0.0',
    status: 'OPERATIONAL',
    metrics: {
      registeredUsers: memoryStore.users.size,
      registeredDevices: memoryStore.devices.size,
      activePairings: memoryStore.pairings.size,
      onlineWebSocketDevices: wsManager.getOnlineDevices().length,
      onlineDeviceList: wsManager.getOnlineDevices(),
    },
    protocols: {
      http: 'REST API v1',
      websocket: 'RFC 6455 JSON Framing (/ws)',
      webrtcSignaling: 'SDP Offer/Answer + ICE Relay',
    },
  });
});

// API Documentation Specification Endpoint
router.get('/docs/spec', (_req, res) => {
  res.status(200).json({
    openapi: '3.0.3',
    info: {
      title: 'DOBBLE BACKEND V1 API & WEBSOCKET GATEWAY',
      version: '1.0.0',
      description: 'Communication and WebRTC signaling server between DOBBLE R and DOBBLE R1',
    },
    servers: [
      {
        url: '{protocol}://{host}',
        variables: {
          protocol: { default: 'https', enum: ['http', 'https'] },
          host: { default: 'localhost:3000' },
        },
      },
    ],
    endpoints: {
      auth: [
        { method: 'POST', path: '/api/auth/register', auth: false, desc: 'Register user' },
        { method: 'POST', path: '/api/auth/login', auth: false, desc: 'Authenticate and receive tokens' },
        { method: 'POST', path: '/api/auth/refresh', auth: false, desc: 'Rotate access token' },
        { method: 'POST', path: '/api/auth/logout', auth: true, desc: 'Revoke token session' },
      ],
      devices: [
        { method: 'POST', path: '/api/devices/register', auth: true, desc: 'Register hardware device (R or R1)' },
        { method: 'GET', path: '/api/devices', auth: true, desc: 'List devices owned or paired' },
        { method: 'GET', path: '/api/devices/:id', auth: true, desc: 'Get device info by id or hardware ID' },
        { method: 'DELETE', path: '/api/devices/:id', auth: true, desc: 'Unregister device' },
      ],
      pairing: [
        { method: 'POST', path: '/api/pairing/request', auth: true, desc: 'DOBBLE R initiates pairing to DOBBLE R1' },
        { method: 'GET', path: '/api/pairing/requests', auth: true, desc: 'DOBBLE R1 fetches incoming pending requests' },
        { method: 'POST', path: '/api/pairing/:id/approve', auth: true, desc: 'DOBBLE R1 approves pairing' },
        { method: 'POST', path: '/api/pairing/:id/reject', auth: true, desc: 'DOBBLE R1 rejects pairing' },
        { method: 'POST', path: '/api/pairing/:id/revoke', auth: true, desc: 'Revoke approved pairing' },
      ],
      location: [
        { method: 'POST', path: '/api/location/update', auth: true, desc: 'DOBBLE R uploads GPS coordinates, forwarded to R1' },
        { method: 'GET', path: '/api/location/:deviceId', auth: true, desc: 'Fetch latest GPS fix for approved device' },
      ],
      websocket: {
        path: '/ws',
        protocol: 'WSS / WS with Bearer JWT ?token=<JWT>',
        events: [
          'device.online',
          'device.offline',
          'pairing.request',
          'pairing.approved',
          'pairing.rejected',
          'pairing.revoked',
          'location.update',
          'camera.request',
          'camera.approved',
          'camera.rejected',
          'camera.offer',
          'camera.answer',
          'camera.ice_candidate',
          'camera.stop',
          'screen.request',
          'screen.approved',
          'screen.rejected',
          'screen.offer',
          'screen.answer',
          'screen.ice_candidate',
          'screen.stop',
        ],
      },
    },
  });
});

// Mount Sub-routers
router.use('/auth', authRoutes);
router.use('/devices', deviceRoutes);
router.use('/pairing', pairingRoutes);
router.use('/location', locationRoutes);

export default router;
