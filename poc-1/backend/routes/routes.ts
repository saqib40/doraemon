import { Router } from 'express';
import { analyzeRepository } from '../controllers/analysis.controller.js';
import { getDependencies, getDependents } from '../controllers/search.controller.js';

const router = Router();

router.post('/analyze', analyzeRepository);

// Find what a file imports (its dependencies)
// GET /files/facebook/react/dependencies?filePath=packages/react/index.js
router.get('/files/:owner/:repo/dependencies', getDependencies);

// Find what imports a file (its dependents)
// GET /files/facebook/react/dependents?filePath=packages/react/index.js
router.get('/files/:owner/:repo/dependents', getDependents);

export default router;