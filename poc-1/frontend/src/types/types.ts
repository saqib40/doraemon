export interface Node {
  id: string;
  label: string; // name property
}

export interface Edge {
  from: string;
  to: string;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

export interface GraphComponentProps {
  graphData: GraphData;
  onNodeClick: (nodeId: string) => void; // A function that receives the clicked node's ID
}

export type SearchType = 'dependencies' | 'dependents' | 'recursive-dependents';