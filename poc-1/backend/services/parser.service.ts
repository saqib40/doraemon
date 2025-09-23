import { Project, ModuleResolutionKind, ts, SyntaxKind } from 'ts-morph';
import path from 'path';
import fs from 'fs';

// Define the structure for our graph data, which will be sent to the frontend.
interface Node {
  id: string;
  label: string;
}

interface Edge {
  from: string;
  to: string;
}

interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Analyzes a TypeScript/JavaScript project in a given directory,
 * builds a dependency graph, and returns it.
 * @param directoryPath The absolute path to the project directory.
 * @returns An object containing the nodes and edges of the dependency graph.
 */
export const generateGraph = async (directoryPath: string): Promise<GraphData> => {
  const tsConfigPath = path.join(directoryPath, 'tsconfig.json');
  const jsConfigPath = path.join(directoryPath, 'jsconfig.json');

  // Determine which config file to use, if any.
  let configFilePath: string | undefined = undefined;
  if (fs.existsSync(tsConfigPath)) {
    configFilePath = tsConfigPath;
  } else if (fs.existsSync(jsConfigPath)) {
    configFilePath = jsConfigPath;
  }

  const project = new Project({
    compilerOptions: {
      allowJs: true,
      moduleResolution: ModuleResolutionKind.NodeJs,
    },
    // Use the config file if one was found.
    ...(configFilePath && { tsConfigFilePath: configFilePath }),
  });

  project.addSourceFilesAtPaths(`${directoryPath}/**/*.{js,jsx,ts,tsx}`);

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const processedFiles = new Set<string>();

  const sourceFiles = project.getSourceFiles();
  for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();

    if (!filePath.startsWith(directoryPath) || filePath.includes('node_modules')) {
      continue;
    }

    const relativePath = path.relative(directoryPath, filePath);

    if (!processedFiles.has(relativePath)) {
      nodes.push({
        id: relativePath,
        label: path.basename(relativePath),
      });
      processedFiles.add(relativePath);
    }

    const imports = sourceFile.getImportDeclarations();
    for (const imp of imports) {
      // Large codebases like React use advanced syntax (or Flow types) that can result
      // in a module specifier that isn't a simple string. The original code would crash here.
      // By wrapping this in a try-catch block, we can gracefully handle these cases,
      // skip the problematic import, and continue parsing the rest of the file.
      // though Flow isn't much used anymore for type safety within JS
      // cause everybody is now migrating to TS
      // but just to add more resilence to our tool
      try {
        const importedSourceFile = imp.getModuleSpecifierSourceFile();
        if (importedSourceFile) {
          const importedFilePath = importedSourceFile.getFilePath();

          if (importedFilePath.startsWith(directoryPath) && !importedFilePath.includes('node_modules')) {
            const importedRelativePath = path.relative(directoryPath, importedFilePath);
            edges.push({
              from: relativePath,
              to: importedRelativePath,
            });
          }
        }
      } catch (error) {
        // Log a warning so we know an import was skipped, but don't crash the server.
        console.warn(`[Parser Warning] Could not resolve import in file: ${relativePath}`);
      }
    }
  }

  return { nodes, edges };
};