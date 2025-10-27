import { Project, ModuleResolutionKind, SourceFile } from 'ts-morph';
import type { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';
import {createOrUpdateFile, createRelationship, deleteFile, deleteRelationships, } from './graph.client.js';

/** Initializes the ts-morph Project */
const initializeProject = (repoRoot: string): Project => {
  const tsConfigPath = path.join(repoRoot, 'tsconfig.json');
  const jsConfigPath = path.join(repoRoot, 'jsconfig.json');
  let configFilePath: string | undefined = undefined;
  if (fs.existsSync(tsConfigPath)) configFilePath = tsConfigPath;
  else if (fs.existsSync(jsConfigPath)) configFilePath = jsConfigPath;

  return new Project({
    compilerOptions: { allowJs: true, moduleResolution: ModuleResolutionKind.NodeJs },
    ...(configFilePath && { tsConfigFilePath: configFilePath }),
  });
};

/** Parses a single file and updates graph via API calls */
const processFile = async (sourceFile: SourceFile, repoName: string, repoRoot: string) => {
  const filePath = sourceFile.getFilePath();
  const relativePath = path.relative(repoRoot, filePath);
  const fileName = path.basename(relativePath);

  // 1. Create/Update the :File node via Graph Service API
  await createOrUpdateFile(repoName, relativePath, fileName);

  // 2. Find imports and create relationships via Graph Service API
  const imports = sourceFile.getImportDeclarations();
  const relationshipPromises: Promise<void>[] = []; // Collect promises

  for (const imp of imports) {
    try {
      const importedSourceFile = imp.getModuleSpecifierSourceFile();
      if (importedSourceFile) {
        const importedFilePath = importedSourceFile.getFilePath();
        if (importedFilePath.startsWith(repoRoot) && !importedFilePath.includes('node_modules')) {
          const importedRelativePath = path.relative(repoRoot, importedFilePath);
          const importedFileName = path.basename(importedRelativePath);
          // Add promise to the list
          relationshipPromises.push(
            createRelationship(repoName, relativePath, importedRelativePath, importedFileName)
          );
        }
      }
    } catch (error) {
      console.warn(`[Parser] Could not resolve import in ${relativePath}: ${imp.getText().substring(0, 50)}...`);
    }
  }
  // Wait for all relationship creations for this file to complete
  await Promise.all(relationshipPromises);
};

/** Handles added files */
const handleAddedFile = async (filePath: string, repoName: string, project: Project, repoRoot: string) => {
  console.log(`[Parser] Handling added file: ${filePath}`);
  const sourceFile = project.addSourceFileAtPath(path.join(repoRoot, filePath));
  await processFile(sourceFile, repoName, repoRoot);
};

/** Handles deleted files */
const handleDeleteFile = async (filePath: string, repoName: string) => {
  console.log(`[Parser] Handling deleted file: ${filePath}`);
  // Call Graph Service API to delete the node
  await deleteFile(repoName, filePath);
};

/** Handles modified files */
const handleModifiedFile = async (filePath: string, repoName: string, project: Project, repoRoot: string) => {
  console.log(`[Parser] Handling modified file: ${filePath}`);
  // 1. Delete old outgoing relationships via Graph Service API
  await deleteRelationships(repoName, filePath);

  // 2. Re-process the file to create new relationships
  const sourceFile = project.addSourceFileAtPath(path.join(repoRoot, filePath));
  // Ensure we read the updated file content from disk
  try {
      await sourceFile.refreshFromFileSystem();
      await processFile(sourceFile, repoName, repoRoot);
  } catch(error) {
      console.error(`[Parser] Error refreshing/processing modified file ${filePath}:`, error);
      // Decide if we should re-throw or just log
  }
};

/** Performs a full, first-time analysis */
export const performFullAnalysis = async (git: SimpleGit, repoName: string) => {
  console.log(`[Parser] Performing full analysis for ${repoName}...`);
  const repoRoot = await git.revparse(['--show-toplevel']);
  const project = initializeProject(repoRoot);
  project.addSourceFilesAtPaths(`${repoRoot}/**/*.{js,jsx,ts,tsx}`);

  const sourceFiles = project.getSourceFiles();
  console.log(`[Parser] Found ${sourceFiles.length} files to process.`);

  // Process files sequentially or in batches to avoid overwhelming the system/network
  for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();
    if (filePath.startsWith(repoRoot) && !filePath.includes('node_modules')) {
      try {
        await processFile(sourceFile, repoName, repoRoot);
      } catch (error) {
         console.error(`[Parser] Error processing file ${filePath} during full analysis:`, error);
         // Continue with the next file
      }
    }
  }
  console.log(`[Parser] Full analysis for ${repoName} complete.`);
};

/** Performs an incremental update based on git diff */
export const performIncrementalUpdate = async (git: SimpleGit, repoName: string, diff: { status: string, path: string }[], newSha: string) => {
  console.log(`[Parser] Performing incremental update for ${repoName} with ${diff.length} changes.`);
  const repoRoot = await git.revparse(['--show-toplevel']);
  const project = initializeProject(repoRoot); // Initialize project for tsconfig/jsconfig

  // Check out the new state to read correct file contents
  console.log(`[Parser] Checking out target SHA ${newSha.substring(0,7)}...`);
  await git.checkout(newSha);
  console.log(`[Parser] Checkout complete.`);


  // Process deletions first
  const deletionPromises = diff
    .filter(change => change.status === 'D')
    .map(change => handleDeleteFile(change.path, repoName));
  await Promise.all(deletionPromises);

  // Process additions and modifications
  const updatePromises = diff
    .filter(change => change.status === 'A' || change.status === 'M')
    .map(change => {
      if (change.status === 'A') {
        return handleAddedFile(change.path, repoName, project, repoRoot);
      } else { // status === 'M'
        return handleModifiedFile(change.path, repoName, project, repoRoot);
      }
    });
  await Promise.all(updatePromises);

  console.log(`[Parser] Incremental update for ${repoName} complete.`);
};
