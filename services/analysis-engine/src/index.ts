import { initRedis, getNextJob, acknowledgeJob, closeRedis } from './config/redis.js';
import { handleAnalysisJob } from './handlers/job.handler.js';
import { checkGraphServiceHealth } from './services/graph.client.js';

let isShuttingDown = false;

/**
 * Main worker loop. Continuously listens for jobs and processes them.
 */
const runWorker = async () => {
    console.log('[Worker] Starting analysis engine worker...');
    try {
        // Initialize Redis and wait for connection
        await initRedis();
        console.log('[Worker] Redis initialized.');

        // Check Graph Service health
        const graphServiceHealthy = await checkGraphServiceHealth();
        if (!graphServiceHealthy) {
            console.error('[Worker] Graph Service is unhealthy. Worker stopping.');
            await closeRedis();
            process.exit(1);
        } else {
             console.log('[Worker] Graph Service health check passed.');
        }

        console.log('[Worker] Waiting for analysis jobs...');

        while (!isShuttingDown) {
            const job = await getNextJob(); // Blocking call to wait for jobs

            // Check shutdown flag *after* potential block
            if (isShuttingDown) break;

            if (job) {
                console.log(`[Worker] Processing job ${job.id}...`);
                try {
                    await handleAnalysisJob(job.id, job.payload);
                    await acknowledgeJob(job.id); // Acknowledge only on success
                    console.log(`[Worker] Finished and acknowledged job ${job.id}.`);
                } catch (processingError) {
                    console.error(`[Worker] Error processing job ${job.id}:`, processingError);
                    // Decide error handling: Currently, failed jobs are NOT acknowledged
                    // and might be retried by another consumer after visibility timeout.
                }
            } else {
                 // getNextJob might return null if there was a connection error during the wait
                 console.log('[Worker] No job received, potentially due to Redis error or timeout. Retrying...');
                 // Short delay before next attempt if null was returned unexpectedly
                 if (!isShuttingDown) await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

    } catch (error) {
        console.error('[Worker] Critical error during initialization or main loop:', error);
        process.exitCode = 1; // Signal error exit
    } finally {
        // Ensure Redis connection is closed on exit, whether clean or error
        console.log('[Worker] Initiating final Redis closure...');
        await closeRedis();
        console.log('[Worker] Worker has shut down.');
    }
};

// --- Graceful Shutdown ---
const shutdown = async () => {
    if (isShuttingDown) return;
    console.log('\n[Worker] Received shutdown signal. Attempting graceful shutdown...');
    isShuttingDown = true;

    // Give the current loop iteration a chance to finish cleanly
    // Wait a short period, then forcefully close if needed.
    setTimeout(async () => {
        console.warn('[Worker] Shutdown timeout reached. Forcing Redis closure.');
        await closeRedis(); // Ensure connection closes even if loop is stuck
        process.exit(1); // Exit with error code if forced
    }, 10000); // 10-second grace period

    // The main loop checks isShuttingDown and will exit naturally.
    // The finally block in runWorker handles closing Redis.
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the worker
runWorker();

