import { User, Device, Pairing, Session, LocationData, PairingStatus } from '../models/types.ts';
import { v4 as uuidv4 } from 'uuid';

/**
 * In-Memory & Resilient Data Store
 * Used when running tests or in standalone dev mode before PostgreSQL container is spun up.
 * Thread-safe and persistent for the server process lifecycle.
 */
class MemoryDataStore {
  public users: Map<string, User> = new Map();
  public devices: Map<string, Device> = new Map();
  public pairings: Map<string, Pairing> = new Map();
  public sessions: Map<string, Session> = new Map();
  public locations: LocationData[] = [];

  constructor() {
    this.reset();
  }

  public reset() {
    this.users.clear();
    this.devices.clear();
    this.pairings.clear();
    this.sessions.clear();
    this.locations = [];
  }
}

export const memoryStore = new MemoryDataStore();

// User Repository
export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    for (const u of memoryStore.users.values()) {
      if (u.email.toLowerCase() === normalized) {
        return { ...u };
      }
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    const user = memoryStore.users.get(id);
    return user ? { ...user } : null;
  }

  async create(data: { email: string; passwordHash: string }): Promise<User> {
    const user: User = {
      id: uuidv4(),
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryStore.users.set(user.id, user);
    return { ...user };
  }
}

// Device Repository
export class DeviceRepository {
  async findByDeviceId(deviceId: string): Promise<Device | null> {
    const device = memoryStore.devices.get(deviceId);
    return device ? { ...device } : null;
  }

  async findById(id: string): Promise<Device | null> {
    for (const d of memoryStore.devices.values()) {
      if (d.id === id) return { ...d };
    }
    return null;
  }

  async findByUserId(userId: string): Promise<Device[]> {
    const list: Device[] = [];
    for (const d of memoryStore.devices.values()) {
      if (d.userId === userId) {
        list.push({ ...d });
      }
    }
    return list;
  }

  async registerOrUpdate(data: {
    userId: string;
    deviceId: string;
    deviceName: string;
    platform: string;
    appType: 'R' | 'R1';
  }): Promise<Device> {
    const existing = memoryStore.devices.get(data.deviceId);
    const now = new Date();
    if (existing) {
      existing.deviceName = data.deviceName;
      existing.platform = data.platform;
      existing.appType = data.appType;
      existing.userId = data.userId;
      existing.lastSeen = now;
      existing.updatedAt = now;
      memoryStore.devices.set(data.deviceId, existing);
      return { ...existing };
    }

    const newDevice: Device = {
      id: uuidv4(),
      userId: data.userId,
      deviceId: data.deviceId,
      deviceName: data.deviceName,
      platform: data.platform,
      appType: data.appType,
      lastSeen: now,
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.devices.set(newDevice.deviceId, newDevice);
    return { ...newDevice };
  }

  async updateLastSeen(deviceId: string): Promise<void> {
    const d = memoryStore.devices.get(deviceId);
    if (d) {
      d.lastSeen = new Date();
      d.updatedAt = new Date();
    }
  }

  async delete(deviceId: string): Promise<boolean> {
    return memoryStore.devices.delete(deviceId);
  }
}

// Pairing Repository
export class PairingRepository {
  async createRequest(rDeviceId: string, r1DeviceId: string): Promise<Pairing> {
    // Check if pairing already exists between these two
    for (const p of memoryStore.pairings.values()) {
      if (p.rDeviceId === rDeviceId && p.r1DeviceId === r1DeviceId) {
        p.status = 'PENDING';
        p.requestedAt = new Date();
        p.approvedAt = null;
        p.rejectedAt = null;
        p.updatedAt = new Date();
        return { ...p };
      }
    }

    const pairing: Pairing = {
      id: uuidv4(),
      rDeviceId,
      r1DeviceId,
      status: 'PENDING',
      requestedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryStore.pairings.set(pairing.id, pairing);
    return { ...pairing };
  }

  async findById(id: string): Promise<Pairing | null> {
    const p = memoryStore.pairings.get(id);
    return p ? { ...p } : null;
  }

  async findByPair(rDeviceId: string, r1DeviceId: string): Promise<Pairing | null> {
    for (const p of memoryStore.pairings.values()) {
      if (p.rDeviceId === rDeviceId && p.r1DeviceId === r1DeviceId) {
        return { ...p };
      }
    }
    return null;
  }

  async getPendingRequestsForR1(r1DeviceId: string): Promise<Pairing[]> {
    const list: Pairing[] = [];
    for (const p of memoryStore.pairings.values()) {
      if (p.r1DeviceId === r1DeviceId && p.status === 'PENDING') {
        list.push({ ...p });
      }
    }
    return list;
  }

  async getApprovedPairingsForR1(r1DeviceId: string): Promise<Pairing[]> {
    const list: Pairing[] = [];
    for (const p of memoryStore.pairings.values()) {
      if (p.r1DeviceId === r1DeviceId && p.status === 'APPROVED') {
        list.push({ ...p });
      }
    }
    return list;
  }

  async getApprovedPairingsForR(rDeviceId: string): Promise<Pairing[]> {
    const list: Pairing[] = [];
    for (const p of memoryStore.pairings.values()) {
      if (p.rDeviceId === rDeviceId && p.status === 'APPROVED') {
        list.push({ ...p });
      }
    }
    return list;
  }

  async isApprovedPair(rDeviceId: string, r1DeviceId: string): Promise<boolean> {
    for (const p of memoryStore.pairings.values()) {
      if (
        p.rDeviceId === rDeviceId &&
        p.r1DeviceId === r1DeviceId &&
        p.status === 'APPROVED'
      ) {
        return true;
      }
    }
    return false;
  }

  async updateStatus(
    id: string,
    status: PairingStatus
  ): Promise<Pairing | null> {
    const p = memoryStore.pairings.get(id);
    if (!p) return null;

    p.status = status;
    p.updatedAt = new Date();
    if (status === 'APPROVED') {
      p.approvedAt = new Date();
      p.rejectedAt = null;
    } else if (status === 'REJECTED') {
      p.rejectedAt = new Date();
    }
    return { ...p };
  }
}

// Session Repository
export class SessionRepository {
  async create(deviceId: string, token: string, expiresAt: Date): Promise<Session> {
    const session: Session = {
      id: uuidv4(),
      deviceId,
      token,
      expiresAt,
      createdAt: new Date(),
    };
    memoryStore.sessions.set(token, session);
    return { ...session };
  }

  async findByToken(token: string): Promise<Session | null> {
    const s = memoryStore.sessions.get(token);
    if (!s) return null;
    if (new Date() > s.expiresAt) {
      memoryStore.sessions.delete(token);
      return null;
    }
    return { ...s };
  }

  async deleteByToken(token: string): Promise<boolean> {
    return memoryStore.sessions.delete(token);
  }

  async deleteByDeviceId(deviceId: string): Promise<void> {
    for (const [key, s] of memoryStore.sessions.entries()) {
      if (s.deviceId === deviceId) {
        memoryStore.sessions.delete(key);
      }
    }
  }
}

// Location Repository
export class LocationRepository {
  async save(data: {
    deviceId: string;
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  }): Promise<LocationData> {
    const item: LocationData = {
      id: uuidv4(),
      deviceId: data.deviceId,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy,
      timestamp: data.timestamp || Date.now(),
      createdAt: new Date(),
    };
    memoryStore.locations.push(item);
    // Keep max 1000 items in memory
    if (memoryStore.locations.length > 1000) {
      memoryStore.locations.shift();
    }
    return { ...item };
  }

  async getLatest(deviceId: string): Promise<LocationData | null> {
    for (let i = memoryStore.locations.length - 1; i >= 0; i--) {
      if (memoryStore.locations[i].deviceId === deviceId) {
        return { ...memoryStore.locations[i] };
      }
    }
    return null;
  }
}

export const userRepo = new UserRepository();
export const deviceRepo = new DeviceRepository();
export const pairingRepo = new PairingRepository();
export const sessionRepo = new SessionRepository();
export const locationRepo = new LocationRepository();
