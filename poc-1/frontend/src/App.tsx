import React, { useState } from 'react';
import '../node_modules/vis-network/styles/vis-network.css';
import GraphComponent from './components/Graph';
import type { GraphData, Node, SearchType } from './types/types';
import { analyzeRepo, fetchDependencies, fetchDependents, fetchRecursiveDependents } from './services/api.service';

const App: React.FC = () => {
  // State for the main analysis
  const [repoUrl, setRepoUrl] = useState<string>('');
  const [repoName, setRepoName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [mainGraphData, setMainGraphData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State for the secondary search feature
  const [searchFilePath, setSearchFilePath] = useState<string>('');
  const [searchType, setSearchType] = useState<SearchType>('dependents');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResultData, setSearchResultData] = useState<GraphData | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleAnalyzeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!repoUrl) return setError('Please enter a GitHub repository URL.');

    setIsLoading(true);
    setError(null);
    setMainGraphData(null);
    setSearchResultData(null);

    try {
      const data = await analyzeRepo(repoUrl);
      setMainGraphData(data);
      const url = new URL(repoUrl);
      setRepoName(url.pathname.substring(1).replace(/\.git$/, ''));
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!repoName || !searchFilePath) {
      return setSearchError('Repository and file path must be present to search.');
    }

    setIsSearching(true);
    setSearchError(null);
    setSearchResultData(null);

    try {
      let searchFn;
      switch (searchType) {
        case 'dependencies':
          searchFn = fetchDependencies;
          break;
        case 'dependents':
          searchFn = fetchDependents;
          break;
        case 'recursive-dependents':
          searchFn = fetchRecursiveDependents;
          break;
        default:
          throw new Error('Invalid search type');
      }

      const results = await searchFn(repoName, searchFilePath);
      
      const centralNode: Node = { id: searchFilePath, label: searchFilePath.split('/').pop()! };
      
      const allNodesMap = new Map<string, Node>();
      allNodesMap.set(centralNode.id, centralNode);
      results.forEach(file => allNodesMap.set(file.id, file));
      
      const nodes = Array.from(allNodesMap.values());

      const edges = results.map(file => ({
        from: searchType === 'dependencies' ? centralNode.id : file.id,
        to: searchType === 'dependencies' ? file.id : centralNode.id,
      }));

      setSearchResultData({ nodes, edges });

    } catch (err: any) {
      setSearchError(err.message || 'Failed to fetch search results.');
    } finally {
      setIsSearching(false);
    }
  };
  
  const handleNodeSelection = (filePath: string) => {
    setSearchFilePath(filePath);
  };

  return (
    <div className="min-h-screen bg-[#36393f] text-[#b9bbbe] p-4 font-sans">
      <header className="text-center my-6">
        <h1 className="text-4xl font-bold text-white mb-2">Advanced Dependency Visualizer</h1>
      </header>
      
      <div className="bg-[#2f3136] p-6 rounded-lg shadow-lg max-w-4xl mx-auto">
        <form onSubmit={handleAnalyzeSubmit} className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="e.g., https://github.com/facebook/react"
            className="flex-grow bg-[#40444b] border border-[#202225] rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-[#7289da]"
            disabled={isLoading}
          />
          <button type="submit" className="bg-[#7289da] text-white font-bold py-3 px-6 rounded-md hover:bg-[#677bc4]" disabled={isLoading}>
            {isLoading ? 'Analyzing...' : 'Analyze Repository'}
          </button>
        </form>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        <div className="lg:col-span-2 w-full h-[75vh] min-h-[600px] bg-[#2f3136] p-4 rounded-lg shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4">Full Repository Graph</h2>
          {isLoading && <p>Loading graph...</p>}
          {error && <p className="text-red-400">{error}</p>}
          {mainGraphData && <GraphComponent graphData={mainGraphData} onNodeClick={handleNodeSelection} />}
        </div>

        <div className="lg:col-span-1 w-full h-[75vh] min-h-[600px] bg-[#2f3136] p-4 rounded-lg shadow-lg flex flex-col">
          <h2 className="text-xl font-bold text-white mb-4">Search & Inspect</h2>
          {mainGraphData ? (
            <form onSubmit={handleSearch} className="flex flex-col gap-4 h-full">
              <input
                type="text"
                value={searchFilePath}
                onChange={(e) => setSearchFilePath(e.target.value)}
                placeholder="Click a node or enter a file path..."
                className="w-full bg-[#40444b] border border-[#202225] rounded-md p-3"
                disabled={isSearching}
              />
              <div className="flex gap-4">
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value as SearchType)}
                  className="flex-grow bg-[#40444b] border border-[#202225] rounded-md p-3 appearance-none focus:outline-none focus:ring-2 focus:ring-[#7289da]"
                >
                  <option value="dependents">Find Dependents</option>
                  <option value="dependencies">Find Dependencies</option>
                  <option value="recursive-dependents">Find Recursive Dependents</option>
                </select>
                <button type="submit" className="bg-[#4f545c] text-white font-bold py-3 px-6 rounded-md hover:bg-[#5a6067]" disabled={isSearching}>
                  Search
                </button>
              </div>

              <div className="mt-4 flex-grow relative">
                {isSearching && <p>Searching...</p>}
                {searchError && <p className="text-red-400">{searchError}</p>}
                {searchResultData && <GraphComponent graphData={searchResultData} onNodeClick={handleNodeSelection} />}
              </div>
            </form>
          ) : (
            <div className="flex-grow flex items-center justify-center text-[#4f545c]">
              <p>Analyze a repository to enable search.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;