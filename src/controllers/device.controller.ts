import { Request, Response } from 'express';
import { z } from 'zod';
import { deviceRepo, pairingRepo, sessionRepo } from '../repositories/store.ts';
import { authService } from '../auth/auth.service.ts';
import { wsManager } from '../websocket/ws.manager.ts';

const registerDeviceSchema = z.object({
  deviceId: z.string().min(1, 'deviceId is required'),
  deviceName: z.string().min(1, 'deviceName is required'),
  platform: z.string().default('Android'),
  appType: z.enum(['R', 'R1']),
});

export class DeviceController {
  async register(req: Request, res: Response): Promise<void> {
    const parseResult = registerDeviceSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: (parseResult.error as any).issues || (parseResult.error as any).errors,
      });
      return;
    }

    try {
      const { deviceId, deviceName, platform, appType } = parseResult.data;
      const userId = req.user!.userId;

      const device = await deviceRepo.registerOrUpdate({
        userId,
        deviceId,
        deviceName,
        platform,
        appType,
      });

      // Generate a device-specific access token including deviceId and appType
      const deviceAccessToken = authService.generateAccessToken({
        userId,
        email: req.user!.email,
        deviceId: device.deviceId,
        appType: device.appType,
      });

      // Persist session
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await sessionRepo.create(device.deviceId, deviceAccessToken, expiresAt);

      res.status(200).json({
        success: true,
        data: {
          device: {
            id: device.id,
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            platform: device.platform,
            appType: device.appType,
            lastSeen: device.lastSeen,
            userId: device.userId,
            isOnline: wsManager.isDeviceOnline(device.deviceId),
          },
          deviceAccessToken,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to register device',
      });
    }
  }

  async getDevices(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const myDevices = await deviceRepo.findByUserId(userId);

      const enriched = myDevices.map((d) => ({
        id: d.id,
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        platform: d.platform,
        appType: d.appType,
        lastSeen: d.lastSeen,
        isOnline: wsManager.isDeviceOnline(d.deviceId),
      }));

      res.status(200).json({
        success: true,
        data: enriched,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to fetch devices',
      });
    }
  }

  async getDeviceById(req: Request, res: Response): Promise<void> {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const userId = req.user!.userId;

      // Find by id or deviceId
      let device = await deviceRepo.findById(id);
      if (!device) {
        device = await deviceRepo.findByDeviceId(id);
      }

      if (!device) {
        res.status(404).json({
          success: false,
          error: 'Device not found',
        });
        return;
      }

      // Check authorization: Must be owner OR have an APPROVED pairing with this device
      const isOwner = device.userId === userId;
      let isPaired = false;

      const callerDeviceId = (req.headers['x-device-id'] as string) || req.user?.deviceId;
      if (callerDeviceId) {
        isPaired = await pairingRepo.isApprovedPair(device.deviceId, callerDeviceId) ||
                   await pairingRepo.isApprovedPair(callerDeviceId, device.deviceId);
      }

      if (!isOwner && !isPaired) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You are not authorized to view this device. Pairing must be APPROVED.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: device.id,
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          platform: device.platform,
          appType: device.appType,
          lastSeen: device.lastSeen,
          userId: device.userId,
          isOnline: wsManager.isDeviceOnline(device.deviceId),
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to fetch device details',
      });
    }
  }

  async deleteDevice(req: Request, res: Response): Promise<void> {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const userId = req.user!.userId;

      let device = await deviceRepo.findById(id);
      if (!device) {
        device = await deviceRepo.findByDeviceId(id);
      }

      if (!device) {
        res.status(404).json({
          success: false,
          error: 'Device not found',
        });
        return;
      }

      if (device.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Only the device owner can delete this device',
        });
        return;
      }

      await deviceRepo.delete(device.deviceId);
      await sessionRepo.deleteByDeviceId(device.deviceId);

      res.status(200).json({
        success: true,
        message: 'Device deleted successfully',
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to delete device',
      });
    }
  }
}

export const deviceController = new DeviceController();
