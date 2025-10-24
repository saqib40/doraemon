import express from 'express';
import type { Express, Response, Request, NextFunction } from 'express';
import { closeNeo4j, initNeo4j } from './config/db.js';
import { migrateConstraints } from './services/graph.service.js';
import routes from './routes/routes.js';

const PORT = process.env.GRAPH_SERVICE_PORT;

const app: Express = express();

app.use(express.json());
app.use('/', routes);
// --- Basic Error Handling Middleware ---
// (Add more specific error handling as needed)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(`[Graph Service Error] ${err.stack}`);
  res.status(500).json({
      error: 'Internal Server Error',
      message: err.message || 'An unexpected error occurred.',
  });
});

const startServer = async () => {
  try {
    // 1. Initialize Neo4j connection
    await initNeo4j();

    // 2. Run database constraint migrations/checks
    await migrateConstraints();

    // 3. Start listening for HTTP requests
    const server = app.listen(PORT, () => {
      console.log(`🚀 Graph Service running at http://localhost:${PORT}`);
    });

    // --- Graceful Shutdown Logic ---
    const shutdown = async (signal: string) => {
      console.log(`\n[Graph Service] Received ${signal}. Shutting down...`);
      server.close(async () => {
        console.log('[Graph Service] HTTP server closed.');
        await closeNeo4j();
        console.log('[Graph Service] Shutdown complete.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
    process.on('SIGTERM', () => shutdown('SIGTERM')); // Docker stop, etc.

  } catch (error) {
    console.error('[Graph Service] Failed to start server:', error);
    process.exit(1);
  }
};

startServer();