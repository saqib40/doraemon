import type { Request, Response } from 'express';
import { cloneRepo, cleanupRepo } from '../services/git.service.js';
import { analyzeAndStoreGraph } from '../services/parser.service.js';
import { repositoryExists, fetchFullGraph } from '../services/graph.service.js'; // Import both services
import { URL } from 'url';

export const analyzeRepository = async (req: Request, res: Response) => {
  const { repoUrl } = req.body;

  if (!repoUrl || typeof repoUrl !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "repoUrl".' });
  }

  let localPath: string | null = null;
  try {
    const url = new URL(repoUrl);
    const repoName = url.pathname.substring(1).replace(/\.git$/, '');
    const exists = await repositoryExists(repoName);

    if (exists) {
      console.log(`[Controller] Repo ${repoName} found in DB. Fetching existing graph.`);
      const graphData = await fetchFullGraph(repoName);
      // 200 OK => existing resource was successfully returned.
      return res.status(200).json(graphData);
    } else {
      console.log(`[Controller] Repo ${repoName} not found. Starting new analysis.`);
      localPath = await cloneRepo(repoUrl);
      await analyzeAndStoreGraph(localPath, repoName);
      const graphData = await fetchFullGraph(repoName);
      // 201 => Created to indicate that a new resource was successfully created.
      return res.status(201).json(graphData);
    }

  } catch (error: any) {
    console.error('[Controller] Error during analysis:', error);
    res.status(500).json({ error: 'An internal error occurred.', details: error.message });
  } finally {
    // Cleanup critical. It will only run if a repo was actually cloned.
    if (localPath) {
      await cleanupRepo(localPath);
    }
  }
};

