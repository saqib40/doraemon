import { Request, Response } from 'express';
import {fetchFullGraph} from '../services/graph.service.js';

// GET /graph/:owner/:repo
export const getFullGraph = async (req: Request, res: Response): Promise<void> => {
    try {
        const { owner, repo } = req.params;
        if (!owner || !repo) {
            res.status(400).json({ error: 'Missing owner or repo in URL path.' });
            return;
        }
        const repoName = `${owner}/${repo}`;
        const graphData = await fetchFullGraph(repoName);
        if (!graphData || graphData.nodes.length === 0) {
            res.status(404).json({ error: `Graph not found for repository: ${repoName}` });
        } else {
            res.status(200).json(graphData);
        }
    } catch (error: any) {
        console.error('[GraphController] Error fetching full graph:', error);
        res.status(500).json({ error: 'Failed to fetch graph from database.', details: error.message });
    }
};
