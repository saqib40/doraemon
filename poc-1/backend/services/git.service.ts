import { simpleGit } from 'simple-git';
import type { SimpleGit, SimpleGitOptions } from 'simple-git';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Configure simple-git options.
const options: Partial<SimpleGitOptions> = {
  baseDir: process.cwd(),
  binary: 'git',
  maxConcurrentProcesses: 6,
};

const git: SimpleGit = simpleGit(options);

export const cloneRepo = async (repoUrl: string): Promise<string> => {
  // Create a unique temporary directory path to avoid conflicts.
  // e.g., /tmp/repo-1678886400000
  const tempDir = path.join(os.tmpdir(), `repo-${Date.now()}`);
  await fs.mkdir(tempDir);

  try {
    // Perform a shallow clone (--depth 1) to only get the latest version
    // of the code, which is much faster and uses less disk space.
    await git.clone(repoUrl, tempDir, ['--depth', '1']);
    return tempDir;
  } catch (error) {
    // If cloning fails, clean up the created directory before throwing the error.
    await cleanupRepo(tempDir);
    throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const cleanupRepo = async (dirPath: string): Promise<void> => {
  try {
    // Use fs.rm with recursive: true to delete the folder and everything inside it.
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    // Log an error if cleanup fails, but don't throw, as the main operation
    // might have already completed.
    console.error(`Failed to clean up directory ${dirPath}:`, error);
  }
};
