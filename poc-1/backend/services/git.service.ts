import {simpleGit} from 'simple-git';
import type { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs-extra';

// This is the persistent base directory on the server to store all cloned repositories.
// In a scalable production app, this would be a mounted network volume (e.g., AWS EFS).
const REPOS_BASE_DIR = path.resolve(process.cwd(), '.repos');

// Ensure this cache directory exists on server startup.
fs.ensureDirSync(REPOS_BASE_DIR);

/**
 * Performs the FAST initial, shallow clone of a repository.
 * This is the only part the user should wait for on the first analysis.
 * @param repoUrl The full URL of the repository.
 * @param repoName The unique name of the repository (e.g., 'facebook/react').
 * @returns A SimpleGit instance ready for parsing.
 */
export const performInitialClone = async (repoUrl: string, repoName: string): Promise<SimpleGit> => {
  const localPath = path.join(REPOS_BASE_DIR, repoName);
  console.log(`[Git Service] Performing fast, shallow clone to ${localPath}...`);
  // Clone only the latest commit to get the files as fast as possible.
  await simpleGit().clone(repoUrl, localPath, { '--depth': '1' });
  return simpleGit(localPath);
};

/**
 * Performs the SLOW background task of fetching the full repository history.
 * This should be called *after* the initial response has been sent to the user.
 * @param repoName The unique name of the repository.
 */
export const fetchFullHistoryInBackground = async (repoName: string): Promise<void> => {
    const localPath = path.join(REPOS_BASE_DIR, repoName);
    if (!fs.existsSync(localPath)) {
        console.error(`[Git Service] Cannot unshallow repo that does not exist at ${localPath}`);
        return;
    }
    console.log(`[Git Service] Starting slow background unshallow for ${repoName}...`);
    const git = simpleGit(localPath);
    try {
        // This command converts the shallow clone to a full-history clone,
        // which is necessary for future `git diff` operations.
        await git.fetch('--unshallow');
        console.log(`[Git Service] Background unshallow for ${repoName} complete.`);
    } catch (error) {
        // This can fail if the repo was already a full clone or for other reasons.
        // It's not critical, so we just log a warning.
        console.warn(`[Git Service] Unshallow for ${repoName} may have failed (this is often ok):`, error);
    }
};

/**
 * Gets a handle to an existing local repository and fetches the latest updates.
 * This is used for incremental updates.
 * @param repoName The unique name of the repository (e.g., 'facebook/react').
 * @returns A SimpleGit instance ready to perform diffs.
 */
export const getRepo = async (repoName: string): Promise<SimpleGit> => {
  const localPath = path.join(REPOS_BASE_DIR, repoName);
  if (!fs.existsSync(localPath)) {
    console.error(`[Git Service] Error: Expected repo to exist at ${localPath} for an update.`);
    throw new Error(`Repository ${repoName} not found locally for update.`);
  }

  console.log(`[Git Service] Found existing repo at ${localPath}. Fetching updates...`);
  const git = simpleGit(localPath);
  // Download all new changes from the remote. Does not change local files.
  await git.fetch();
  return git;
};

/**
 * Gets a list of all files that have been added, modified, or deleted
 * between two commit SHAs.
 * @param git The SimpleGit instance for the repository.
 * @param oldSha The SHA of the previously analyzed commit.
 * @param newSha The SHA of the latest commit.
 * @returns An array of objects detailing the file changes.
 */
export const getDiff = async (git: SimpleGit, oldSha: string, newSha: string): Promise<{ status: string; path: string; }[]> => {
  // Use the --name-status flag to get a clean, parseable output of changes.
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
};

