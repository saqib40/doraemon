import neo4j, { Driver, Session } from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

// Create a single driver instance
let driver: Driver;

function initDriver(): Driver {
    if (!driver) {
        driver = neo4j.driver(NEO4J_URI as string, neo4j.auth.basic(NEO4J_USER as string, NEO4J_PASSWORD as string));
    }
    return driver;
}

async function closeDriver(): Promise<void> {
    if (driver) {
        await driver.close();
    }
}

const getSession = (): Session => {
  if (!driver) {
    throw new Error('Neo4j driver has not been initialized. Please call initNeo4j() first.');
  }
  return driver.session();
};

export { initDriver, closeDriver, getSession };