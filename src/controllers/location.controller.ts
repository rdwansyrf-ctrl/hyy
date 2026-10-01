import { Request, Response } from 'express';
import { z } from 'zod';
import { locationRepo, deviceRepo, pairingRepo } from '../repositories/store.ts';
import { wsManager } from '../websocket/ws.manager.ts';

const locationUpdateSchema = z.object({
  deviceId: z.string().min(1, 'deviceId is required'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().default(0),
  timestamp: z.number().default(() => Date.now()),
});

export class LocationController {
  async update(req: Request, res: Response): Promise<void> {
    const parseResult = locationUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: (parseResult.error as any).issues || (parseResult.error as any).errors,
      });
      return;
    }

    try {
      const { deviceId, latitude, longitude, accuracy, timestamp } = parseResult.data;
      const userId = req.user!.userId;

      // Ensure device exists
      const device = await deviceRepo.findByDeviceId(deviceId);
      if (!device) {
        res.status(404).json({
          success: false,
          error: 'Device not found',
        });
        return;
      }

      // Authorization check: Device must belong to user OR token must be bound to this device
      const callerDeviceId = (req.headers['x-device-id'] as string) || req.user?.deviceId;
      if (device.userId !== userId && callerDeviceId !== deviceId) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You are not authorized to publish locations for this device',
        });
        return;
      }

      // Save location
      const saved = await locationRepo.save({
        deviceId,
        latitude,
        longitude,
        accuracy,
        timestamp,
      });

      // Update device last seen
      await deviceRepo.updateLastSeen(deviceId);

      // Relay location update in real-time to all APPROVED paired DOBBLE R1 devices!
      const forwardedCount = await wsManager.broadcastToApprovedPairs(deviceId, {
        type: 'location.update',
        deviceId,
        payload: {
          deviceId,
          latitude,
          longitude,
          accuracy,
          timestamp,
        },
        timestamp: Date.now(),
      });

      res.status(200).json({
        success: true,
        data: {
          location: saved,
          forwardedToR1DevicesCount: forwardedCount,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to update location',
      });
    }
  }

  async getLatest(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = (Array.isArray(req.params.deviceId) ? req.params.deviceId[0] : req.params.deviceId) as string;
      const userId = req.user!.userId;

      const device = await deviceRepo.findByDeviceId(deviceId);
      if (!device) {
        res.status(404).json({ success: false, error: 'Device not found' });
        return;
      }

      // Check authorization: Owner or APPROVED paired R1
      const isOwner = device.userId === userId;
      let isApprovedPair = false;

      const callerDeviceId = (req.headers['x-device-id'] as string) || req.user?.deviceId;
      if (callerDeviceId) {
        isApprovedPair = await pairingRepo.isApprovedPair(deviceId, callerDeviceId) ||
                         await pairingRepo.isApprovedPair(callerDeviceId, deviceId);
      }

      if (!isOwner && !isApprovedPair) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Access denied. You must be the owner or have an APPROVED pairing with this device.',
        });
        return;
      }

      const location = await locationRepo.getLatest(deviceId);
      if (!location) {
        res.status(404).json({
          success: false,
          error: 'No location data found for this device yet',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: location,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to retrieve location',
      });
    }
  }
}

export const locationController = new LocationController();
