import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { memoryStore } from '../src/repositories/store.ts';
import { authService } from '../src/auth/auth.service.ts';

const app = createApp();

describe('DOBBLE BACKEND V1 - Full Test Suite', () => {
  beforeEach(() => {
    // Reset in-memory database between tests
    memoryStore.reset();
  });

  describe('1. Authentication Module', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin@dobble.local',
          password: 'securePassword123',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('admin@dobble.local');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should reject registration with duplicate email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@dobble.local',
          password: 'securePassword123',
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@dobble.local',
          password: 'anotherPassword456',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('already registered');
    });

    it('should login an existing user with valid credentials', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'login-test@dobble.local',
          password: 'correctPassword',
        });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login-test@dobble.local',
          password: 'correctPassword',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should reject login with incorrect password', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'wrong-pass@dobble.local',
          password: 'realPassword',
        });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrong-pass@dobble.local',
          password: 'wrongPasswordAttempt',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should refresh access token using valid refresh token', async () => {
      const reg = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'refresh@dobble.local',
          password: 'somePassword',
        });

      const refreshToken = reg.body.data.refreshToken;

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.accessToken).toBeDefined();
    });
  });

  describe('2. Device Registration & Authorization', () => {
    it('should register DOBBLE R and DOBBLE R1 devices', async () => {
      const userRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'device-owner@dobble.local',
          password: 'password123',
        });
      const token = userRes.body.data.accessToken;

      // Register DOBBLE R
      const rRes = await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deviceId: 'device-r-001',
          deviceName: "Sender's Android Phone (DOBBLE R)",
          platform: 'Android',
          appType: 'R',
        });

      expect(rRes.status).toBe(200);
      expect(rRes.body.data.device.deviceId).toBe('device-r-001');
      expect(rRes.body.data.device.appType).toBe('R');
      expect(rRes.body.data.deviceAccessToken).toBeDefined();

      // Register DOBBLE R1
      const r1Res = await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deviceId: 'device-r1-001',
          deviceName: "Controller's Tablet (DOBBLE R1)",
          platform: 'Android',
          appType: 'R1',
        });

      expect(r1Res.status).toBe(200);
      expect(r1Res.body.data.device.deviceId).toBe('device-r1-001');
      expect(r1Res.body.data.device.appType).toBe('R1');
    });

    it('should prevent unauthorized users from viewing un-paired devices', async () => {
      // User A registers Device A
      const userA = await request(app)
        .post('/api/auth/register')
        .send({ email: 'userA@dobble.local', password: 'passwordA1' });

      await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${userA.body.data.accessToken}`)
        .send({
          deviceId: 'device-a-secret',
          deviceName: 'Secret Device A',
          platform: 'Android',
          appType: 'R',
        });

      // User B attempts to access Device A
      const userB = await request(app)
        .post('/api/auth/register')
        .send({ email: 'userB@dobble.local', password: 'passwordB1' });

      const unauthorizedGet = await request(app)
        .get('/api/devices/device-a-secret')
        .set('Authorization', `Bearer ${userB.body.data.accessToken}`);

      expect(unauthorizedGet.status).toBe(403);
      expect(unauthorizedGet.body.error).toBe('Forbidden');
    });
  });

  describe('3. Pairing Flow (DOBBLE R ↔ BACKEND ↔ DOBBLE R1)', () => {
    it('should complete the entire pairing lifecycle: Request -> Pending -> Approve -> Revoke', async () => {
      // Create user
      const userRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'pair-flow@dobble.local', password: 'password123' });
      const token = userRes.body.data.accessToken;

      // Register R
      await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deviceId: 'r-phone-99',
          deviceName: 'R Phone',
          platform: 'Android',
          appType: 'R',
        });

      // Register R1
      await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deviceId: 'r1-viewer-99',
          deviceName: 'R1 Viewer',
          platform: 'Android',
          appType: 'R1',
        });

      // Step 1: DOBBLE R initiates pairing request
      const reqRes = await request(app)
        .post('/api/pairing/request')
        .set('Authorization', `Bearer ${token}`)
        .send({
          rDeviceId: 'r-phone-99',
          r1DeviceId: 'r1-viewer-99',
        });

      expect(reqRes.status).toBe(201);
      expect(reqRes.body.data.status).toBe('PENDING');
      const pairingId = reqRes.body.data.pairingId;

      // Step 2: DOBBLE R1 fetches pending requests
      const listRes = await request(app)
        .get(`/api/pairing/requests?r1DeviceId=r1-viewer-99`)
        .set('Authorization', `Bearer ${token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThan(0);
      expect(listRes.body.data[0].id).toBe(pairingId);

      // Step 3: DOBBLE R1 approves pairing
      const approveRes = await request(app)
        .post(`/api/pairing/${pairingId}/approve`)
        .set('Authorization', `Bearer ${token}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');
      expect(approveRes.body.data.approvedAt).toBeDefined();

      // Step 4: Verify approved pairing allows device viewing
      const devViewRes = await request(app)
        .get(`/api/devices/r-phone-99`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Device-Id', 'r1-viewer-99');

      expect(devViewRes.status).toBe(200);

      // Step 5: Revoke pairing
      const revokeRes = await request(app)
        .post(`/api/pairing/${pairingId}/revoke`)
        .set('Authorization', `Bearer ${token}`);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.status).toBe('REVOKED');
    });

    it('should reject a pairing request when DOBBLE R1 rejects it', async () => {
      const userRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'reject-flow@dobble.local', password: 'password123' });
      const token = userRes.body.data.accessToken;

      await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ deviceId: 'r-dev-rej', deviceName: 'R Dev', platform: 'Android', appType: 'R' });

      await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ deviceId: 'r1-dev-rej', deviceName: 'R1 Dev', platform: 'Android', appType: 'R1' });

      const reqRes = await request(app)
        .post('/api/pairing/request')
        .set('Authorization', `Bearer ${token}`)
        .send({ rDeviceId: 'r-dev-rej', r1DeviceId: 'r1-dev-rej' });

      const pairingId = reqRes.body.data.pairingId;

      const rejectRes = await request(app)
        .post(`/api/pairing/${pairingId}/reject`)
        .set('Authorization', `Bearer ${token}`);

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('REJECTED');
    });
  });

  describe('4. Real-time Location Tracking & Security', () => {
    it('should accept valid location update from authorized DOBBLE R and allow retrieval', async () => {
      const userRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'gps-test@dobble.local', password: 'password123' });
      const token = userRes.body.data.accessToken;

      await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deviceId: 'gps-tracker-r',
          deviceName: 'GPS Phone R',
          platform: 'Android',
          appType: 'R',
        });

      // Update location
      const locRes = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deviceId: 'gps-tracker-r',
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy: 12.5,
          timestamp: Date.now(),
        });

      expect(locRes.status).toBe(200);
      expect(locRes.body.data.location.latitude).toBe(-6.2088);
      expect(locRes.body.data.location.longitude).toBe(106.8456);

      // Fetch location
      const getLocRes = await request(app)
        .get('/api/location/gps-tracker-r')
        .set('Authorization', `Bearer ${token}`);

      expect(getLocRes.status).toBe(200);
      expect(getLocRes.body.data.latitude).toBe(-6.2088);
    });

    it('should reject unauthenticated location updates', async () => {
      const res = await request(app)
        .post('/api/location/update')
        .send({
          deviceId: 'unauthenticated-device',
          latitude: 0,
          longitude: 0,
        });

      expect(res.status).toBe(401);
    });
  });

  describe('5. WebSocket Token Authentication Helper', () => {
    it('should verify valid JWT and deny invalid or forged tokens', () => {
      const validPayload = {
        userId: 'usr-123',
        email: 'ws@dobble.local',
        deviceId: 'dev-001',
        appType: 'R' as const,
      };

      const validToken = authService.generateAccessToken(validPayload);
      const verified = authService.verifyAccessToken(validToken);

      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe('usr-123');
      expect(verified?.deviceId).toBe('dev-001');

      const forgedToken = validToken.slice(0, -6) + 'abcdef';
      const failedVerify = authService.verifyAccessToken(forgedToken);
      expect(failedVerify).toBeNull();
    });
  });
});
