/**
 * Task Orchestrator - 运行时跟踪 + 状态持久化 + 事件钩子
 * 
 * Features:
 * - 运行时跟踪: 任务执行过程的详细日志
 * - 状态持久化: 任务状态 Redis 存储
 * - 事件钩子: 任务开始/成功/失败回调
 */

const { Queue, Worker, Events } = require('bullmq');
const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const TASK_QUEUE_NAME = 'orchestrator-tasks';
const STATE_FILE = path.join(process.env.HOME || '/home/ubuntu', '.task-state.json');

// Redis connection
const connection = new Redis({ 
  host: REDIS_HOST, 
  port: REDIS_PORT,
  maxRetriesPerRequest: null
});

// Event hooks registry
const hooks = {
  onTaskStart: [],
  onTaskProgress: [],
  onTaskComplete: [],
  onTaskFail: [],
  onTaskRetry: []
};

// State persistence
class StateManager {
  constructor() {
    this.state = this.loadState();
  }
  
  loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      }
    } catch (e) {
      console.warn('[State] Load failed:', e.message);
    }
    return {};
  }
  
  saveState() {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.warn('[State] Save failed:', e.message);
    }
  }
  
  get(taskId) {
    return this.state[taskId];
  }
  
  set(taskId, data) {
    this.state[taskId] = { ...this.state[taskId], ...data, updatedAt: Date.now() };
    this.saveState();
  }
  
  delete(taskId) {
    delete this.state[taskId];
    this.saveState();
  }
  
  list() {
    return Object.entries(this.state).map(([id, data]) => ({ id, ...data }));
  }
}

const stateManager = new StateManager();

// Runtime tracking
class RuntimeTracker {
  constructor() {
    this.tracking = {};
  }
  
  start(taskId, data) {
    this.tracking[taskId] = {
      taskId,
      data,
      startedAt: Date.now(),
      progress: 0,
      logs: [],
      status: 'running'
    };
    this.log(taskId, 'TASK_START', '任务开始');
    this.triggerHook('onTaskStart', taskId, data);
  }
  
  log(taskId, level, message, meta = {}) {
    if (this.tracking[taskId]) {
      const entry = {
        timestamp: Date.now(),
        level,
        message,
        ...meta
      };
      this.tracking[taskId].logs.push(entry);
      console.log(`[Track:${taskId}] [${level}] ${message}`);
    }
  }
  
  progress(taskId, percent, message) {
    if (this.tracking[taskId]) {
      this.tracking[taskId].progress = percent;
      this.log(taskId, 'PROGRESS', message, { percent });
      this.triggerHook('onTaskProgress', taskId, { percent, message });
    }
  }
  
  complete(taskId, result) {
    if (this.tracking[taskId]) {
      this.tracking[taskId].status = 'completed';
      this.tracking[taskId].completedAt = Date.now();
      this.tracking[taskId].result = result;
      this.tracking[taskId].duration = Date.now() - this.tracking[taskId].startedAt;
      this.log(taskId, 'COMPLETE', '任务完成', { result });
      this.triggerHook('onTaskComplete', taskId, result);
      
      // Persist to Redis
      stateManager.set(taskId, this.tracking[taskId]);
    }
  }
  
  fail(taskId, error) {
    if (this.tracking[taskId]) {
      this.tracking[taskId].status = 'failed';
      this.tracking[taskId].failedAt = Date.now();
      this.tracking[taskId].error = error;
      this.tracking[taskId].duration = Date.now() - this.tracking[taskId].startedAt;
      this.log(taskId, 'ERROR', '任务失败', { error });
      this.triggerHook('onTaskFail', taskId, { error });
      
      // Persist to Redis
      stateManager.set(taskId, this.tracking[taskId]);
    }
  }
  
  retry(taskId, attempt, error) {
    if (this.tracking[taskId]) {
      this.tracking[taskId].retryAttempt = attempt;
      this.log(taskId, 'RETRY', `重试 #${attempt}`, { error });
      this.triggerHook('onTaskRetry', taskId, { attempt, error });
    }
  }
  
  get(taskId) {
    return this.tracking[taskId];
  }
  
  list() {
    return Object.values(this.tracking);
  }
  
  triggerHook(hookName, taskId, data) {
    if (hooks[hookName]) {
      hooks[hookName].forEach(cb => {
        try {
          cb(taskId, data);
        } catch (e) {
          console.error(`[Hook] ${hookName} error:`, e.message);
        }
      });
    }
  }
}

const tracker = new RuntimeTracker();

// Register hooks
function registerHook(event, callback) {
  if (hooks[event]) {
    hooks[event].push(callback);
    console.log(`[Hook] Registered: ${event}`);
  }
}

// Default hooks - log to console
registerHook('onTaskStart', (taskId, data) => {
  console.log(`📝 Task started: ${taskId}`);
});

registerHook('onTaskProgress', (taskId, { percent, message }) => {
  console.log(`⏳ Task progress: ${taskId} - ${percent}% - ${message}`);
});

registerHook('onTaskComplete', (taskId, result) => {
  console.log(`✅ Task completed: ${taskId}`);
});

registerHook('onTaskFail', (taskId, { error }) => {
  console.log(`❌ Task failed: ${taskId} - ${error}`);
});

registerHook('onTaskRetry', (taskId, { attempt, error }) => {
  console.log(`🔄 Task retry: ${taskId} - Attempt #${attempt}`);
});

// Queue setup
const queue = new Queue(TASK_QUEUE_NAME, { connection });

// Worker for processing tasks
const worker = new Worker(TASK_QUEUE_NAME, async job => {
  const { taskId, data, steps } = job.data;
  
  console.log(`[Worker] Processing task: ${taskId}`);
  tracker.start(taskId, data);
  
  try {
    if (steps && steps.length > 0) {
      // Multi-step task
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        tracker.progress(taskId, Math.round((i / steps.length) * 100), `Step ${i + 1}: ${step.name}`);
        
        // Simulate step execution
        if (step.execute) {
          await step.execute();
        }
        
        await new Promise(resolve => setTimeout(resolve, step.delay || 100));
      }
    }
    
    tracker.complete(taskId, { success: true });
    return { success: true };
  } catch (error) {
    tracker.fail(taskId, error.message);
    throw error;
  }
}, { connection });

// Events
worker.on('completed', job => {
  console.log(`[Worker] Job completed: ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.log(`[Worker] Job failed: ${job.id} - ${err.message}`);
});

worker.on('progress', (job, progress) => {
  console.log(`[Worker] Job progress: ${job.id} - ${progress}%`);
});

// API functions
async function createTask(taskId, data, steps = []) {
  const job = await queue.add('execute', { taskId, data, steps }, {
    jobId: taskId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: false,
    removeOnFail: false
  });
  
  console.log(`[Task] Created: ${taskId}`);
  return job;
}

async function getTaskStatus(taskId) {
  // Check runtime tracking first
  const runtime = tracker.get(taskId);
  if (runtime) return runtime;
  
  // Check persisted state
  const persisted = stateManager.get(taskId);
  if (persisted) return persisted;
  
  // Check BullMQ job
  const job = await queue.getJob(taskId);
  if (job) {
    return {
      id: job.id,
      status: await job.getState(),
      progress: job.progress(),
      data: job.data
    };
  }
  
  return null;
}

async function listTasks() {
  const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed']);
  return {
    queue: jobs.map(j => ({ id: j.id, status: j.status })),
    runtime: tracker.list(),
    persisted: stateManager.list()
  };
}

// CLI
const command = process.argv[2];

async function main() {
  switch (command) {
    case 'create': {
      const taskId = process.argv[3] || `task-${Date.now()}`;
      const data = process.argv[4] || 'test data';
      await createTask(taskId, { message: data });
      console.log(`Task created: ${taskId}`);
      break;
    }
    
    case 'status': {
      const taskId = process.argv[3];
      if (!taskId) {
        console.log('Usage: node task-orchestrator.js status <taskId>');
        break;
      }
      const status = await getTaskStatus(taskId);
      console.log(JSON.stringify(status, null, 2));
      break;
    }
    
    case 'list': {
      const tasks = await listTasks();
      console.log(JSON.stringify(tasks, null, 2));
      break;
    }
    
    case 'hook-test': {
      // Test hooks
      registerHook('onTaskStart', (taskId, data) => {
        console.log(`🎯 Custom hook: Task ${taskId} started!`);
      });
      const taskId = `hook-test-${Date.now()}`;
      tracker.start(taskId, { test: true });
      tracker.progress(taskId, 50, 'Halfway done');
      tracker.complete(taskId, { result: 'ok' });
      break;
    }
    
    default:
      console.log(`
Task Orchestrator - 运行时跟踪 + 状态持久化 + 事件钩子

Usage:
  node task-orchestrator.js create <taskId> <data>  - Create task
  node task-orchestrator.js status <taskId>           - Get task status
  node task-orchestrator.js list                     - List all tasks
  node task-orchestrator.js hook-test                - Test hooks
      `);
  }
}

main().catch(console.error);
