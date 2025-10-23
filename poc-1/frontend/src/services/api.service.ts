import axios from 'axios';
import type { GraphData, Node } from '../types/types';

const API_BASE_URL = 'http://localhost:4000';


export const analyzeRepo = async (repoUrl: string): Promise<GraphData> => {
  const response = await axios.post(`${API_BASE_URL}/analyze`, { repoUrl });
  return response.data;
};

// Fetches the dependents for a specific file (i.e., all files that import it).
export const fetchDependents = async (repoName: string, filePath: string): Promise<Node[]> => {
  const response = await axios.get(`${API_BASE_URL}/files/${repoName}/dependents`, {
    params: { filePath },
  });
  return response.data;
};

// Fetches the dependencies for a specific file (i.e., all files it imports).
export const fetchDependencies = async (repoName: string, filePath: string): Promise<Node[]> => {
  const response = await axios.get(`${API_BASE_URL}/files/${repoName}/dependencies`, {
    params: { filePath },
  });
  return response.data;
};

export const fetchRecursiveDependents = async (repoName: string, filePath: string): Promise<Node[]> => {
  const response = await axios.get(`${API_BASE_URL}/files/${repoName}/recursive-dependents`, {
    params: { filePath },
  });
  return response.data;
};