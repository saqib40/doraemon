import { Project, ModuleResolutionKind } from 'ts-morph';
import path from 'path';
import fs from 'fs';
import { getSession } from '../config/db.js';

/**
 * Analyzes a project and stores its dependency graph directly into Neo4j.
 * This version is corrected for consistency and race conditions.
 */
export const analyzeAndStoreGraph = async (directoryPath: string, repoName: string) => {
  const tsConfigPath = path.join(directoryPath, 'tsconfig.json');
  const jsConfigPath = path.join(directoryPath, 'jsconfig.json');

  // --- BUG #1 FIX: Check for both tsconfig.json and jsconfig.json ---
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
    ...(configFilePath && { tsConfigFilePath: configFilePath }),
  });

  project.addSourceFilesAtPaths(`${directoryPath}/**/*.{js,jsx,ts,tsx}`);

  const session = getSession();
  try {
    const constraintsResult = await session.run(`
      SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties
      WHERE 'File' IN labelsOrTypes
      RETURN name, properties
    `);

    // 2. Find and drop the old, incorrect single-property constraint if it exists.
    for (const record of constraintsResult.records) {
      const constraintName = record.get('name');
      const properties = record.get('properties');
      if (properties.length === 1 && properties[0] === 'id') {
        console.log(`[DB] Found legacy constraint '${constraintName}'. Dropping it.`);
        await session.run(`DROP CONSTRAINT \`${constraintName}\``);
      }
    }
    // This constraint is correct and very important for performance.
    // indexing concept of dbs
    // makes lookup from O(n) to O(logn) approx O(1)
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (f:File) REQUIRE (f.id, f.repo) IS UNIQUE');

    const sourceFiles = project.getSourceFiles();

    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.getFilePath();
      if (!filePath.startsWith(directoryPath) || filePath.includes('node_modules')) {
        continue;
      }
      const relativePath = path.relative(directoryPath, filePath);

      // We still create the source node first.
      await session.run(
        `MERGE (f:File {id: $id, repo: $repo}) SET f.name = $name`,
        { id: relativePath, repo: repoName, name: path.basename(relativePath) }
      );

      const imports = sourceFile.getImportDeclarations();
      for (const imp of imports) {
        try {
          const importedSourceFile = imp.getModuleSpecifierSourceFile();
          if (importedSourceFile) {
            const importedFilePath = importedSourceFile.getFilePath();
            if (importedFilePath.startsWith(directoryPath) && !importedFilePath.includes('node_modules')) {
              const importedRelativePath = path.relative(directoryPath, importedFilePath);
              const importedFileName = path.basename(importedRelativePath);

              // Use MERGE for both nodes before creating the relationship ---
              // This query ensures that both the source and target nodes exist before
              // attempting to create the relationship between them, solving the race condition.
              await session.run(
                `MERGE (source:File {id: $sourceId, repo: $repo})
                 MERGE (target:File {id: $targetId, repo: $repo}) SET target.name = $targetName
                 MERGE (source)-[:IMPORTS]->(target)`,
                {
                  sourceId: relativePath,
                  targetId: importedRelativePath,
                  targetName: importedFileName,
                  repo: repoName
                }
              );
            }
          }
        } catch (error) {
          console.warn(`[Parser Warning] Could not resolve import in file: ${relativePath}`);
        }
      }
    }
    console.log(`✅ Graph for ${repoName} successfully stored in Neo4j.`);
  } finally {
    await session.close();
  }
};