import type { Request, Response } from 'express';
import { getRepo, getDiff, performInitialClone, fetchFullHistoryInBackground } from '../services/git.service.js';
import { getLatestCommitSha } from '../services/github.service.js';
import { getLastAnalyzedSha, setLastAnalyzedSha, fetchFullGraph } from '../services/graph.service.js';
import { performIncrementalUpdate, performFullAnalysis } from '../services/parser.service.js';
import { URL } from 'url';

/**
 * Handles the main `/analyze` endpoint.
 * This is an intelligent "get-or-create" function that:
 * 1. Checks the latest commit on the remote repository.
 * 2. Compares it to the last-analyzed commit stored in our DB.
 * 3. If they match, returns the cached graph from Neo4j.
 * 4. If they differ (or don't exist), triggers either an incremental update or a full analysis.
 */
export const analyzeRepository = async (req: Request, res: Response) => {
  const { repoUrl } = req.body;
  if (!repoUrl) return res.status(400).json({ error: 'Missing "repoUrl".' });

  try {
    const url = new URL(repoUrl);
    // Extracts 'owner/repo' from the URL path (e.g., 'facebook/react')
    const repoName = url.pathname.substring(1).replace(/\.git$/, '');
    const [owner, repo] = repoName.split('/');

    if (!owner || !repo) {
      return res.status(400).json({
        error: 'Invalid "repoUrl". Could not parse "owner" and "repo" from the path.',
        details: `Pathname "${url.pathname}" resulted in owner: "${owner}", repo: "${repo}"`
      });
    }
    // 1. Get the latest commit SHA from the remote (e.g., GitHub).
    const remoteSha = await getLatestCommitSha(owner, repo);
    if (!remoteSha) {
      return res.status(404).json({ error: 'Could not fetch repository from GitHub.' });
    }

    // 2. Get the last analyzed SHA from our local database.
    const localSha = await getLastAnalyzedSha(repoName);

    // 3. Compare SHAs to decide on the action.
    if (localSha && localSha === remoteSha) {
      // --- Case 1: No changes. Fetch and return the cached graph. ---
      console.log(`[Controller] Repo ${repoName} is up-to-date. Fetching from cache.`);
      const graphData = await fetchFullGraph(repoName);
      return res.status(200).json(graphData);
    }

    // --- Case 2: There are changes (or it's the first time). ---
    console.log(`[Controller] Repo ${repoName} requires analysis. Local SHA: ${localSha}, Remote SHA: ${remoteSha}`);

    if (localSha) {
      // --- Sub-case 2a: Incremental Update ---
      // The repo exists locally, so we just fetch updates and process the diff.
      console.log(`[Controller] Performing incremental update.`);
      const git = await getRepo(repoName); // Get the existing local repo
      const diff = await getDiff(git, localSha, remoteSha);
      await performIncrementalUpdate(git, repoName, diff, remoteSha);
    } else {
      // --- Sub-case 2b: First-time Full Analysis ---
      console.log(`[Controller] Performing first-time optimized analysis.`);
      // 1. Perform the FAST shallow clone. The user WAITS for this.
      const git = await performInitialClone(repoUrl, repoName);
      
      // 2. Perform the full analysis on the shallow clone. The user WAITS for this.
      await performFullAnalysis(git, repoName);

      // 3. Trigger the SLOW unshallow fetch. The user DOES NOT wait for this.
      // This is a "fire-and-forget" task.
      fetchFullHistoryInBackground(repoName);
    }

    // 4. After a successful analysis, update the stored SHA in our database.
    await setLastAnalyzedSha(repoName, remoteSha);

    // 5. Fetch the newly updated graph and return it to the user.
    const graphData = await fetchFullGraph(repoName);
    // Respond with 201 Created (or Updated)
    return res.status(201).json(graphData);

  } catch (error: any) {
    console.error('[Controller] A critical error occurred:', error);
    res.status(500).json({ error: 'An internal error occurred.', details: error.message });
  }
};

