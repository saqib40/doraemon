import { Request, Response } from 'express';
import {createOrUpdateFileNode, deleteFileNode, createImportRelationship, deleteOutgoingRelationships} from '../services/graph.service.js';

// POST /internal/files
export const createOrUpdateFile = async (req: Request, res: Response): Promise<void> => {
    try {
        const { repoName, filePath, fileName } = req.body;
        if (!repoName || !filePath || !fileName) {
            res.status(400).json({ error: 'Missing required body parameters: repoName, filePath, fileName' });
            return;
        }
        await createOrUpdateFileNode(repoName, filePath, fileName);
        res.status(201).json({ message: `File node ${filePath} created/updated.` });
    } catch (error: any) {
        console.error('[MutationController] Error creating/updating file node:', error);
        res.status(500).json({ error: 'Failed to update file node.', details: error.message });
    }
};

// DELETE /internal/files
export const deleteFile = async (req: Request, res: Response): Promise<void> => {
    try {
        const { repoName, filePath } = req.body;
        if (!repoName || !filePath) {
            res.status(400).json({ error: 'Missing required body parameters: repoName, filePath' });
            return;
        }
        await deleteFileNode(repoName, filePath);
        res.status(200).json({ message: `File node ${filePath} deleted.` });
    } catch (error: any) {
        console.error('[MutationController] Error deleting file node:', error);
        res.status(500).json({ error: 'Failed to delete file node.', details: error.message });
    }
};

// POST /internal/relationships
export const createRelationship = async (req: Request, res: Response): Promise<void> => {
    try {
        const { repoName, fromFilePath, toFilePath, toFileName } = req.body;
        if (!repoName || !fromFilePath || !toFilePath || !toFileName) {
            res.status(400).json({ error: 'Missing required body parameters: repoName, fromFilePath, toFilePath, toFileName' });
            return;
        }
        await createImportRelationship(repoName, fromFilePath, toFilePath, toFileName);
        res.status(201).json({ message: `Relationship from ${fromFilePath} to ${toFilePath} created.` });
    } catch (error: any) {
        console.error('[MutationController] Error creating relationship:', error);
        res.status(500).json({ error: 'Failed to create relationship.', details: error.message });
    }
};

// DELETE /internal/relationships
export const deleteOutgoing = async (req: Request, res: Response): Promise<void> => {
    try {
        const { repoName, filePath } = req.body;
        if (!repoName || !filePath) {
            res.status(400).json({ error: 'Missing required body parameters: repoName, filePath' });
            return;
        }
        await deleteOutgoingRelationships(repoName, filePath);
        res.status(200).json({ message: `Outgoing relationships from ${filePath} deleted.` });
    } catch (error: any) {
        console.error('[MutationController] Error deleting relationships:', error);
        res.status(500).json({ error: 'Failed to delete relationships.', details: error.message });
    }
};
