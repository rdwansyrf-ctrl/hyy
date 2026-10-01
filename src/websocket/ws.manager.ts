import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { parse as parseUrl } from 'url';
import { authService } from '../auth/auth.service.ts';
import { pairingRepo, deviceRepo } from '../repositories/store.ts';
import { BaseWSEvent, AppType } from '../models/types.ts';

export interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  deviceId: string;
  appType: AppType;
  connectedAt: Date;
  isAlive: boolean;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map(); // key: deviceId
  private heartbeatInterval: NodeJS.Timeout | null = null;

  public initialize(server: Server): WebSocketServer {
    this.wss = new WebSocketServer({ noServer: true });

    // Handle upgrade manually so we only intercept /ws
    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const { pathname } = parseUrl(request.url || '', true);

      if (pathname === '/ws') {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleConnection(ws, request);
    });

    // Start 30s ping/pong heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, 30000);
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }

    return this.wss;
  }

  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const { query } = parseUrl(request.url || '', true);
    const token = (query.token as string) || (request.headers['sec-websocket-protocol'] as string);

    let authenticated = false;
    let clientInfo: ConnectedClient | null = null;

    if (token) {
      const payload = authService.verifyAccessToken(token);
      if (payload && payload.deviceId) {
        authenticated = true;
        clientInfo = {
          ws,
          userId: payload.userId,
          deviceId: payload.deviceId,
          appType: payload.appType || 'R',
          connectedAt: new Date(),
          isAlive: true,
        };
        this.registerClient(clientInfo);
      }
    }

    if (!authenticated) {
      // Send challenge or allow inline 'auth' message within 10 seconds
      const authTimeout = setTimeout(() => {
        if (!authenticated) {
          this.sendEvent(ws, {
            type: 'auth.error',
            payload: { message: 'Authentication timed out. Disconnecting.' },
          });
          ws.terminate();
        }
      }, 10000);

      ws.on('message', async (raw: string | Buffer) => {
        try {
          const data = JSON.parse(raw.toString()) as BaseWSEvent<any>;
          if (data.type === 'auth' && data.payload?.token) {
            const payload = authService.verifyAccessToken(data.payload.token);
            const deviceId = data.payload.deviceId || payload?.deviceId;

            if (!payload || !deviceId) {
              this.sendEvent(ws, {
                type: 'auth.error',
                payload: { message: 'Invalid authentication token or device ID' },
              });
              ws.terminate();
              return;
            }

            clearTimeout(authTimeout);
            authenticated = true;

            // Fetch device app type if available
            const device = await deviceRepo.findByDeviceId(deviceId);
            const appType = device?.appType || payload.appType || 'R';

            clientInfo = {
              ws,
              userId: payload.userId,
              deviceId,
              appType,
              connectedAt: new Date(),
              isAlive: true,
            };

            this.registerClient(clientInfo);
            this.sendEvent(ws, {
              type: 'auth.success',
              deviceId,
              payload: { message: 'Authenticated successfully', deviceId, appType },
            });
            return;
          }

          if (!authenticated || !clientInfo) {
            this.sendEvent(ws, {
              type: 'error',
              payload: { message: 'Please authenticate first via auth event or ?token=' },
            });
            return;
          }

          await this.handleMessage(clientInfo, data);
        } catch (err: any) {
          this.sendEvent(ws, {
            type: 'error',
            payload: { message: 'Malformed JSON payload: ' + (err.message || 'unknown') },
          });
        }
      });
    } else if (clientInfo) {
      this.sendEvent(ws, {
        type: 'auth.success',
        deviceId: clientInfo.deviceId,
        payload: { message: 'Authenticated successfully', deviceId: clientInfo.deviceId },
      });

      ws.on('message', async (raw: string | Buffer) => {
        try {
          const data = JSON.parse(raw.toString()) as BaseWSEvent<any>;
          await this.handleMessage(clientInfo!, data);
        } catch (err: any) {
          this.sendEvent(ws, {
            type: 'error',
            payload: { message: 'Malformed JSON payload' },
          });
        }
      });
    }

    ws.on('pong', () => {
      if (clientInfo) {
        clientInfo.isAlive = true;
      }
    });

    ws.on('close', () => {
      if (clientInfo) {
        this.unregisterClient(clientInfo.deviceId);
      }
    });

    ws.on('error', () => {
      if (clientInfo) {
        this.unregisterClient(clientInfo.deviceId);
      }
    });
  }

  private registerClient(client: ConnectedClient): void {
    // If device had existing connection, close previous one
    const existing = this.clients.get(client.deviceId);
    if (existing && existing.ws !== client.ws) {
      existing.ws.terminate();
    }

    this.clients.set(client.deviceId, client);
    deviceRepo.updateLastSeen(client.deviceId).catch(() => {});

    // Broadcast device.online to approved paired devices
    this.broadcastToApprovedPairs(client.deviceId, {
      type: 'device.online',
      deviceId: client.deviceId,
      payload: { appType: client.appType },
      timestamp: Date.now(),
    });
  }

  private unregisterClient(deviceId: string): void {
    const client = this.clients.get(deviceId);
    if (client) {
      this.clients.delete(deviceId);
      deviceRepo.updateLastSeen(deviceId).catch(() => {});

      // Broadcast device.offline to approved paired devices
      this.broadcastToApprovedPairs(deviceId, {
        type: 'device.offline',
        deviceId,
        timestamp: Date.now(),
      });
    }
  }

  private checkHeartbeats(): void {
    for (const [deviceId, client] of this.clients.entries()) {
      if (!client.isAlive) {
        client.ws.terminate();
        this.unregisterClient(deviceId);
        continue;
      }
      client.isAlive = false;
      client.ws.ping();
    }
  }

  private async handleMessage(client: ConnectedClient, event: BaseWSEvent<any>): Promise<void> {
    const timestamp = Date.now();

    // Heartbeat ping
    if (event.type === 'ping') {
      this.sendEvent(client.ws, { type: 'pong', timestamp });
      return;
    }

    // Target device required for signaling and pairing events
    const targetDeviceId = event.targetDeviceId;

    // Pairing flow events via WebSocket
    if (event.type.startsWith('pairing.')) {
      await this.handlePairingEvent(client, event);
      return;
    }

    // Location update
    if (event.type === 'location.update') {
      // Must be DOBBLE R sending location
      if (client.appType !== 'R') {
        this.sendEvent(client.ws, {
          type: 'error',
          payload: { message: 'Only DOBBLE R devices can stream location.update' },
        });
        return;
      }

      // Forward to all approved DOBBLE R1 devices
      await this.broadcastToApprovedPairs(client.deviceId, {
        type: 'location.update',
        deviceId: client.deviceId,
        payload: event.payload,
        timestamp,
      });
      return;
    }

    // WebRTC Camera and Screen Signaling events
    if (event.type.startsWith('camera.') || event.type.startsWith('screen.')) {
      if (!targetDeviceId) {
        this.sendEvent(client.ws, {
          type: 'error',
          payload: { message: `targetDeviceId is required for signaling event ${event.type}` },
        });
        return;
      }

      // Strict security authorization: Verify that sender and targetDeviceId have an APPROVED pairing!
      const isApproved = await this.verifyApprovedPair(client.deviceId, targetDeviceId);
      if (!isApproved) {
        this.sendEvent(client.ws, {
          type: 'error',
          payload: {
            code: 'UNAUTHORIZED',
            message: `Signaling rejected: Device ${client.deviceId} is not in an APPROVED pairing with ${targetDeviceId}`,
          },
        });
        return;
      }

      // Relay signaling payload to target device
      const relayed = this.sendToDevice(targetDeviceId, {
        ...event,
        deviceId: client.deviceId, // sender identity
        targetDeviceId,
        timestamp,
      });

      if (!relayed) {
        this.sendEvent(client.ws, {
          type: 'error',
          payload: {
            code: 'TARGET_OFFLINE',
            message: `Target device ${targetDeviceId} is currently offline`,
          },
        });
      }
      return;
    }

    // Unknown event
    this.sendEvent(client.ws, {
      type: 'error',
      payload: { message: `Unsupported event type: ${event.type}` },
    });
  }

  private async handlePairingEvent(client: ConnectedClient, event: BaseWSEvent<any>): Promise<void> {
    const { type, targetDeviceId, requestId, payload } = event;

    if (type === 'pairing.request') {
      if (!targetDeviceId) {
        this.sendEvent(client.ws, {
          type: 'error',
          payload: { message: 'targetDeviceId is required for pairing.request' },
        });
        return;
      }

      // Target must be online or available
      this.sendToDevice(targetDeviceId, {
        type: 'pairing.request',
        deviceId: client.deviceId,
        targetDeviceId,
        requestId,
        payload: payload || { message: 'Pairing request received' },
        timestamp: Date.now(),
      });
      return;
    }

    if (type === 'pairing.approved' || type === 'pairing.rejected' || type === 'pairing.revoked') {
      if (!targetDeviceId) {
        this.sendEvent(client.ws, {
          type: 'error',
          payload: { message: `targetDeviceId is required for ${type}` },
        });
        return;
      }

      this.sendToDevice(targetDeviceId, {
        type,
        deviceId: client.deviceId,
        targetDeviceId,
        requestId,
        payload,
        timestamp: Date.now(),
      });
    }
  }

  private async verifyApprovedPair(devA: string, devB: string): Promise<boolean> {
    const isPair1 = await pairingRepo.isApprovedPair(devA, devB);
    if (isPair1) return true;
    const isPair2 = await pairingRepo.isApprovedPair(devB, devA);
    return isPair2;
  }

  public sendToDevice(deviceId: string, event: BaseWSEvent<any>): boolean {
    const client = this.clients.get(deviceId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      this.sendEvent(client.ws, event);
      return true;
    }
    return false;
  }

  public async broadcastToApprovedPairs(deviceId: string, event: BaseWSEvent<any>): Promise<number> {
    // Check if device is R or R1
    const rPairs = await pairingRepo.getApprovedPairingsForR(deviceId);
    const r1Pairs = await pairingRepo.getApprovedPairingsForR1(deviceId);

    let sentCount = 0;

    // If device is R, send to paired R1 devices
    for (const pair of rPairs) {
      if (this.sendToDevice(pair.r1DeviceId, event)) {
        sentCount++;
      }
    }

    // If device is R1, send to paired R devices
    for (const pair of r1Pairs) {
      if (this.sendToDevice(pair.rDeviceId, event)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  public sendEvent(ws: WebSocket, event: BaseWSEvent<any>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  public getOnlineDevices(): string[] {
    return Array.from(this.clients.keys());
  }

  public isDeviceOnline(deviceId: string): boolean {
    const client = this.clients.get(deviceId);
    return !!(client && client.ws.readyState === WebSocket.OPEN);
  }

  public getConnectedClient(deviceId: string): ConnectedClient | undefined {
    return this.clients.get(deviceId);
  }

  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
  }
}

export const wsManager = new WebSocketManager();
