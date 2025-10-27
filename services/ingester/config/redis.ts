import { createClient, RedisClientType } from 'redis';
import config from './config'

let client: RedisClientType;
let isConnected = false;

/**
 * Initializes the Redis client connection.
 */
export const initRedis = async (): Promise<RedisClientType> => {
  if (client) return client;

  console.log('[Redis] Connecting...');
  client = createClient({
    url: config.redisUrl,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 5000)
    }
  });

  client.on('connect', () => { console.log('[Redis] Client connecting...'); isConnected = false; });
  client.on('ready', () => { console.log('[Redis] Client ready and connected.'); isConnected = true; });
  client.on('error', (err) => { console.error('[Redis] Connection Error:', err); isConnected = false; });
  client.on('end', () => { console.log('[Redis] Client connection ended.'); isConnected = false; });

  try {
    await client.connect();
  } catch (err) {
    console.error('[Redis] Failed to connect Redis:', err);
    throw err;
  }
  return client;
};

/**
 * Publishes an analysis job payload to the designated Redis Stream.
 * @param jobPayload The job data object (e.g., { repoUrl, sha, ... }).
 * @returns The message ID assigned by Redis.
 * @throws If Redis client is not connected or if XADD fails.
 */
export const publishAnalysisJob = async (jobPayload: object): Promise<string> => {
    if (!client || !isConnected) {
        throw new Error('[Redis] Cannot publish job, client not connected.');
    }
    try {
        const payloadString = JSON.stringify(jobPayload);
        // Add the job to the stream. '*' lets Redis generate the ID.
        // We store the entire payload under the key 'payload'.
        const messageId = await client.xAdd(config.analysisStreamName, '*', { payload: payloadString });
        console.log(`[Redis] Published analysis job ${messageId} to stream '${config.analysisStreamName}'.`);
        return messageId;
    } catch (err) {
        console.error('[Redis] Error publishing analysis job:', err);
        throw err; // Re-throw the error to be handled by the controller
    }
};

/**
 * Closes the Redis client connection gracefully.
 */
export const closeRedis = async (): Promise<void> => {
  if (client && client.isOpen) {
    console.log('[Redis] Closing connection...');
    try {
        await client.quit();
        console.log('[Redis] Connection closed.');
    } catch(err) {
        console.error('[Redis] Error closing connection:', err);
    } finally {
         client = null!;
         isConnected = false;
    }
  } else if (client) {
      console.log('[Redis] Client was not open, no need to quit.');
       client = null!;
       isConnected = false;
  }
};