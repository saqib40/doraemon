import { getSession } from '../config/db.js';

export const repositoryExists = async (repoName: string): Promise<boolean> => {
  const session = getSession();
  try {
    // Check for either a :Repository node or :File nodes with that repo name.
    const result = await session.run(
      'MATCH (n) WHERE (n:Repository AND n.name = $repoName) OR (n:File AND n.repo = $repoName) RETURN n LIMIT 1',
      { repoName }
    );
    return result.records.length > 0;
  } finally {
    await session.close();
  }
};

export const getLastAnalyzedSha = async (repoName: string): Promise<string | null> => {
  const session = getSession();
  try {
    const result = await session.run(
      'MATCH (r:Repository {name: $repoName}) RETURN r.lastAnalyzedSha AS sha',
      { repoName }
    );
    return result.records[0]?.get('sha') || null;
  } finally {
    await session.close();
  }
};

export const setLastAnalyzedSha = async (repoName: string, sha: string) => {
  const session = getSession();
  try {
    // MERGE finds the :Repository node or creates it if it doesn't exist.
    // SET then updates the property to the latest SHA.
    await session.run(
      'MERGE (r:Repository {name: $repoName}) SET r.lastAnalyzedSha = $sha',
      { repoName, sha }
    );
  } finally {
    await session.close();
  }
};

export const fetchFullGraph = async (repoName: string) => {
  const session = getSession();
  try {
    const nodesResult = await session.run(
      `MATCH (n:File {repo: $repoName}) RETURN n.id AS id, n.name AS label`,
      { repoName }
    );
    const nodes = nodesResult.records.map(record => ({
      id: record.get('id'),
      label: record.get('label'),
    }));

    const edgesResult = await session.run(
      `MATCH (source:File {repo: $repoName})-[:IMPORTS]->(target:File {repo: $repoName})
       RETURN source.id AS from, target.id AS to`,
      { repoName }
    );
    const edges = edgesResult.records.map(record => ({
      from: record.get('from'),
      to: record.get('to'),
    }));

    return { nodes, edges };
  } finally {
    await session.close();
  }
};

export const findDependencies = async (repoName: string, filePath: string) => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (:File {id: $filePath, repo: $repoName})-[:IMPORTS]->(d:File)
       RETURN d.id AS id, d.name AS label`,
      { filePath, repoName }
    );
    return result.records.map(record => ({ id: record.get('id'), label: record.get('label') }));
  } finally {
    await session.close();
  }
};

export const findDependents = async (repoName: string, filePath: string) => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (d:File)-[:IMPORTS]->(:File {id: $filePath, repo: $repoName})
       RETURN d.id AS id, d.name AS label`,
      { filePath, repoName }
    );
    return result.records.map(record => ({ id: record.get('id'), label: record.get('label') }));
  } finally {
    await session.close();
  }
};

export const findRecursiveDependents = async (repoName: string, filePath: string) => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (dependent:File)-[:IMPORTS*]->(:File {id: $filePath, repo: $repoName})
       RETURN DISTINCT dependent.id AS id, dependent.name AS label`,
      { filePath, repoName }
    );
    return result.records.map(record => ({ id: record.get('id'), label: record.get('label') }));
  } finally {
    await session.close();
  }
};

// Creates or updates a :File node. Uses MERGE for idempotency
export const createOrUpdateFileNode = async (repoName: string, filePath: string, fileName: string) => {
  const session = getSession();
  try {
    await session.run(
      `MERGE (f:File {id: $filePath, repo: $repoName}) SET f.name = $fileName`,
      { filePath, repoName, fileName }
    );
  } finally {
    await session.close();
  }
};

export const deleteFileNode = async (repoName: string, filePath: string) => {
  const session = getSession();
  try {
    await session.run(
      'MATCH (f:File {id: $filePath, repo: $repoName}) DETACH DELETE f',
      { filePath, repoName }
    );
  } finally {
    await session.close();
  }
};

export const createImportRelationship = async (repoName: string, fromFilePath: string, toFilePath: string, toFileName: string) => {
  const session = getSession();
  try {
    // This MERGE ensures both source and target exist before creating the relationship.
    // It also sets the name on the target in case it's newly created here.
    await session.run(
      `MERGE (source:File {id: $fromFilePath, repo: $repoName})
       MERGE (target:File {id: $toFilePath, repo: $repoName}) SET target.name = $toFileName
       MERGE (source)-[:IMPORTS]->(target)`,
      { fromFilePath, toFilePath, repoName, toFileName }
    );
  } finally {
    await session.close();
  }
};

// used when a file is modified to clear old dependencies
export const deleteOutgoingRelationships = async (repoName: string, filePath: string) => {
  const session = getSession();
  try {
    await session.run(
      'MATCH (f:File {id: $filePath, repo: $repoName})-[r:IMPORTS]->() DELETE r',
      { filePath, repoName }
    );
  } finally {
    await session.close();
  }
};

// Ensures the correct database constraints are set up
// Should be run once on service startup or during deployment
export const migrateConstraints = async () => {
  const session = getSession();
  console.log('[DB Migration] Ensuring constraints...');
  try {
    const constraintsResult = await session.run(`
      SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties
      WHERE ('File' IN labelsOrTypes OR 'Repository' IN labelsOrTypes)
      RETURN name, properties, labelsOrTypes
    `);

    let foundSimpleIdConstraint = false;
    let foundCompositeConstraint = false;
    let foundRepoNameConstraint = false;

    for (const record of constraintsResult.records) {
      const constraintName = record.get('name');
      const properties = record.get('properties');
      const labels = record.get('labelsOrTypes');

      if (labels.includes('File')) {
        if (properties.length === 1 && properties[0] === 'id') {
          console.log(`[DB Migration] Found legacy constraint '${constraintName}'. Dropping it.`);
          await session.run(`DROP CONSTRAINT \`${constraintName}\``);
          foundSimpleIdConstraint = true; // Mark that we dropped it
        } else if (properties.length === 2 && properties.includes('id') && properties.includes('repo')) {
          foundCompositeConstraint = true;
          console.log(`[DB Migration] Correct composite constraint '${constraintName}' already exists.`);
        }
      } else if (labels.includes('Repository')) {
         if (properties.length === 1 && properties[0] === 'name') {
           foundRepoNameConstraint = true;
           console.log(`[DB Migration] Repository name constraint '${constraintName}' already exists.`);
         }
      }
    }

    // Create constraints only if they weren't found (or if we just dropped the bad one)
    if (!foundCompositeConstraint || foundSimpleIdConstraint) {
      console.log('[DB Migration] Creating composite constraint for :File(id, repo)...');
      await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (f:File) REQUIRE (f.id, f.repo) IS UNIQUE');
    }
     if (!foundRepoNameConstraint) {
      console.log('[DB Migration] Creating uniqueness constraint for :Repository(name)...');
      await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (r:Repository) REQUIRE r.name IS UNIQUE');
    }

    console.log('[DB Migration] Constraint check complete.');
  } catch(error) {
    console.error(`[DB Migration] Error during constraint migration:`, error);
    // Decide if this should prevent startup
  } finally {
    await session.close();
  }
};