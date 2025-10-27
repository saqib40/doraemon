import { Octokit } from '@octokit/rest';
import { OctokitResponse } from '@octokit/types';
import config from '../config/config.js'; // Use our centralized config

const octokit = new Octokit({ auth: config.githubToken });

const logRateLimit = (response: OctokitResponse<any, any>) => {
  const limit = response.headers['x-ratelimit-limit'];
  const remaining = response.headers['x-ratelimit-remaining'];
  const resetTimestamp = Number(response.headers['x-ratelimit-reset']);
  const resetTime = new Date(resetTimestamp * 1000).toLocaleTimeString();
  console.log(`[GitHub Rate Limit] Remaining: ${remaining}/${limit}. Resets at: ${resetTime}`);
};

/** Fetches the latest commit SHA for the default branch */
export const getLatestCommitSha = async (owner: string, repo: string): Promise<string | null> => {
  try {
    const repoResponse = await octokit.repos.get({ owner, repo });
    logRateLimit(repoResponse);
    const defaultBranch = repoResponse.data.default_branch;

    const refResponse = await octokit.repos.getBranch({ owner, repo, branch: defaultBranch });
    logRateLimit(refResponse);
    return refResponse.data.commit.sha;
  } catch (error) {
    console.error(`[GitHub Service] Failed to fetch latest SHA for ${owner}/${repo}:`, error);
    return null; // Return null on error
  }
};