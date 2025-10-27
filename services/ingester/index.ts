import express, { Express, Request, Response, NextFunction } from 'express';
import config from './config/config';
import { initRedis, closeRedis } from './config/redis';
import apiRoutes from './routes/route';

const app: Express = express();
const port = config.port;

app.use(express.json());

app.use('/', apiRoutes);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[App] Unhandled Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const startServer = async () => {
  try {
    await initRedis(); // Connect to Redis before starting the HTTP server
    const server = app.listen(port, () => {
      console.log(`🚀 Webhook Ingester service running at http://localhost:${port}`);
    });

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      console.log(`\n[App] Received ${signal}. Shutting down gracefully...`);
      isShuttingDown = true;
      server.close(async () => {
        console.log('[App] HTTP server closed.');
        await closeRedis();
        console.log('[App] Shutdown complete.');
        process.exit(0);
      });

      // Force shutdown after timeout
      setTimeout(async () => {
        console.error('[App] Could not close connections gracefully after timeout, forcing shutdown.');
        await closeRedis(); // Attempt redis close again
        process.exit(1);
      }, 10000); // 10 seconds timeout
    };

    let isShuttingDown = false;
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start Webhook Ingester service:', error);
    process.exit(1);
  }
};

startServer();