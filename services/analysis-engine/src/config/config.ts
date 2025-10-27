interface AppConfig {
  redisUrl: string;
  redisHost: string;
  redisPort: number;
  graphServiceUrl: string;
  githubToken?: string; // Optional, but recommended
  consumerGroupName: string;
  consumerName: string;
  analysisStreamName: string;
  dispatchStreamName: string;
}

// Basic validation function
function getEnvVar(key: string, required: boolean = true): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || ''; // Return empty string if not required and missing
}

// Parse Redis URL for host and port if provided, otherwise use defaults
let redisHost = 'localhost';
let redisPort = 6379;
const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
    try {
        const url = new URL(redisUrl);
        redisHost = url.hostname;
        redisPort = parseInt(url.port, 10);
        if (isNaN(redisPort)) redisPort = 6379; // Default port if parsing fails
    } catch (e) {
        console.warn(`Could not parse REDIS_URL "${redisUrl}". Using defaults.`);
    }
} else {
    console.warn(`REDIS_URL not set. Using defaults: host=${redisHost}, port=${redisPort}`);
}

// Generate a unique consumer name for this instance (e.g., using hostname or random id)
const consumerId = process.env.HOSTNAME || `consumer-${Math.random().toString(36).substring(7)}`;

const config: AppConfig = {
  redisUrl: redisUrl || `redis://${redisHost}:${redisPort}`, // Reconstruct or use original
  redisHost: redisHost,
  redisPort: redisPort,
  graphServiceUrl: getEnvVar('GRAPH_SERVICE_URL'), // e.g., http://localhost:4001
  githubToken: getEnvVar('GITHUB_TOKEN', false), // Load GitHub token if available
  consumerGroupName: 'analysis-group', // Name for the Redis Stream consumer group
  consumerName: `analysis-consumer-${consumerId}`, // Unique name for this specific worker instance
  analysisStreamName: 'analysis-jobs', // Stream to read jobs FROM
  dispatchStreamName: 'dispatch-jobs', // Stream to write results TO
};

// Validate critical URLs
try {
  new URL(config.graphServiceUrl);
} catch (e) {
  throw new Error(`Invalid GRAPH_SERVICE_URL: ${config.graphServiceUrl}`);
}

console.log('[Config] Loaded configuration:', {
    redisHost: config.redisHost,
    redisPort: config.redisPort,
    graphServiceUrl: config.graphServiceUrl,
    consumerName: config.consumerName,
    analysisStreamName: config.analysisStreamName,
    dispatchStreamName: config.dispatchStreamName,
});


export default config;
