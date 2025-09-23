import express from 'express';
import type { Express, Response, Request, NextFunction } from 'express';
import cors from 'cors';
import apiRoutes from './routes/routes.js';

const app: Express = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

app.use('/', apiRoutes);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'An internal server error occurred.', error: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server is running at http://localhost:${PORT}`);
});
