import { createClient, RedisClientType } from 'redis';
import config from './config.js';

// Define the structure of the message returned by XREADGROUP

// Define the structure of a single message
interface StreamMessage {
    id: string;
    message: { // The message payload is an object
        [key: string]: string; // Expecting { 'payload': 'json-string' }
    };
}

// Define the structure for a single stream's data
interface StreamReadData {
    name: string;
    messages: Array<StreamMessage>;
}

// The overall response is an array of stream data
type StreamReadGroupResponse = Array<StreamReadData>;

let client: RedisClientType;
let isConnected = false;

/**
 * Initializes the Redis client connection using node-redis v4.
 */
export const initRedis = async (): Promise<RedisClientType> => {
  if (client) return client;

  console.log(`[Redis] Connecting to Redis at ${config.redisHost}:${config.redisPort}...`);
  // node-redis uses a URL format for connection
  client = createClient({
    url: config.redisUrl,
    // Add socket options for reconnection if needed
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 5000) // Exponential backoff up to 5s
    }
  });

  client.on('connect', () => {
    console.log('[Redis] Client connecting...');
    isConnected = false; // Mark as potentially disconnected until ready
  });
  client.on('ready', () => {
    console.log('[Redis] Client ready and connected successfully.');
    isConnected = true;
  });
  client.on('error', (err) => {
    console.error('[Redis] Connection Error:', err);
    isConnected = false; // Mark as disconnected on error
  });
  client.on('end', () => {
    console.log('[Redis] Client connection ended.');
    isConnected = false;
  });

  try {
    await client.connect(); // Explicitly connect in v4
    // No separate ping needed, connect() handles it.
  } catch (err) {
    console.error('[Redis] Failed to connect Redis:', err);
    throw err; // Fail startup if initial connection fails
  }

  await ensureConsumerGroupExists();
  return client;
};

/**
 * Ensures the consumer group exists for the analysis job stream.
 */
const ensureConsumerGroupExists = async () => {
  if (!client) throw new Error('Redis client not initialized.');
  try {
    // node-redis v4 uses slightly different syntax for XGROUP CREATE
    await client.xGroupCreate(config.analysisStreamName, config.consumerGroupName, '0', {
        MKSTREAM: true, // Create the stream if it doesn't exist
    });
    console.log(`[Redis] Consumer group '${config.consumerGroupName}' created or already exists for stream '${config.analysisStreamName}'.`);
  } catch (err: any) {
    // BUSYGROUP error means the group already exists, which is expected and ok.
    if (err.message.includes('BUSYGROUP')) {
      console.log(`[Redis] Consumer group '${config.consumerGroupName}' already exists.`);
    } else {
      console.error('[Redis] Error ensuring consumer group exists:', err);
      throw err; // Throw unexpected errors
    }
  }
};

/**
 * Waits for and retrieves the next job message using XREADGROUP with node-redis v4.
 * @returns The job ID and payload, or null on error/timeout.
 */
export const getNextJob = async (): Promise<{ id: string; payload: any } | null> => {
    if (!client || !isConnected) {
        console.warn('[Redis] Client not connected or initialized. Waiting...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before trying again
        return null;
    }

    try {
        // node-redis v4 XREADGROUP syntax
        const response = await client.xReadGroup(
            config.consumerGroupName,
            config.consumerName,
            // Key-value object for streams: { streamName: messageId }
            { key: config.analysisStreamName, id: '>' }, // '>' means read new messages
            {
                COUNT: 1,      // Read one message at a time
                BLOCK: 0,      // Block indefinitely until a message arrives
            }
        ) as StreamReadGroupResponse | null; // Type assertion might be needed

        if (!response || response.length === 0) {
            // This case should ideally not happen with BLOCK 0, but handle defensively
            return null;
        }

        // Response structure: [{ name: 'streamName', messages: [{ id: '...', message: { key: value, ... } }] }]
        const streamData = response[0];
        if (!streamData) {
            return null;
        }
        const message = streamData.messages[0];
        if (!message) {
            return null;
        }
        const messageId = message.id;
        const messagePayloadObject = message.message; // Payload is already an object { payload: 'json' }

        if (!messagePayloadObject || !messagePayloadObject.payload) {
            console.error(`[Redis] Received invalid message format (missing payload property): ${messageId}`);
            await acknowledgeJob(messageId); // Acknowledge the bad message
            return null;
        }

        try {
            const payload = JSON.parse(messagePayloadObject.payload);
            return { id: messageId, payload };
        } catch (parseError) {
             console.error(`[Redis] Failed to parse JSON payload for message ${messageId}:`, parseError);
             await acknowledgeJob(messageId); // Acknowledge bad message
             return null;
        }

    } catch (err) {
        console.error('[Redis] Error reading from stream with XREADGROUP:', err);
        // Implement more robust error handling (e.g., check connection state)
        isConnected = await client.isOpen; // Update connection state
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before trying again
        return null;
    }
};

/**
 * Acknowledges that a job message has been successfully processed using XACK.
 * @param messageId The ID of the message to acknowledge.
 */
export const acknowledgeJob = async (messageId: string): Promise<void> => {
  if (!client || !isConnected) {
      console.error('[Redis] Cannot acknowledge job, client not connected.');
      return;
  }
  try {
    await client.xAck(config.analysisStreamName, config.consumerGroupName, messageId);
    // console.log(`[Redis] Acknowledged job ${messageId}`); // Optional: verbose logging
  } catch (err) {
    console.error(`[Redis] Error acknowledging message ${messageId}:`, err);
    // Handle potential errors (e.g., message ID already acknowledged or invalid)
  }
};

/**
 * Publishes the result of an analysis to the dispatch stream using XADD.
 * @param resultPayload The payload object containing results.
 */
export const publishDispatchJob = async (resultPayload: any): Promise<void> => {
    if (!client || !isConnected) {
        console.error('[Redis] Cannot publish dispatch job, client not connected.');
        return;
    }
    try {
        const payloadString = JSON.stringify(resultPayload);
        // XADD in node-redis: stream, id ('*' for auto-gen), message object
        const messageId = await client.xAdd(config.dispatchStreamName, '*', { payload: payloadString });
        console.log(`[Redis] Published dispatch job ${messageId} for repo ${resultPayload.repoName}`);
    } catch (err) {
        console.error('[Redis] Error publishing dispatch job:', err);
        // Handle potential errors (e.g., stream full, connection issues)
    }
};

/**
 * Closes the Redis client connection.
 */
export const closeRedis = async (): Promise<void> => {
  if (client && client.isOpen) { // Check if connected before quitting
    console.log('[Redis] Closing connection...');
    try {
        await client.quit();
        console.log('[Redis] Connection closed.');
    } catch(err) {
        console.error('[Redis] Error closing connection:', err);
    } finally {
         client = null!; // Clear reference
         isConnected = false;
    }
  } else if (client) {
      console.log('[Redis] Client was not open, no need to quit.');
       client = null!; // Clear reference
       isConnected = false;
  }
};

