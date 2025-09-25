import React, { useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import type { Options } from 'vis-network';
import type { GraphComponentProps } from '../types/types';


const GraphComponent: React.FC<GraphComponentProps> = ({ graphData }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && graphData) {
      const isLargeGraph = graphData.nodes.length > 500;
      let options: Options;

      // Use simplified, high-performance options for very large graphs
      if (isLargeGraph) {
        options = {
          layout: { improvedLayout: false },
          nodes: { shape: 'dot', size: 8 },
          edges: { width: 0.5, arrows: { to: { enabled: false } } },
          physics: { enabled: true, solver: 'barnesHut', stabilization: { enabled: false } },
          interaction: { hover: true, tooltipDelay: 200 },
        };
      } else {
        // Use richer options for smaller, more interactive graphs
        options = {
          layout: { improvedLayout: true },
          nodes: {
            shape: 'dot', size: 16,
            font: { size: 14, color: '#b9bbbe' },
            color: { border: '#7289da', background: '#424549' },
          },
          edges: {
            color: { color: '#4f545c', highlight: '#7289da' },
            arrows: { to: { enabled: true, scaleFactor: 0.5 } },
          },
          physics: { solver: 'barnesHut', stabilization: { iterations: 1000 } },
          interaction: { hover: true, tooltipDelay: 200 },
        };
      }

      const network = new Network(containerRef.current, graphData, {
        ...options,
        height: '100%',
        width: '100%',
      });

      // For large graphs, turn off physics after initial layout for performance
      if (isLargeGraph) {
        network.once('stabilizationIterationsDone', () => {
          network.setOptions({ physics: false });
        });
      }

      return () => { network.destroy(); };
    }
  }, [graphData]);

  return <div ref={containerRef} className="w-full h-full bg-[#2f3136] rounded-lg border border-[#202225]" />;
};

export default GraphComponent;

