import type { Express, Response, Request, NextFunction } from 'express';
import express from 'express';
import * as gitService from '../services/git.service.js';
import * as parserService from '../services/parser.service.js';

const router = express.Router();

router.post('/analyze', async (req: Request, res: Response, next: NextFunction) => {
  const { repoUrl } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ message: 'repoUrl is required' });
  }

  let tempRepoPath: string | null = null;

  try {
    console.log(`Cloning repository: ${repoUrl}`);
    tempRepoPath = await gitService.cloneRepo(repoUrl);
    console.log(`Repository cloned to: ${tempRepoPath}`);

    console.log('Generating dependency graph...');
    const graphData = await parserService.generateGraph(tempRepoPath);
    console.log(`Graph generated with ${graphData.nodes.length} nodes and ${graphData.edges.length} edges.`);

    res.status(200).json(graphData);

  } catch (error) {
    // If any step fails, pass the error to the global error handler.
    next(error);

  } finally {
    // (Cleanup): to ensure the temporary repository is deleted,
    // whether the process succeeded or failed.
    if (tempRepoPath) {
      console.log(`Cleaning up temporary directory: ${tempRepoPath}`);
      await gitService.cleanupRepo(tempRepoPath);
      console.log('Cleanup complete.');
    }
  }
});

export default router;
