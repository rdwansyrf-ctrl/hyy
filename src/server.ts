import http from 'http';
import { createApp } from './app.ts';
import { wsManager } from './websocket/ws.manager.ts';
import { config } from './config/index.ts';
import { disconnectPrisma } from './repositories/prisma.ts';

const app = createApp();
const server = http.createServer(app);

// Attach WebSocket server on /ws
wsManager.initialize(server);

const PORT = config.port || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`  DOBBLE BACKEND V1 (Production & Dev Gateway)`);
  console.log(`=======================================================`);
  console.log(`  HTTP/REST API:     http://0.0.0.0:${PORT}`);
  console.log(`  WebSocket (WSS):   ws://0.0.0.0:${PORT}/ws`);
  console.log(`  Environment:       ${config.nodeEnv}`);
  console.log(`  Health Status:     http://0.0.0.0:${PORT}/api/health`);
  console.log(`  Live Metrics:      http://0.0.0.0:${PORT}/api/status`);
  console.log(`=======================================================`);
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down DOBBLE BACKEND V1 gracefully...`);

  wsManager.close();

  server.close(async () => {
    console.log('HTTP and WebSocket servers closed.');
    await disconnectPrisma();
    process.exit(0);
  });

  // Force shutdown after 10s if stuck
  setTimeout(() => {
    console.error('Forceful shutdown triggered after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export { server, app };
