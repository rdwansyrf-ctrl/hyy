import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, '.', '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      tailwindcss(),
      ...(command === 'serve'
        ? [
            {
              name: 'dobble-backend-api-plugin',
              async configureServer(server: any) {
                const { createApp } = await import('./src/app.ts');
                const { wsManager } = await import('./src/websocket/ws.manager.ts');
                const app = createApp();

                server.middlewares.use((req: any, res: any, next: any) => {
                  if (req.url && (req.url.startsWith('/api') || req.url === '/health')) {
                    app(req, res, next);
                  } else {
                    next();
                  }
                });

                if (server.httpServer) {
                  wsManager.initialize(server.httpServer);
                }
              },
            },
          ]
        : []),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
