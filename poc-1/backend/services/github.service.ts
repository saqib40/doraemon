import { Octokit } from '@octokit/rest';
import type { OctokitResponse } from '@octokit/types';

// --- 1. Initialize Octokit with Authentication ---
// The constructor automatically reads `process.env.GITHUB_TOKEN`
// which we loaded in `src/index.ts`.
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

/**
 * A helper function to log the rate limit status from a GitHub API response.
 * @param response The full response object from an octokit API call.
 */
const logRateLimit = (response: OctokitResponse<any, any>) => {
  const limit = response.headers['x-ratelimit-limit'];
  const remaining = response.headers['x-ratelimit-remaining'];
  const resetTimestamp = Number(response.headers['x-ratelimit-reset']);
  const resetTime = new Date(resetTimestamp * 1000).toLocaleTimeString();

  console.log(`[GitHub Rate Limit] Remaining: ${remaining}/${limit}. Resets at: ${resetTime}`);
};

/**
 * Fetches the latest commit SHA for the default branch of a given repository.
 * @param owner The owner of the repository (e.g., 'facebook').
 * @param repo The name of the repository (e.g., 'react').
 * @returns The full commit SHA string, or null if not found.
 */
export const getLatestCommitSha = async (owner: string, repo: string): Promise<string | null> => {
  try {
    // 1. Fetch the main repository data to find its default branch.
    const repoResponse = await octokit.repos.get({ owner, repo });
    logRateLimit(repoResponse); // Log rate limit after the call
    const defaultBranch = repoResponse.data.default_branch;

    // 2. Fetch the reference for that branch to get the latest commit SHA.
    const refResponse = await octokit.repos.getBranch({
      owner,
      repo,
      branch: defaultBranch,
    });
    logRateLimit(refResponse); // Log rate limit after this call too

    return refResponse.data.commit.sha;
  } catch (error) {
    console.error(`[GitHub Service] Failed to fetch latest SHA for ${owner}/${repo}:`, error);
    return null;
  }
};