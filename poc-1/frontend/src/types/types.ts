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
}