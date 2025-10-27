interface IngesterConfig {
  port: number;
  redisUrl: string;
  ingesterSecret: string;
  analysisStreamName: string;
}

// Helper to get ENV vars, throwing if required ones are missing
function getEnvVar(key: string, required: boolean = true, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (required && !value) {
    throw new Error(`[Config] Missing required environment variable: ${key}`);
  }
  return value || '';
}

const config: IngesterConfig = {
  port: parseInt(getEnvVar('WEBHOOK_INGESTER_PORT', false, '4002'), 10),
  redisUrl: getEnvVar('REDIS_URL'),
  ingesterSecret: getEnvVar('INGESTER_SECRET'),
  // Name of the Redis Stream to publish jobs TO
  analysisStreamName: getEnvVar('ANALYSIS_STREAM_NAME', false, 'analysis-jobs'),
};

// Basic validation for the port
if (isNaN(config.port)) {
    throw new Error(`[Config] Invalid WEBHOOK_INGESTER_PORT: ${process.env.WEBHOOK_INGESTER_PORT}`);
}

// Basic validation for Redis URL (more thorough parsing could be added)
if (!config.redisUrl.startsWith('redis://')) {
    console.warn(`[Config] REDIS_URL "${config.redisUrl}" might be invalid. Ensure it starts with redis://`);
}

console.log('[Config] Webhook Ingester configuration loaded:', {
    port: config.port,
    redisUrl: config.redisUrl ? '******' : 'Not Set (Using Default)', // Avoid logging full URL if it contains password
    ingesterSecret: config.ingesterSecret ? '******' : 'Not Set!', // Avoid logging secret
    analysisStreamName: config.analysisStreamName,
});

export default config;
