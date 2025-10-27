import {simpleGit, type SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs-extra';

// IMPORTANT: Ensure this path is configurable and ideally points to a persistent volume in production
const REPOS_BASE_DIR = path.resolve(process.cwd(), '.repos');
fs.ensureDirSync(REPOS_BASE_DIR);

/** Performs the FAST initial, shallow clone */
export const performInitialClone = async (repoUrl: string, repoName: string): Promise<SimpleGit> => {
  const localPath = path.join(REPOS_BASE_DIR, repoName);
  // Clean up any potential leftover directory before cloning
  await fs.remove(localPath);
  console.log(`[Git Service] Performing fast, shallow clone to ${localPath}...`);
  await simpleGit().clone(repoUrl, localPath, { '--depth': '1' });
  return simpleGit(localPath);
};

/** Performs the SLOW background task of fetching full history */
export const fetchFullHistoryInBackground = async (repoName: string): Promise<void> => {
    const localPath = path.join(REPOS_BASE_DIR, repoName);
    if (!fs.existsSync(localPath)) {
        console.error(`[Git Service] Cannot unshallow repo that does not exist at ${localPath}`);
        return;
    }
    console.log(`[Git Service] Starting slow background unshallow for ${repoName}...`);
    const git = simpleGit(localPath);
    try {
        await git.fetch('--unshallow');
        console.log(`[Git Service] Background unshallow for ${repoName} complete.`);
    } catch (error: any) {
        // Log specific errors if possible, ignore common 'already unshallow' errors
        if (error.message && !error.message.includes('already a complete')) {
             console.warn(`[Git Service] Unshallow for ${repoName} failed:`, error.message);
        } else if (!error.message) {
            console.warn(`[Git Service] Unshallow for ${repoName} failed with unknown error:`, error);
        }
    }
};

/** Gets handle to existing repo and fetches latest updates */
export const getRepo = async (repoName: string): Promise<SimpleGit> => {
  const localPath = path.join(REPOS_BASE_DIR, repoName);
  if (!fs.existsSync(localPath)) {
    throw new Error(`[Git Service] Repository ${repoName} not found locally at ${localPath}.`);
  }
  console.log(`[Git Service] Found existing repo at ${localPath}. Fetching updates...`);
  const git = simpleGit(localPath);
  await git.fetch(); // Fetch latest changes from remote
  return git;
};

/** Gets the list of changed files between two SHAs */
export const getDiff = async (git: SimpleGit, oldSha: string, newSha: string): Promise<{ status: string; path: string; }[]> => {
  try {
    const diffOutput = await git.diff(['--name-status', oldSha, newSha]);
    return diffOutput.split('\n')
        .filter(Boolean) // Remove any empty lines
        .map(line => {
        const [status, filePath] = line.split('\t');
        if (status && filePath) {
            // The status can be complex (e.g., C75 for copy). We only care about the first letter.
            return { status: status.trim().charAt(0), path: filePath.trim() };
        }
        console.warn(`[Git Service] Unexpected diff line format, skipping: ${line}`);
        return null; // Mark as invalid
        })
    // Use a type guard to filter out nulls AND inform TypeScript
    .filter((item): item is { status: string; path: string } => item !== null);
  } catch (error) {
     console.error(`[Git Service] Error getting diff between ${oldSha.substring(0,7)} and ${newSha.substring(0,7)}:`, error);
     throw new Error(`Failed to get git diff: ${error instanceof Error ? error.message : String(error)}`);
  }
};
