import React, { useState } from 'react';
import { analyzeRepo } from './services/api.service';
import '../node_modules/vis-network/styles/vis-network.css';
import GraphComponent from './components/Graph';
import type { GraphData } from './types/types';


const App: React.FC = () => {
  const [repoUrl, setRepoUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!repoUrl) {
      setError('Please enter a GitHub repository URL.');
      return;
    }
    setIsLoading(true);
    setGraphData(null);
    setError(null);
    try {
      const data = await analyzeRepo(repoUrl);
      setGraphData(data);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#36393f] text-[#b9bbbe] flex flex-col items-center p-4 font-sans">
      <div className="w-full max-w-4xl">
        <header className="text-center my-6">
          <h1 className="text-4xl font-bold text-white mb-2">Dependency Graph Visualizer</h1>
          <p className="text-lg">Enter a public ts/js GitHub repository URL to visualize its file dependencies.</p>
        </header>
        <main className="bg-[#2f3136] p-6 rounded-lg shadow-lg">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="try this => https://github.com/facebook/react"
              className="flex-grow bg-[#40444b] border border-[#202225] text-white rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-[#7289da] transition-all"
              disabled={isLoading}
            />
            <button
              type="submit"
              className="bg-[#7289da] text-white font-bold py-3 px-6 rounded-md hover:bg-[#677bc4] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#2f3136] focus:ring-[#7289da] transition-all disabled:bg-gray-500 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? 'Analyzing...' : 'Analyze'}
            </button>
          </form>
          <div className="mt-6 w-full h-[70vh] min-h-[500px]">
            {isLoading && (
              <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#7289da]"></div>
                <p className="ml-4 text-lg">Cloning and parsing the repo... this may take a moment.</p>
              </div>
            )}
            {error && (
              <div className="text-center bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-md">
                <p className="font-bold">Error</p>
                <p>{error}</p>
              </div>
            )}
            {graphData && !isLoading && (
              <GraphComponent graphData={graphData} />
            )}
            {!graphData && !isLoading && !error && (
                <div className="flex justify-center items-center h-full text-center text-[#4f545c] border-2 border-dashed border-[#40444b] rounded-lg">
                    <p>The dependency graph will appear here once you analyze a repository.</p>
                </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;

