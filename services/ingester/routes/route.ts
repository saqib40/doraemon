import { Router } from 'express';
import { validateSecret } from '../auth/auth';
import { handleTriggerRequest } from '../controllers/trigger';

const router = Router();

router.post(
    '/trigger',
    validateSecret,       // Apply authentication middleware first
    handleTriggerRequest  // If authentication passes, proceed to the controller
);

// Optional: Add a simple health check endpoint
router.get('/health', (req, res) => {
    res.status(200).send('OK');
});

export default router;