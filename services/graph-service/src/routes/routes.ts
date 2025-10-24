import { Router } from 'express';

// Import controllers
import {getFullGraph} from '../controllers/graphRead.controller.js';
import {getLastAnalyzedShaa, setLastAnalyzedShaa} from '../controllers/repository.controller.js';
import {getDependencies, getDependents, getRecursiveDependents} from '../controllers/search.controller.js';
import {createOrUpdateFile, createRelationship, deleteFile, deleteOutgoing} from '../controllers/graphWrite.controller.js';

const router = Router();

// --- Public Read/Query Routes ---
// These are likely to be called by the API Gateway for the frontend.

router.get('/graph/:owner/:repo', getFullGraph);
router.get('/repository/:owner/:repo/lastAnalyzedSha', getLastAnalyzedShaa);
router.get('/files/:owner/:repo/dependencies', getDependencies);
router.get('/files/:owner/:repo/dependents', getDependents);
router.get('/files/:owner/:repo/recursive-dependents', getRecursiveDependents);


// --- Internal Mutation Routes ---
// These endpoints are primarily intended for the Analysis Engine service.
// Consider adding internal authentication/authorization later.
const internalRouter = Router(); // Use a separate router for internal routes
internalRouter.post('/files', createOrUpdateFile);
internalRouter.delete('/files', deleteFile);
internalRouter.post('/relationships', createRelationship);
internalRouter.delete('/relationships', deleteOutgoing);
internalRouter.put('/repository/:owner/:repo/lastAnalyzedSha', setLastAnalyzedShaa);

// Mount the internal router under a specific path
router.use('/internal', internalRouter);

// --- Health Check ---
router.get('/health', (req, res) => {
  // Basic health check, could be expanded to check DB connection
  res.status(200).json({ status: 'OK' });
});

export default router;