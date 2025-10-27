import { Request, Response } from 'express';
import { publishAnalysisJob } from '../config/redis';

/**
 * Handles the validated POST /trigger request.
 * Parses the body, constructs the job payload, publishes it to Redis,
 * and sends a 202 Accepted response.
 */
export const handleTriggerRequest = async (req: Request, res: Response) => {
    // Expected body from GitHub Action: { repoUrl, sha, event, prNumber? }
    // might change it later as required
    const { repoUrl, sha, event, prNumber } = req.body;

    // Basic validation of the incoming payload
    if (!repoUrl || !sha || !event) {
        return res.status(400).json({ error: 'Bad Request: Missing required fields (repoUrl, sha, event) in request body.' });
    }

    const jobPayload = {
        repoUrl,
        sha,
        event,
        prNumber: prNumber || null, // Ensure prNumber is null if not provided
        receivedAt: new Date().toISOString(),
    };

    try {
        const messageId = await publishAnalysisJob(jobPayload);
        // Send 202 Accepted: The request is valid and has been queued for processing.
        res.status(202).json({
            message: 'Analysis request queued successfully.',
            jobId: messageId
        });
    } catch (error: any) {
        console.error('[Controller] Failed to publish job to Redis:', error);
        // If publishing fails, it's a server-side issue.
        res.status(500).json({ error: 'Internal Server Error: Could not queue analysis job.' });
    }
};
