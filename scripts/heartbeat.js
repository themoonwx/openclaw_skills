/**
 * Heartbeat Service for OpenClaw CC
 * 
 * Features:
 * - 10-second interval heartbeat
 * - CC process liveness detection (30-second threshold)
 * - Auto-restart on failure
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  HEARTBEAT_INTERVAL: 10000, // 10 seconds
  CC_LIVENESS_TIMEOUT: 30000, // 30 seconds
  HEARTBEAT_FILE: path.join(process.env.HOME || '/home/ubuntu', '.cc-heartbeat.json'),
  LOG_FILE: path.join(process.env.HOME || '/home/ubuntu', '.cc-heartbeat.log'),
  CC_SCRIPT: path.join(process.env.HOME || '/home/ubuntu', '.openclaw/workspace/run_cc.sh'),
  MAX_RESTART_ATTEMPTS: 3,
  RESTART_COOLDOWN: 60000, // 60 seconds between restarts
};

let heartbeatTimer = null;
let lastHeartbeat = null;
let restartAttempts = 0;
let lastRestartTime = 0;

// Logging
function log(level, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);
  
  try {
    fs.appendFileSync(CONFIG.LOG_FILE, logMessage + '\n');
  } catch (e) {
    // Ignore logging errors
  }
}

// Save heartbeat state
function saveHeartbeat(data) {
  try {
    fs.writeFileSync(CONFIG.HEARTBEAT_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    log('ERROR', `Failed to save heartbeat: ${e.message}`);
  }
}

// Read heartbeat state
function readHeartbeat() {
  try {
    if (fs.existsSync(CONFIG.HEARTBEAT_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG.HEARTBEAT_FILE, 'utf8'));
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

// Check if CC process is alive
function isCCAlive() {
  return new Promise((resolve) => {
    // Check for running CC process
    exec('pgrep -f "run_cc.sh" | head -1', (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(false);
        return;
      }
      
      const pid = parseInt(stdout.trim(), 10);
      if (!pid || isNaN(pid)) {
        resolve(false);
        return;
      }
      
      // Check if process is actually running
      try {
        process.kill(pid, 0);
        resolve(true);
      } catch (e) {
        resolve(false);
      }
    });
  });
}

// Get CC process info
function getCCInfo() {
  return new Promise((resolve) => {
    exec('pgrep -f "run_cc.sh" -a | head -1', (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Start CC process
function startCC() {
  return new Promise((resolve, reject) => {
    log('INFO', 'Starting CC process...');
    
    const proc = spawn('bash', [CONFIG.CC_SCRIPT, 'echo "Heartbeat started CC"'], {
      env: {
        ...process.env,
        http_proxy: '',
        https_proxy: '',
        HTTP_PROXY: '',
        HTTPS_PROXY: ''
      },
      detached: true,
      stdio: 'ignore'
    });
    
    proc.unref();
    
    // Wait a bit then check
    setTimeout(async () => {
      const alive = await isCCAlive();
      if (alive) {
        log('INFO', 'CC process started successfully');
        resolve(true);
      } else {
        log('WARN', 'CC process may not have started');
        resolve(false);
      }
    }, 3000);
  });
}

// Restart CC process
async function restartCC() {
  const now = Date.now();
  
  // Check cooldown
  if (now - lastRestartTime < CONFIG.RESTART_COOLDOWN) {
    log('WARN', 'Restart cooldown active, skipping');
    return false;
  }
  
  if (restartAttempts >= CONFIG.MAX_RESTART_ATTEMPTS) {
    log('ERROR', 'Max restart attempts reached');
    return false;
  }
  
  restartAttempts++;
  lastRestartTime = now;
  
  log('INFO', `Restarting CC (attempt ${restartAttempts}/${CONFIG.MAX_RESTART_ATTEMPTS})...`);
  
  // Stop existing
  await new Promise((resolve) => {
    exec('pkill -f "run_cc.sh"', () => {
      resolve();
    });
  });
  
  // Wait a bit
  await new Promise(r => setTimeout(r, 2000));
  
  // Start new
  const started = await startCC();
  
  if (started) {
    restartAttempts = 0; // Reset on success
  }
  
  return started;
}

// Heartbeat check
async function performHeartbeat() {
  const now = Date.now();
  const state = readHeartbeat() || { lastHeartbeat: null, ccAlive: false };
  
  log('DEBUG', 'Performing heartbeat check...');
  
  // Check CC liveness
  const ccAlive = await isCCAlive();
  const ccInfo = await getCCInfo();
  
  const heartbeatData = {
    timestamp: now,
    lastHeartbeat: state.lastHeartbeat,
    ccAlive,
    ccInfo,
    restartAttempts,
    uptime: state.lastHeartbeat ? now - state.lastHeartbeat : null
  };
  
  saveHeartbeat(heartbeatData);
  lastHeartbeat = now;
  
  // Check liveness timeout
  if (state.lastHeartbeat && (now - state.lastHeartbeat > CONFIG.CC_LIVENESS_TIMEOUT)) {
    log('WARN', `CC liveness timeout detected (${Math.floor((now - state.lastHeartbeat) / 1000)}s)`);
    
    // Attempt restart
    const restarted = await restartCC();
    if (restarted) {
      log('INFO', 'CC auto-restarted successfully');
    } else {
      log('ERROR', 'CC auto-restart failed');
    }
  } else if (!ccAlive) {
    log('WARN', 'CC process not running, attempting start...');
    await startCC();
  } else {
    log('DEBUG', `CC alive: ${ccInfo}`);
  }
  
  return heartbeatData;
}

// Start heartbeat service
function start() {
  log('INFO', 'Starting Heartbeat Service...');
  log('INFO', `Heartbeat interval: ${CONFIG.HEARTBEAT_INTERVAL}ms`);
  log('INFO', `CC liveness timeout: ${CONFIG.CC_LIVENESS_TIMEOUT}ms`);
  
  // Initial heartbeat
  performHeartbeat();
  
  // Schedule regular heartbeats
  heartbeatTimer = setInterval(performHeartbeat, CONFIG.HEARTBEAT_INTERVAL);
  
  log('INFO', 'Heartbeat Service started');
}

// Stop heartbeat service
function stop() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  log('INFO', 'Heartbeat Service stopped');
}

// Get status
async function status() {
  const state = readHeartbeat();
  const ccAlive = await isCCAlive();
  const ccInfo = await getCCInfo();
  
  // Check if heartbeat process is actually running
  const isRunning = await new Promise((resolve) => {
    exec('pgrep -f "heartbeat.js start"', (err, stdout) => {
      resolve(!!stdout.trim());
    });
  });
  
  return {
    running: isRunning,
    lastHeartbeat: state?.lastHeartbeat,
    ccAlive,
    ccInfo,
    restartAttempts,
    uptime: state?.lastHeartbeat ? Date.now() - state.lastHeartbeat : null
  };
}

// Export
module.exports = {
  start,
  stop,
  status,
  performHeartbeat
};

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  async function run() {
    switch (command) {
      case 'start': {
        start();
        console.log('Heartbeat service started');
        break;
      }
      case 'stop': {
        stop();
        console.log('Heartbeat service stopped');
        break;
      }
      case 'status': {
        const result = await status();
        console.log('Status:', JSON.stringify(result, null, 2));
        break;
      }
      case 'once': {
        const result = await performHeartbeat();
        console.log('Heartbeat:', JSON.stringify(result, null, 2));
        break;
      }
      default:
        console.log('Usage: node heartbeat.js <command>');
        console.log('Commands: start, stop, status, once');
    }
    
    if (command !== 'start') {
      setTimeout(() => process.exit(0), 1000);
    }
  }

  run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
}
