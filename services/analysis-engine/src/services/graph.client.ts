import axios, { AxiosInstance } from 'axios';
import config from '../config/config.js'; // Corrected import path

// Define the Node structure expected from the Graph Service API (matches shared-types)
interface Node {
    id: string;
    label: string;
}

// Define expected response type for SHA endpoint
interface ShaResponse {
  lastAnalyzedSha: string | null;
}

// Basic Axios instance setup
const apiClient: AxiosInstance = axios.create({
  baseURL: config.graphServiceUrl,
  timeout: 30000, // Increased timeout for potentially longer graph queries
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Fetches the last analyzed SHA */
export const fetchLastAnalyzedSha = async (repoName: string): Promise<string | null> => {
  try {
    const [owner, repo] = repoName.split('/');
    if (!owner || !repo) throw new Error('Invalid repoName format');
    const response = await apiClient.get<ShaResponse>(`/repository/${owner}/${repo}/lastAnalyzedSha`);
    return response.data.lastAnalyzedSha;
  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    console.error(`[Graph Client] Error fetching last analyzed SHA for ${repoName}:`, error.message);
    throw error;
  }
};

/** Updates the last analyzed SHA */
export const updateLastAnalyzedSha = async (repoName: string, sha: string): Promise<void> => {
  try {
    const [owner, repo] = repoName.split('/');
     if (!owner || !repo) throw new Error('Invalid repoName format');
    await apiClient.put(`/repository/${owner}/${repo}/lastAnalyzedSha`, { sha });
    console.log(`[Graph Client] Updated lastAnalyzedSha for ${repoName} to ${sha.substring(0, 7)}`);
  } catch (error: any) {
    console.error(`[Graph Client] Error updating last analyzed SHA for ${repoName}:`, error.message);
    throw error;
  }
};

/** Creates or updates a file node */
export const createOrUpdateFile = async (repoName: string, filePath: string, fileName: string): Promise<void> => {
  try {
    await apiClient.post('/internal/files', { repoName, filePath, fileName });
  } catch (error: any) {
    console.error(`[Graph Client] Error upserting file ${filePath} for ${repoName}:`, error.message);
    throw error;
  }
};

/** Deletes a file node */
export const deleteFile = async (repoName: string, filePath: string): Promise<void> => {
    try {
        await apiClient.delete('/internal/files', { data: { repoName, filePath } });
    } catch (error: any) {
        console.error(`[Graph Client] Error deleting file ${filePath} for ${repoName}:`, error.message);
        throw error;
    }
};

/** Creates an import relationship */
export const createRelationship = async (repoName: string, fromFilePath: string, toFilePath: string, toFileName: string): Promise<void> => {
    try {
        await apiClient.post('/internal/relationships', { repoName, fromFilePath, toFilePath, toFileName });
    } catch (error: any) {
        console.error(`[Graph Client] Error creating relationship ${fromFilePath} -> ${toFilePath} for ${repoName}:`, error.message);
        throw error;
    }
};

/** Deletes all outgoing relationships from a file */
export const deleteRelationships = async (repoName: string, filePath: string): Promise<void> => {
    try {
        await apiClient.delete('/internal/relationships', { data: { repoName, filePath } });
    } catch (error: any) {
        console.error(`[Graph Client] Error deleting relationships from ${filePath} for ${repoName}:`, error.message);
        throw error;
    }
};

// --- NEW FUNCTION ---
/**
 * Calls the Graph Service to find all recursive dependents for a given file.
 * @param repoName e.g., 'owner/repo'
 * @param filePath The relative path of the file.
 * @returns A promise that resolves to an array of Node objects ({id, label}).
 */
export const findRecursiveDependents = async (repoName: string, filePath: string): Promise<Node[]> => {
    try {
        const [owner, repo] = repoName.split('/');
        if (!owner || !repo) throw new Error('Invalid repoName format');
        // Call the specific endpoint on the Graph Service
        const response = await apiClient.get<Node[]>(`/files/${owner}/${repo}/recursive-dependents`, {
            params: { filePath } // Pass filePath as a query parameter
        });
        return response.data; // The Graph Service already formats this as {id, label}
    } catch (error: any) {
        console.error(`[Graph Client] Error finding recursive dependents for ${filePath} in ${repoName}:`, error.message);
        // Depending on requirements, you might want to return [] instead of throwing
        throw error;
    }
};
// --- END NEW FUNCTION ---

/** Checks Graph Service health */
export const checkGraphServiceHealth = async (): Promise<boolean> => {
    try {
        const response = await apiClient.get('/health');
        return response.status === 200;
    } catch (error) {
        console.error('[Graph Client] Graph Service health check failed:', error);
        return false;
    }
};

