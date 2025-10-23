import type { Request, Response } from 'express';
import { findDependencies, findDependents, findRecursiveDependents } from '../services/graph.service.js';

export const getDependencies = async (req: Request, res: Response) => {
    try {
        const { owner, repo } = req.params;
        const repoName = `${owner}/${repo}`;
        const filePath = req.query.filePath as string;

        if (!filePath) {
            return res.status(400).json({ error: 'Missing required query parameter: filePath' });
        }

        const files = await findDependencies(repoName, filePath);
        res.status(200).json(files);
    } catch (error: any) {
        console.error('[SearchController] Error finding dependencies:', error);
        res.status(500).json({ error: 'Failed to perform search.' });
    }
};


export const getDependents = async (req: Request, res: Response) => {
     try {
        const { owner, repo } = req.params;
        const repoName = `${owner}/${repo}`;
        const filePath = req.query.filePath as string;

        if (!filePath) {
            return res.status(400).json({ error: 'Missing required query parameter: filePath' });
        }

        const files = await findDependents(repoName, filePath);
        res.status(200).json(files);
    } catch (error: any) {
        console.error('[SearchController] Error finding dependents:', error);
        res.status(500).json({ error: 'Failed to perform search.' });
    }
};

export const getRecursiveDependents = async (req: Request, res: Response) => {
    try {
        const { owner, repo } = req.params;
        const repoName = `${owner}/${repo}`;
        const filePath = req.query.filePath as string;

        if (!filePath) {
            return res.status(400).json({ error: 'Missing required query parameter: filePath' });
        }

        const files = await findRecursiveDependents(repoName, filePath);
        res.status(200).json(files);
    } catch (error: any) {
        console.error('[SearchController] Error finding recursive dependents:', error);
        res.status(500).json({ error: 'Failed to perform search.' });
    }
};