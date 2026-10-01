export type AppType = 'R' | 'R1';

export type PairingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Device {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  appType: AppType;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Pairing {
  id: string;
  rDeviceId: string;
  r1DeviceId: string;
  status: PairingStatus;
  requestedAt: Date;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  deviceId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface LocationData {
  id?: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  createdAt?: Date;
}

// WebSocket Event Protocol
export type WebSocketEventType =
  // Lifecycle
  | 'auth'
  | 'auth.success'
  | 'auth.error'
  | 'device.online'
  | 'device.offline'
  | 'ping'
  | 'pong'
  // Pairing
  | 'pairing.request'
  | 'pairing.approved'
  | 'pairing.rejected'
  | 'pairing.revoked'
  // Location
  | 'location.update'
  // Camera WebRTC Signaling
  | 'camera.request'
  | 'camera.approved'
  | 'camera.rejected'
  | 'camera.offer'
  | 'camera.answer'
  | 'camera.ice_candidate'
  | 'camera.stop'
  // Screen Sharing WebRTC Signaling
  | 'screen.request'
  | 'screen.approved'
  | 'screen.rejected'
  | 'screen.offer'
  | 'screen.answer'
  | 'screen.ice_candidate'
  | 'screen.stop'
  // System / Error
  | 'error'
  | 'ack';

export interface BaseWSEvent<T = unknown> {
  type: WebSocketEventType;
  deviceId?: string;
  targetDeviceId?: string;
  requestId?: string;
  payload?: T;
  timestamp?: number | string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  deviceId?: string;
  appType?: AppType;
  iat?: number;
  exp?: number;
}
