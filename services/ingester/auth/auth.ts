// a very basic authentication
// will update it later
import { Request, Response, NextFunction } from 'express';
import config from '../config/config';

/**
 * Compares the 'Authorization: Bearer <token>' header against the configured INGESTER_SECRET.
 */
export const validateSecret = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!config.ingesterSecret) {
        console.error('[Auth] INGESTER_SECRET is not configured on the server. Rejecting request.');
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('[Auth] Unauthorized: Missing or invalid Authorization header.');
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token.' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (token !== config.ingesterSecret) {
        console.warn('[Auth] Forbidden: Invalid token received.');
        return res.status(403).json({ error: 'Forbidden: Invalid token.' });
    }

    next();
};
