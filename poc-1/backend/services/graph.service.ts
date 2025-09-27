import { getSession } from '../config/db.js';

export const repositoryExists = async (repoName: string): Promise<boolean> => {
  const session = getSession();
  try {
    const result = await session.run(
      'MATCH (f:File {repo: $repoName}) RETURN f LIMIT 1',
      { repoName }
    );
    return result.records.length > 0;
  } finally {
    await session.close();
  }
};

export const fetchFullGraph = async (repoName: string) => {
  const session = getSession();
  try {
    // Fetch all nodes in a format the frontend can directly use.
    const nodesResult = await session.run(
      `MATCH (n:File {repo: $repoName}) RETURN n.id AS id, n.name AS label`,
      { repoName }
    );
    const nodes = nodesResult.records.map(record => ({
      id: record.get('id'),
      label: record.get('label'),
    }));

    // Fetch all relationships in a format the frontend can directly use.
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

// Finds all files that a given file imports (its dependencies).
export const findDependencies = async (repoName: string, filePath: string) => {
    const session = getSession();
    try {
        const result = await session.run(
            `MATCH (:File {id: $filePath, repo: $repoName})-[:IMPORTS]->(d:File)
             RETURN d.id AS id, d.name AS label`,
            { filePath, repoName }
        );
        return result.records.map(record => ({
          id: record.get('id'),
          label: record.get('label'),
        }));
    } finally {
        await session.close();
    }
};

// Finds all files that import a given file (its dependents).
export const findDependents = async (repoName: string, filePath: string) => {
    const session = getSession();
    try {
        const result = await session.run(
            `MATCH (d:File)-[:IMPORTS]->(:File {id: $filePath, repo: $repoName})
             RETURN d.id AS id, d.name AS label`,
            { filePath, repoName }
        );
        return result.records.map(record => ({
          id: record.get('id'),
          label: record.get('label'),
        }));
    } finally {
        await session.close();
    }
};
