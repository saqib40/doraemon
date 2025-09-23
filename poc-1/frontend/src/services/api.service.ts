import axios from 'axios';
import type { GraphData } from '../types/types';


const API_URL = 'http://localhost:4000';


export const analyzeRepo = async (repoUrl: string): Promise<GraphData> => {
  try {
    const response = await axios.post<GraphData>(`${API_URL}/analyze`, {
      repoUrl,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("API Error:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to analyze repository. Check the server logs.');
    }
    console.error("Unexpected Error:", error);
    throw new Error('An unexpected error occurred.');
  }
};
