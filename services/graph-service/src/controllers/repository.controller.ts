import { Request, Response } from 'express';
import {getLastAnalyzedSha, setLastAnalyzedSha} from '../services/graph.service.js';

// GET /repository/:owner/:repo/lastAnalyzedSha
export const getLastAnalyzedShaa = async (req: Request, res: Response): Promise<void> => {
    try {
        const { owner, repo } = req.params;
         if (!owner || !repo) {
            res.status(400).json({ error: 'Missing owner or repo in URL path.' });
            return;
        }
        const repoName = `${owner}/${repo}`;
        const sha = await getLastAnalyzedSha(repoName);
        if (sha) {
            res.status(200).json({ lastAnalyzedSha: sha });
        } else {
            // Use 404 Not Found if the repository itself hasn't been analyzed yet
            res.status(404).json({ error: `Repository ${repoName} has not been analyzed yet.` });
        }
    } catch (error: any) {
        console.error('[RepositoryController] Error getting last analyzed SHA:', error);
        res.status(500).json({ error: 'Failed to retrieve repository information.', details: error.message });
    }
};

// PUT /repository/:owner/:repo/lastAnalyzedSha
export const setLastAnalyzedShaa = async (req: Request, res: Response): Promise<void> => {
    try {
        const { owner, repo } = req.params;
        const { sha } = req.body; // Expecting { "sha": "commit_hash_string" } in body

        if (!owner || !repo) {
            res.status(400).json({ error: 'Missing owner or repo in URL path.' });
            return;
        }
         if (!sha || typeof sha !== 'string') {
            res.status(400).json({ error: 'Missing or invalid "sha" in request body.' });
            return;
        }

        const repoName = `${owner}/${repo}`;
        await setLastAnalyzedSha(repoName, sha);
        res.status(200).json({ message: `Successfully updated lastAnalyzedSha for ${repoName}` });

    } catch (error: any) {
        console.error('[RepositoryController] Error setting last analyzed SHA:', error);
        res.status(500).json({ error: 'Failed to update repository information.', details: error.message });
    }
};
