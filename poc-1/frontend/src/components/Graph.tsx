import React, { useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import type { Options } from 'vis-network';
import type { GraphComponentProps } from '../types/types';

/**
 * A React component to render the dependency graph using the core vis-network library.
 */
const GraphComponent: React.FC<GraphComponentProps> = ({ graphData }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && graphData) {
      // --- DYNAMIC OPTIONS BASED ON GRAPH SIZE ---
      const isLargeGraph = graphData.nodes.length > 500;
      let options: Options;

      if (isLargeGraph) {
        console.log("Large graph detected. Applying performance optimizations.");
        options = {
          layout: { improvedLayout: false },
          nodes: {
            shape: 'dot',
            size: 8,
            font: { size: 10, color: '#b9bbbe' },
          },
          edges: {
            width: 0.5,
            arrows: { to: { enabled: false } },
          },
          physics: {
            enabled: true,
            solver: 'barnesHut',
            stabilization: { enabled: false },
          },
          interaction: { hover: true, tooltipDelay: 200 },
          height: '100%',
          width: '100%',
        };
      } else {
        options = {
          layout: { improvedLayout: true },
          nodes: {
            shape: 'dot', size: 16,
            font: { size: 14, color: '#b9bbbe' },
            borderWidth: 2,
            color: {
              border: '#7289da', background: '#424549',
              highlight: { border: '#ffffff', background: '#7289da' },
            },
          },
          edges: {
            color: { color: '#4f545c', highlight: '#7289da' },
            width: 2,
            arrows: { to: { enabled: true, scaleFactor: 0.5 } },
          },
          physics: {
            enabled: true,
            solver: 'barnesHut',
            stabilization: { iterations: 1000 },
          },
          interaction: { hover: true, tooltipDelay: 200 },
          height: '100%',
          width: '100%',
        };
      }

      const network = new Network(containerRef.current, graphData, options);

      if (isLargeGraph) {
        network.once('stabilizationIterationsDone', () => {
          console.log("Stabilization finished, disabling physics.");
          network.setOptions({ physics: false });
        });
      }

      return () => { network.destroy(); };
    }
  }, [graphData]);

  return <div ref={containerRef} className="w-full h-full bg-[#2f3136] rounded-lg" />;
};

export default GraphComponent;

