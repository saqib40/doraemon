import { Request, Response } from 'express';
import {findDependencies, findDependents, findRecursiveDependents} from '../services/graph.service.js';

// GET /files/:owner/:repo/dependencies?filePath=...
export const getDependencies = async (req: Request, res: Response): Promise<void> => {
    try {
        const { owner, repo } = req.params;
        const repoName = `${owner}/${repo}`;
        const filePath = req.query.filePath as string;

        if (!filePath) {
            res.status(400).json({ error: 'Missing required query parameter: filePath' });
            return;
        }

        const files = await findDependencies(repoName, filePath);
        res.status(200).json(files);
    } catch (error: any) {
        console.error('[SearchController] Error finding dependencies:', error);
        res.status(500).json({ error: 'Failed to perform search.', details: error.message });
    }
};

// GET /files/:owner/:repo/dependents?filePath=...
export const getDependents = async (req: Request, res: Response): Promise<void> => {
     try {
        const { owner, repo } = req.params;
        const repoName = `${owner}/${repo}`;
        const filePath = req.query.filePath as string;

        if (!filePath) {
            res.status(400).json({ error: 'Missing required query parameter: filePath' });
            return;
        }

        const files = await findDependents(repoName, filePath);
        res.status(200).json(files);
    } catch (error: any) {
        console.error('[SearchController] Error finding dependents:', error);
        res.status(500).json({ error: 'Failed to perform search.', details: error.message });
    }
};

// GET /files/:owner/:repo/recursive-dependents?filePath=...
export const getRecursiveDependents = async (req: Request, res: Response): Promise<void> => {
    try {
        const { owner, repo } = req.params;
        const repoName = `${owner}/${repo}`;
        const filePath = req.query.filePath as string;

        if (!filePath) {
            res.status(400).json({ error: 'Missing required query parameter: filePath' });
            return;
        }

        const files = await findRecursiveDependents(repoName, filePath);
        res.status(200).json(files);
    } catch (error: any) {
        console.error('[SearchController] Error finding recursive dependents:', error);
        res.status(500).json({ error: 'Failed to perform search.', details: error.message });
    }
};
