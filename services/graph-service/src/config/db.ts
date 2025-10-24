import neo4j, { Driver, Session } from 'neo4j-driver';

let driver: Driver;

export const initNeo4j = async (): Promise<void> => {
  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !user || !password) {
    throw new Error('Missing Neo4j connection details in environment variables (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)');
  }

  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    await driver.verifyConnectivity(); // Check if the connection is successful
    const serverInfo = await driver.getServerInfo();
    console.log(`[Neo4j Config] Successfully connected to Neo4j at ${serverInfo.address}`);
  } catch (error) {
    console.error('[Neo4j Config] Error connecting to Neo4j:', error);
    throw error; // Re-throw to prevent server startup on connection failure
  }
};

export const closeNeo4j = async (): Promise<void> => {
  if (driver) {
    console.log('[Neo4j Config] Closing Neo4j driver...');
    await driver.close();
    console.log('[Neo4j Config] Neo4j driver closed.');
  }
};

export const getSession = (): Session => {
  if (!driver) {
    throw new Error('Neo4j driver has not been initialized. Call initNeo4j() first.');
  }
  return driver.session();
};
