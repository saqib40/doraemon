// loading them from script, to avoid timing issues
// import dotenv from 'dotenv';
// dotenv.config();

import express from 'express';
import type { Express, Response, Request, NextFunction } from 'express';
import cors from 'cors';
import apiRoutes from './routes/routes.js';
import { closeDriver, getDriver } from './config/db.js';

const app: Express = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

getDriver(); // initializing the db driver

app.use(express.json());

app.use('/', apiRoutes);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'An internal server error occurred.', error: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Backend server is running at http://localhost:${PORT}`);
});

// closing the driver when we close the server
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await closeDriver();
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});
