// orchestrator for processing a single job
// lots of place holders here
// need to add logic for them
// is our product only going to return blast radius and let the developers 
// handle logic to work with the blast radius (aka have tests run only for those files by writing more logic within their github actions configuration)
// or should we return the affected jobs by ourselves
// that would also mean parsing their configuration file for github action
// writing more logic for that here in application
// need to think about architecture as a whole
// for the time being we will focus on option 1
// not the plug an dplay which we intended
// but fine for version 1
// version 2 will included parsing the actions yaml hence the true plug-and-play tool


import { URL } from 'url';
import { getRepo, getDiff, performInitialClone, fetchFullHistoryInBackground } from '../services/git.service.js';
import { getLatestCommitSha } from '../services/github.service.js';
import { fetchLastAnalyzedSha, updateLastAnalyzedSha, findRecursiveDependents } from '../services/graph.client.js';
import { performIncrementalUpdate, performFullAnalysis } from '../services/parser.service.js';
import { publishDispatchJob, acknowledgeJob } from '../config/redis.js';

// Define the expected structure of the job payload from Redis
interface AnalysisJobPayload {
  repoUrl: string;
  sha: string;         // The commit SHA that triggered the analysis
  event: string;       // The GitHub event type (e.g., 'push', 'pull_request')
  prNumber: number | null; // The PR number, if applicable
  receivedAt: string;  // ISO string timestamp when the ingester received the request
}

/**
 * Handles the processing of a single analysis job following Option A.
 * Orchestrates fetching, comparing SHAs, diffing, parsing, updating the graph,
 * calculating the affected files (blast radius), and publishing the result.
 * @param jobId The Redis Stream message ID.
 * @param payload The job data containing the repoUrl.
 */
export const handleAnalysisJob = async (jobId: string, payload: AnalysisJobPayload): Promise<void> => {
    console.log(`[Job Handler] Received job ${jobId}: Analyzing ${payload.repoUrl}`);
    const { repoUrl } = payload;

    if (!repoUrl) {
        console.error(`[Job Handler] Job ${jobId} missing repoUrl.`);
        await acknowledgeJob(jobId); // Acknowledge invalid job immediately
        return; // Stop processing
    }
    let analysisPerformed = false; // Flag to track if actual analysis happened
    // Keep track of files directly changed in this update (Added or Modified)
    let directlyChangedFiles: string[] = [];

    try {
        // --- 1. Initial Setup & SHA Comparison ---
        const url = new URL(repoUrl);
        const repoName = url.pathname.substring(1).replace(/\.git$/, '');
        const [owner, repo] = repoName.split('/');
        if (!owner || !repo) throw new Error(`Could not parse owner/repo from ${repoName}`);

        console.log(`[Job Handler] Fetching SHAs for ${repoName}...`);
        const remoteSha = await getLatestCommitSha(owner, repo);
        if (!remoteSha) throw new Error('Failed to get remote SHA from GitHub.');

        const localSha = await fetchLastAnalyzedSha(repoName);

        // --- 2. Decide Action based on SHAs ---
        if (localSha && localSha === remoteSha) {
            console.log(`[Job Handler] Repo ${repoName} is up-to-date (SHA: ${remoteSha.substring(0,7)}). No analysis needed.`);
            // Publish a "no-change" message so downstream knows the check completed.
            await publishDispatchJob({
                repoName,
                sha: remoteSha,
                status: 'no-change',
                affectedFiles: [] // No files affected
            });
            return; // Successful completion
        }

        // --- 3. Perform Analysis (Full or Incremental) ---
        analysisPerformed = true; // Mark that we are doing analysis work
        if (localSha) {
            // --- Incremental Update ---
            console.log(`[Job Handler] Repo ${repoName} changed (${localSha.substring(0,7)} -> ${remoteSha.substring(0,7)}). Performing incremental update.`);
            const git = await getRepo(repoName); // Fetches updates
            const diff = await getDiff(git, localSha, remoteSha);
            if (diff.length > 0) {
                 await performIncrementalUpdate(git, repoName, diff, remoteSha);
                 // Store the paths of files that were Added or Modified
                 directlyChangedFiles = diff
                     .filter(f => f.status === 'A' || f.status === 'M')
                     .map(f => f.path);
            } else {
                 console.log(`[Job Handler] No file changes detected between SHAs for ${repoName}. Only updating SHA.`);
            }
        } else {
            // --- First-time Analysis ---
            console.log(`[Job Handler] Repo ${repoName} not found locally. Performing first-time analysis.`);
            const git = await performInitialClone(repoUrl, repoName);
            await performFullAnalysis(git, repoName);
            fetchFullHistoryInBackground(repoName); // Fire-and-forget background history fetch

            // For the first analysis, we *could* consider all non-node_modules files
            // as "affected", but that might be too noisy. It's often better to only
            // report affected files based on *changes* from a previous state.
            // So, we'll leave directlyChangedFiles empty here. Subsequent runs will be incremental.
             console.log(`[Job Handler] First analysis complete. Affected files will be reported on subsequent changes.`);
        }

        // --- 4. Update Stored SHA in Graph Service ---
        await updateLastAnalyzedSha(repoName, remoteSha);
        console.log(`[Job Handler] Analysis recorded complete for ${repoName} at ${remoteSha.substring(0,7)}.`);

        // --- 5. Calculate Blast Radius (Affected Files) ---
        const affectedFilesSet = new Set<string>(directlyChangedFiles);

        if (directlyChangedFiles.length > 0) {
            console.log(`[Job Handler] Calculating blast radius for ${directlyChangedFiles.length} changed file(s)...`);
            // Use Promise.all to query dependents for all changed files concurrently
            const dependentPromises = directlyChangedFiles.map(filePath =>
                findRecursiveDependents(repoName, filePath)
                    .catch((err : any) => { // Add error handling for individual queries
                        console.error(`[Job Handler] Failed to find dependents for ${filePath}:`, err);
                        return []; // Return empty array on error for this file
                    })
            );
            const dependentResults = await Promise.all(dependentPromises);

            // Flatten the results and add unique file paths to the set
            dependentResults.flat().forEach(node => affectedFilesSet.add(node.id));
            console.log(`[Job Handler] Total affected files (including dependents): ${affectedFilesSet.size}`);
        } else {
            console.log(`[Job Handler] No direct file changes to calculate blast radius from.`);
        }

        const affectedFiles = Array.from(affectedFilesSet);

        // --- 6. Publish Result (Affected Files List) ---
        await publishDispatchJob({
            repoName,
            sha: remoteSha,
            status: 'success',
            affectedFiles: affectedFiles // The calculated blast radius
        });

    } catch (error: any) {
        console.error(`[Job Handler] FAILED processing job ${jobId} for ${payload.repoUrl}:`, error);
        // Publish a failure message to the dispatch queue
        // Avoid leaking internal error details if possible
        const publicErrorMessage = error instanceof Error ? error.message : 'Unknown analysis error';
        try {
             await publishDispatchJob({
                repoName: payload.repoUrl.includes('/') ? payload.repoUrl.substring(payload.repoUrl.lastIndexOf('/') + 1).replace(/\.git$/, '') : 'unknown', // Best effort repo name
                sha: 'unknown', // We might not know the SHA if GitHub fetch failed
                status: 'failure',
                error: publicErrorMessage,
                affectedFiles: []
            });
        } catch(pubError) {
             console.error(`[Job Handler] FAILED to publish error message for job ${jobId}:`, pubError);
        }
        // CRITICAL: Decide whether to acknowledge. If acknowledged, the job is gone.
        // If not acknowledged, it might be retried after the pending timeout.
        // For persistent errors (like invalid repo URL), acknowledging is better.
        // For transient errors (like network hiccup), not acknowledging allows retry.
        // Let's acknowledge for now to prevent infinite loops on bad input.
        await acknowledgeJob(jobId);
    }
};