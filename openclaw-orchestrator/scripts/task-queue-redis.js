/**
 * Task Queue with Redis (BullMQ) + File Queue Fallback
 * 
 * Features:
 * - Task enqueue/dequeue using BullMQ
 * - Automatic fallback to file-based queue when Redis is unavailable
 */

const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

const FILE_QUEUE_DIR = path.join(process.env.HOME || '/home/ubuntu', '.task-queue');
const FILE_QUEUE_PATH = path.join(FILE_QUEUE_DIR, 'queue.json');
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

// Ensure file queue directory exists
if (!fs.existsSync(FILE_QUEUE_DIR)) {
  fs.mkdirSync(FILE_QUEUE_DIR, { recursive: true });
}

// Initialize Redis connection
let redis = null;
let queue = null;
let useRedis = false;

// Initialize Redis connection
async function initRedis() {
  try {
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          console.log('[Redis] Connection failed, will use file queue fallback');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true
    });

    await redis.connect();
    useRedis = true;
    console.log('[Redis] Connected successfully');
    return true;
  } catch (error) {
    console.log('[Redis] Failed to connect:', error.message);
    useRedis = false;
    return false;
  }
}

// Check Redis availability
async function checkRedis() {
  if (!redis) return false;
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

// File-based queue operations
function readFileQueue() {
  try {
    if (fs.existsSync(FILE_QUEUE_PATH)) {
      const data = fs.readFileSync(FILE_QUEUE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[FileQueue] Read error:', error.message);
  }
  return [];
}

function writeFileQueue(queueData) {
  try {
    fs.writeFileSync(FILE_QUEUE_PATH, JSON.stringify(queueData, null, 2));
  } catch (error) {
    console.error('[FileQueue] Write error:', error.message);
  }
}

function fileEnqueue(task) {
  const queue = readFileQueue();
  const taskWithId = {
    id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...task,
    queuedAt: new Date().toISOString(),
    source: 'file'
  };
  queue.push(taskWithId);
  writeFileQueue(queue);
  console.log(`[FileQueue] Task enqueued: ${taskWithId.id}`);
  return taskWithId;
}

function fileDequeue() {
  const queue = readFileQueue();
  if (queue.length === 0) return null;
  
  const task = queue.shift();
  writeFileQueue(queue);
  console.log(`[FileQueue] Task dequeued: ${task.id}`);
  return task;
}

function filePeek() {
  const queue = readFileQueue();
  return queue.length > 0 ? queue[0] : null;
}

// Redis-based queue operations
function redisEnqueue(task) {
  if (!queue) {
    queue = new Queue('openclaw-tasks', {
      connection: redis
    });
  }
  
  const taskWithId = {
    ...task,
    queuedAt: new Date().toISOString(),
    source: 'redis'
  };
  
  queue.add(task.name || 'default', taskWithData);
  console.log(`[RedisQueue] Task enqueued: ${task.name}`);
  return taskWithId;
}

async function redisDequeue() {
  if (!queue) {
    queue = new Queue('openclaw-tasks', {
      connection: redis
    });
  }
  
  // Get next waiting job
  const job = await queue.getWaiting()[0];
  if (job) {
    await job.remove();
    console.log(`[RedisQueue] Task dequeued: ${job.id}`);
    return job.data;
  }
  return null;
}

// Unified interface
async function enqueue(task) {
  const redisAvailable = await checkRedis();
  
  if (redisAvailable && useRedis) {
    try {
      if (!queue) {
        queue = new Queue('openclaw-tasks', { connection: redis });
      }
      const taskData = {
        ...task,
        queuedAt: new Date().toISOString(),
        source: 'redis'
      };
      const job = await queue.add(task.name || 'default', taskData);
      console.log(`[Queue] Task enqueued (Redis): ${job.id}`);
      return { id: job.id, ...taskData };
    } catch (error) {
      console.error('[Queue] Redis enqueue failed:', error.message);
      // Fall through to file queue
    }
  }
  
  // Fallback to file queue
  console.log('[Queue] Using file queue fallback');
  return fileEnqueue(task);
}

async function dequeue() {
  const redisAvailable = await checkRedis();
  
  if (redisAvailable && useRedis) {
    try {
      if (!queue) {
        queue = new Queue('openclaw-tasks', { connection: redis });
      }
      
      const jobs = await queue.getWaiting();
      if (jobs.length > 0) {
        const job = jobs[0];
        const data = job.data;
        await job.remove();
        console.log(`[Queue] Task dequeued (Redis): ${job.id}`);
        return { id: job.id, ...data };
      }
    } catch (error) {
      console.error('[Queue] Redis dequeue failed:', error.message);
      // Fall through to file queue
    }
  }
  
  // Fallback to file queue
  console.log('[Queue] Using file queue fallback');
  return fileDequeue();
}

async function peek() {
  const redisAvailable = await checkRedis();
  
  if (redisAvailable && useRedis) {
    try {
      if (!queue) {
        queue = new Queue('openclaw-tasks', { connection: redis });
      }
      
      const jobs = await queue.getWaiting();
      if (jobs.length > 0) {
        return { id: jobs[0].id, ...jobs[0].data };
      }
    } catch (error) {
      console.error('[Queue] Redis peek failed:', error.message);
    }
  }
  
  return filePeek();
}

async function getStats() {
  const stats = {
    redis: { available: false, waiting: 0 },
    file: { waiting: 0 }
  };
  
  const redisAvailable = await checkRedis();
  stats.redis.available = redisAvailable;
  
  if (redisAvailable && useRedis) {
    try {
      if (!queue) {
        queue = new Queue('openclaw-tasks', { connection: redis });
      }
      stats.redis.waiting = await queue.getWaitingCount();
    } catch (error) {
      console.error('[Queue] Redis stats failed:', error.message);
    }
  }
  
  const fileQueue = readFileQueue();
  stats.file.waiting = fileQueue.length;
  
  return stats;
}

// Initialize on module load
async function init() {
  console.log('[TaskQueue] Initializing...');
  await initRedis();
  console.log('[TaskQueue] Ready');
  console.log(`[TaskQueue] Using: ${useRedis ? 'Redis' : 'File Queue'}`);
}

// Export functions
module.exports = {
  init,
  enqueue,
  dequeue,
  peek,
  getStats,
  checkRedis
};

// CLI for testing
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  async function run() {
    await init();
    
    switch (command) {
      case 'enqueue': {
        const task = { name: args[1] || 'test-task', data: { message: args[2] || 'Hello' } };
        const result = await enqueue(task);
        console.log('Enqueued:', result);
        break;
      }
      case 'dequeue': {
        const task = await dequeue();
        console.log('Dequeued:', task);
        break;
      }
      case 'peek': {
        const task = await peek();
        console.log('Next task:', task);
        break;
      }
      case 'stats': {
        const stats = await getStats();
        console.log('Stats:', JSON.stringify(stats, null, 2));
        break;
      }
      case 'test-fallback': {
        console.log('--- Testing normal operation ---');
        await enqueue({ name: 'fallback-test', data: { test: true } });
        const stats1 = await getStats();
        console.log('Stats after enqueue:', JSON.stringify(stats1, null, 2));
        
        const task = await dequeue();
        console.log('Dequeued:', task);
        
        const stats2 = await getStats();
        console.log('Stats after dequeue:', JSON.stringify(stats2, null, 2));
        
        console.log('--- Test complete ---');
        break;
      }
      default:
        console.log('Usage: node task-queue-redis.js <command> [args]');
        console.log('Commands: enqueue [name] [data], dequeue, peek, stats, test-fallback');
    }
    
    // Cleanup
    if (redis) {
      await redis.quit();
    }
    process.exit(0);
  }
  
  run().catch(console.error);
}
