import { Project, ModuleResolutionKind, SourceFile } from 'ts-morph';
import type { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';
import { getSession } from '../config/db.js';

/**
 * Initializes the ts-morph Project.
 * This is the core of the code-parsing engine.
 * @param repoRoot The absolute path to the root of the local repo.
 * @returns A ts-morph Project instance.
 */
const initializeProject = (repoRoot: string): Project => {
  const tsConfigPath = path.join(repoRoot, 'tsconfig.json');
  const jsConfigPath = path.join(repoRoot, 'jsconfig.json');

  let configFilePath: string | undefined = undefined;
  if (fs.existsSync(tsConfigPath)) {
    configFilePath = tsConfigPath;
  } else if (fs.existsSync(jsConfigPath)) {
    configFilePath = jsConfigPath;
  }

  return new Project({
    compilerOptions: {
      allowJs: true,
      moduleResolution: ModuleResolutionKind.NodeJs,
    },
    ...(configFilePath && { tsConfigFilePath: configFilePath }),
  });
};

/**
 * Parses a single source file and creates its :File node and
 * all of its [:IMPORTS] relationships in Neo4j.
 * @param sourceFile The ts-morph SourceFile object to process.
 * @param repoName The unique name of the repository.
 * @param repoRoot The absolute path to the root of the local repo.
 */
const processFile = async (sourceFile: SourceFile, repoName: string, repoRoot: string) => {
  const session = getSession();
  try {
    const filePath = sourceFile.getFilePath();
    const relativePath = path.relative(repoRoot, filePath);

    // 1. Create the :File node for the source file itself.
    await session.run(
      `MERGE (f:File {id: $id, repo: $repo}) SET f.name = $name`,
      { id: relativePath, repo: repoName, name: path.basename(relativePath) }
    );

    // 2. Find all its imports and create relationships.
    const imports = sourceFile.getImportDeclarations();
    for (const imp of imports) {
      try {
        const importedSourceFile = imp.getModuleSpecifierSourceFile();
        if (importedSourceFile) {
          const importedFilePath = importedSourceFile.getFilePath();
          // Only create relationships to files that are *inside* the project.
          if (importedFilePath.startsWith(repoRoot) && !importedFilePath.includes('node_modules')) {
            const importedRelativePath = path.relative(repoRoot, importedFilePath);
            const importedFileName = path.basename(importedRelativePath);

            // 3. This query is idempotent and robust.
            // It ensures both nodes exist *before* creating the relationship.
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
        // This catch block is crucial. It prevents one bad import (e.g., from
        // an exotic syntax or a Flow type) from crashing the entire analysis.
        console.warn(`[Parser] Could not resolve import in file: ${relativePath}`);
      }
    }
  } finally {
    await session.close();
  }
};

/**
 * Handles a file that was added to the repository.
 */
const handleAddedFile = async (filePath: string, repoName: string, project: Project, repoRoot: string) => {
  console.log(`[Parser] Handling added file: ${filePath}`);
  const sourceFile = project.addSourceFileAtPath(path.join(repoRoot, filePath));
  await processFile(sourceFile, repoName, repoRoot);
};

/**
 * Handles a file that was deleted from the repository.
 */
const handleDeleteFile = async (filePath: string, repoName: string) => {
  console.log(`[Parser] Handling deleted file: ${filePath}`);
  const session = getSession();
  try {
    // Find the node and detach it (remove all incoming/outgoing relationships)
    // before deleting the node itself.
    await session.run(
      'MATCH (f:File {id: $filePath, repo: $repoName}) DETACH DELETE f',
      { filePath, repoName }
    );
  } finally {
    await session.close();
  }
};

/**
 * Handles a file that was modified.
 */
const handleModifiedFile = async (filePath: string, repoName: string, project: Project, repoRoot: string) => {
  console.log(`[Parser] Handling modified file: ${filePath}`);
  const session = getSession();
  try {
    // 1. Delete all OLD outgoing import relationships from this file.
    // This is critical to remove dependencies that no longer exist.
    await session.run(
      'MATCH (f:File {id: $filePath, repo: $repoName})-[r:IMPORTS]->() DELETE r',
      { filePath, repoName }
    );
  } finally {
    await session.close();
  }
  // 2. Re-process the file to create the NEW import relationships.
  const sourceFile = project.addSourceFileAtPath(path.join(repoRoot, filePath));
  await sourceFile.refreshFromFileSystem(); // Ensure we're reading the new content
  await processFile(sourceFile, repoName, repoRoot);
};

/**
* Performs a full, first-time analysis of the entire repository.
* @param git The SimpleGit instance.
* @param repoName The unique name of the repository.
*/
export const performFullAnalysis = async (git: SimpleGit, repoName: string) => {
  console.log(`[Parser] Performing full analysis for ${repoName}...`);
  const repoRoot = await git.revparse(['--show-toplevel']);
  const project = initializeProject(repoRoot);
  
  // Add all relevant source files to the project at once.
  project.addSourceFilesAtPaths(`${repoRoot}/**/*.{js,jsx,ts,tsx}`);
  
  // Run the automated database migration to fix constraints.
  await migrateConstraints();

  const sourceFiles = project.getSourceFiles();
  console.log(`[Parser] Found ${sourceFiles.length} files to process.`);
  
  // Process all files in parallel (can be optimized further with a promise queue).
  const processingTasks: Promise<void>[] = [];
  for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();
    if (filePath.startsWith(repoRoot) && !filePath.includes('node_modules')) {
      processingTasks.push(processFile(sourceFile, repoName, repoRoot));
    }
  }
  await Promise.all(processingTasks);
  console.log(`[Parser] Full analysis for ${repoName} complete.`);
};


/**
* Performs an incremental update based on a git diff.
* @param git The SimpleGit instance.
* @param repoName The unique name of the repository.
* @param diff The array of file changes from git.service.
* @param newSha The new commit SHA we are updating to.
*/
export const performIncrementalUpdate = async (git: SimpleGit, repoName: string, diff: { status: string, path: string }[], newSha: string) => {
  console.log(`[Parser] Performing incremental update for ${repoName} with ${diff.length} changes.`);
  const repoRoot = await git.revparse(['--show-toplevel']);
  const project = initializeProject(repoRoot);
  
  // Check out the new state of the repository to ensure ts-morph reads the latest file contents.
  await git.checkout(newSha);

  // Process deletions first
  const deletionTasks: Promise<void>[] = [];
  for (const change of diff) {
    if (change.status === 'D') {
      deletionTasks.push(handleDeleteFile(change.path, repoName));
    }
  }
  await Promise.all(deletionTasks);

  // Then process additions and modifications
  const updateTasks: Promise<void>[] = [];
  for (const change of diff) {
    if (change.status === 'A') {
      // FIX: Pass the repoRoot string
      updateTasks.push(handleAddedFile(change.path, repoName, project, repoRoot));
    } else if (change.status === 'M') {
      // FIX: Pass the repoRoot string
      updateTasks.push(handleModifiedFile(change.path, repoName, project, repoRoot));
    }
  }
  await Promise.all(updateTasks);
  console.log(`[Parser] Incremental update for ${repoName} complete.`);
};


/**
 * A defensive, self-healing function to manage database constraints.
 * It finds and drops the old, incorrect single-property constraint if it exists,
 * and then creates the new, correct composite constraint.
 */
const migrateConstraints = async () => {
  const session = getSession();
  try {
    // 1. Get the names of all existing constraints for the File label.
    const constraintsResult = await session.run(`
      SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties
      WHERE 'File' IN labelsOrTypes
      RETURN name, properties
    `);

    // 2. Find and drop the old, incorrect single-property constraint (id) if it exists.
    for (const record of constraintsResult.records) {
      const constraintName = record.get('name');
      const properties = record.get('properties');
      if (properties.length === 1 && properties[0] === 'id') {
        console.log(`[DB Migration] Found legacy constraint '${constraintName}'. Dropping it.`);
        await session.run(`DROP CONSTRAINT \`${constraintName}\``);
      }
    }

    // 3. Create the new, correct composite constraint (id, repo) if it doesn't already exist.
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (f:File) REQUIRE (f.id, f.repo) IS UNIQUE');
  } catch(error) {
    console.error(`[DB Migration] Error during constraint migration:`, error);
  } finally {
    await session.close();
  }
};
