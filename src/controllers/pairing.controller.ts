import { Request, Response } from 'express';
import { z } from 'zod';
import { pairingRepo, deviceRepo } from '../repositories/store.ts';
import { wsManager } from '../websocket/ws.manager.ts';

const requestPairingSchema = z.object({
  rDeviceId: z.string().min(1, 'rDeviceId is required'),
  r1DeviceId: z.string().min(1, 'r1DeviceId is required'),
});

export class PairingController {
  async request(req: Request, res: Response): Promise<void> {
    const parseResult = requestPairingSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: (parseResult.error as any).issues || (parseResult.error as any).errors,
      });
      return;
    }

    try {
      const { rDeviceId, r1DeviceId } = parseResult.data;
      const userId = req.user!.userId;

      // Verify rDevice exists
      const rDevice = await deviceRepo.findByDeviceId(rDeviceId);
      if (!rDevice) {
        res.status(404).json({
          success: false,
          error: 'Device Not Found',
          message: `DOBBLE R device '${rDeviceId}' is not registered`,
        });
        return;
      }

      // Verify caller is owner of rDevice OR authenticated as that device
      const callerDeviceId = (req.headers['x-device-id'] as string) || req.user?.deviceId;
      if (rDevice.userId !== userId && callerDeviceId !== rDeviceId) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You are not authorized to initiate pairing for this DOBBLE R device',
        });
        return;
      }

      // Verify r1Device exists
      const r1Device = await deviceRepo.findByDeviceId(r1DeviceId);
      if (!r1Device) {
        res.status(404).json({
          success: false,
          error: 'Device Not Found',
          message: `Target DOBBLE R1 device '${r1DeviceId}' is not registered`,
        });
        return;
      }

      if (r1Device.appType !== 'R1') {
        res.status(400).json({
          success: false,
          error: 'Invalid Device Role',
          message: `Target device '${r1DeviceId}' is not a DOBBLE R1 device`,
        });
        return;
      }

      // Create or reset pairing record
      const pairing = await pairingRepo.createRequest(rDeviceId, r1DeviceId);

      // Send real-time WebSocket notification to DOBBLE R1
      const isR1Online = wsManager.sendToDevice(r1DeviceId, {
        type: 'pairing.request',
        deviceId: rDeviceId,
        targetDeviceId: r1DeviceId,
        requestId: pairing.id,
        payload: {
          pairingId: pairing.id,
          rDeviceId,
          rDeviceName: rDevice.deviceName,
          requestedAt: pairing.requestedAt,
        },
        timestamp: Date.now(),
      });

      res.status(201).json({
        success: true,
        data: {
          pairingId: pairing.id,
          rDeviceId: pairing.rDeviceId,
          r1DeviceId: pairing.r1DeviceId,
          status: pairing.status,
          requestedAt: pairing.requestedAt,
          targetNotifiedViaWS: isR1Online,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to request pairing',
      });
    }
  }

  async getRequests(req: Request, res: Response): Promise<void> {
    try {
      const r1DeviceId = (req.query.r1DeviceId as string) ||
                         (req.headers['x-device-id'] as string) ||
                         req.user?.deviceId;

      if (!r1DeviceId) {
        res.status(400).json({
          success: false,
          error: 'Missing Device Identifier',
          message: 'Provide r1DeviceId query parameter or X-Device-Id header',
        });
        return;
      }

      // Verify device authorization
      const device = await deviceRepo.findByDeviceId(r1DeviceId);
      if (!device) {
        res.status(404).json({ success: false, error: 'Device not found' });
        return;
      }

      if (device.userId !== req.user!.userId && req.user?.deviceId !== r1DeviceId) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      const pendingList = await pairingRepo.getPendingRequestsForR1(r1DeviceId);

      // Enrich with R device names
      const enriched = await Promise.all(
        pendingList.map(async (p) => {
          const rDev = await deviceRepo.findByDeviceId(p.rDeviceId);
          return {
            id: p.id,
            rDeviceId: p.rDeviceId,
            rDeviceName: rDev?.deviceName || 'Unknown DOBBLE R',
            r1DeviceId: p.r1DeviceId,
            status: p.status,
            requestedAt: p.requestedAt,
            isROnline: wsManager.isDeviceOnline(p.rDeviceId),
          };
        })
      );

      res.status(200).json({
        success: true,
        data: enriched,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to fetch pairing requests',
      });
    }
  }

  async approve(req: Request, res: Response): Promise<void> {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const pairing = await pairingRepo.findById(id);

      if (!pairing) {
        res.status(404).json({ success: false, error: 'Pairing request not found' });
        return;
      }

      // Verify authorization: caller must own or be the r1DeviceId
      const r1Device = await deviceRepo.findByDeviceId(pairing.r1DeviceId);
      const callerDeviceId = (req.headers['x-device-id'] as string) || req.user?.deviceId;

      if (!r1Device || (r1Device.userId !== req.user!.userId && callerDeviceId !== pairing.r1DeviceId)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Only the authorized DOBBLE R1 device or its owner can approve this pairing request',
        });
        return;
      }

      const updated = await pairingRepo.updateStatus(id, 'APPROVED');

      // Send real-time WebSocket notification to DOBBLE R
      wsManager.sendToDevice(pairing.rDeviceId, {
        type: 'pairing.approved',
        deviceId: pairing.r1DeviceId,
        targetDeviceId: pairing.rDeviceId,
        requestId: pairing.id,
        payload: {
          pairingId: pairing.id,
          r1DeviceId: pairing.r1DeviceId,
          status: 'APPROVED',
          approvedAt: updated?.approvedAt,
        },
        timestamp: Date.now(),
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: 'Pairing approved successfully',
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to approve pairing',
      });
    }
  }

  async reject(req: Request, res: Response): Promise<void> {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const pairing = await pairingRepo.findById(id);

      if (!pairing) {
        res.status(404).json({ success: false, error: 'Pairing request not found' });
        return;
      }

      const r1Device = await deviceRepo.findByDeviceId(pairing.r1DeviceId);
      const callerDeviceId = (req.headers['x-device-id'] as string) || req.user?.deviceId;

      if (!r1Device || (r1Device.userId !== req.user!.userId && callerDeviceId !== pairing.r1DeviceId)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Only the target DOBBLE R1 device or its owner can reject this pairing request',
        });
        return;
      }

      const updated = await pairingRepo.updateStatus(id, 'REJECTED');

      // Send real-time WebSocket notification to DOBBLE R
      wsManager.sendToDevice(pairing.rDeviceId, {
        type: 'pairing.rejected',
        deviceId: pairing.r1DeviceId,
        targetDeviceId: pairing.rDeviceId,
        requestId: pairing.id,
        payload: {
          pairingId: pairing.id,
          r1DeviceId: pairing.r1DeviceId,
          status: 'REJECTED',
          rejectedAt: updated?.rejectedAt,
        },
        timestamp: Date.now(),
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: 'Pairing rejected',
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to reject pairing',
      });
    }
  }

  async revoke(req: Request, res: Response): Promise<void> {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const pairing = await pairingRepo.findById(id);

      if (!pairing) {
        res.status(404).json({ success: false, error: 'Pairing not found' });
        return;
      }

      // Either R or R1 owner/device can revoke
      const rDev = await deviceRepo.findByDeviceId(pairing.rDeviceId);
      const r1Dev = await deviceRepo.findByDeviceId(pairing.r1DeviceId);
      const userId = req.user!.userId;
      const callerDeviceId = (req.headers['x-device-id'] as string) || req.user?.deviceId;

      const isAuthorized =
        (rDev && rDev.userId === userId) ||
        (r1Dev && r1Dev.userId === userId) ||
        callerDeviceId === pairing.rDeviceId ||
        callerDeviceId === pairing.r1DeviceId;

      if (!isAuthorized) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Only participating devices or their owners can revoke this pairing',
        });
        return;
      }

      const updated = await pairingRepo.updateStatus(id, 'REVOKED');

      // Notify both R and R1 via WebSocket
      const revokePayload = {
        type: 'pairing.revoked' as const,
        requestId: pairing.id,
        payload: { pairingId: pairing.id, status: 'REVOKED' },
        timestamp: Date.now(),
      };

      wsManager.sendToDevice(pairing.rDeviceId, {
        ...revokePayload,
        deviceId: pairing.r1DeviceId,
        targetDeviceId: pairing.rDeviceId,
      });

      wsManager.sendToDevice(pairing.r1DeviceId, {
        ...revokePayload,
        deviceId: pairing.rDeviceId,
        targetDeviceId: pairing.r1DeviceId,
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: 'Pairing revoked',
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to revoke pairing',
      });
    }
  }
}

export const pairingController = new PairingController();
