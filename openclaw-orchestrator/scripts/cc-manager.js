/**
 * CC Process Manager
 * 
 * Manages Claude Code (CC) process lifecycle:
 * - Start/Stop/Restart CC process
 * - Process health monitoring
 * - Integration with systemd
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  CC_SCRIPT: path.join(process.env.HOME || '/home/ubuntu', '.openclaw/workspace/run_cc.sh'),
  PID_FILE: path.join(process.env.HOME || '/home/ubuntu', '.cc-manager.pid'),
  LOG_FILE: path.join(process.env.HOME || '/home/ubuntu', '.cc-manager.log'),
  HEALTH_CHECK_INTERVAL: 5000, // 5 seconds
  STARTUP_TIMEOUT: 30000, // 30 seconds
};

let ccProcess = null;
let healthCheckTimer = null;
let isRunning = false;

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

// Save PID
function savePid(pid) {
  try {
    fs.writeFileSync(CONFIG.PID_FILE, pid.toString());
  } catch (e) {
    log('ERROR', `Failed to save PID: ${e.message}`);
  }
}

// Read PID
function readPid() {
  try {
    if (fs.existsSync(CONFIG.PID_FILE)) {
      return parseInt(fs.readFileSync(CONFIG.PID_FILE, 'utf8').trim(), 10);
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

// Delete PID file
function deletePid() {
  try {
    if (fs.existsSync(CONFIG.PID_FILE)) {
      fs.unlinkSync(CONFIG.PID_FILE);
    }
  } catch (e) {
    // Ignore
  }
}

// Check if process is running
function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

// Get process info
function getProcessInfo(pid) {
  return new Promise((resolve) => {
    exec(`ps -p ${pid} -o pid,ppid,state,cmd --no-headers`, (err, stdout) => {
      if (err || !stdout) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Start CC process
function start() {
  return new Promise((resolve, reject) => {
    const pid = readPid();
    
    if (pid && isProcessRunning(pid)) {
      log('INFO', `CC process already running with PID ${pid}`);
      isRunning = true;
      startHealthCheck();
      resolve({ status: 'running', pid });
      return;
    }

    log('INFO', 'Starting CC process...');

    // Ensure script exists
    if (!fs.existsSync(CONFIG.CC_SCRIPT)) {
      log('ERROR', `CC script not found: ${CONFIG.CC_SCRIPT}`);
      reject(new Error(`CC script not found: ${CONFIG.CC_SCRIPT}`));
      return;
    }

    ccProcess = spawn('bash', [CONFIG.CC_SCRIPT, 'echo "CC manager started"'], {
      env: {
        ...process.env,
        http_proxy: '',
        https_proxy: '',
        HTTP_PROXY: '',
        HTTPS_PROXY: ''
      },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const startupTimeout = setTimeout(() => {
      log('WARN', 'CC process startup timeout, marking as running');
      isRunning = true;
      savePid(ccProcess.pid);
      startHealthCheck();
      resolve({ status: 'started', pid: ccProcess.pid });
    }, CONFIG.STARTUP_TIMEOUT);

    ccProcess.stdout.on('data', (data) => {
      log('CC_OUT', data.toString().trim());
    });

    ccProcess.stderr.on('data', (data) => {
      log('CC_ERR', data.toString().trim());
    });

    ccProcess.on('spawn', () => {
      clearTimeout(startupTimeout);
      log('INFO', `CC process spawned with PID ${ccProcess.pid}`);
      savePid(ccProcess.pid);
      isRunning = true;
      startHealthCheck();
      resolve({ status: 'started', pid: ccProcess.pid });
    });

    ccProcess.on('error', (err) => {
      clearTimeout(startupTimeout);
      log('ERROR', `CC process error: ${err.message}`);
      isRunning = false;
      reject(err);
    });

    ccProcess.on('exit', (code, signal) => {
      log('INFO', `CC process exited with code ${code}, signal ${signal}`);
      isRunning = false;
      deletePid();
      stopHealthCheck();
    });
  });
}

// Stop CC process
function stop() {
  return new Promise((resolve) => {
    const pid = readPid();
    
    if (!pid || !isProcessRunning(pid)) {
      log('INFO', 'CC process not running');
      deletePid();
      isRunning = false;
      resolve({ status: 'stopped' });
      return;
    }

    log('INFO', `Stopping CC process (PID ${pid})...`);

    try {
      process.kill(pid, 'SIGTERM');
      
      // Wait for process to terminate
      let attempts = 0;
      const checkInterval = setInterval(() => {
        attempts++;
        if (!isProcessRunning(pid) || attempts > 30) {
          clearInterval(checkInterval);
          if (isProcessRunning(pid)) {
            log('WARN', 'Force killing CC process');
            process.kill(pid, 'SIGKILL');
          }
          deletePid();
          isRunning = false;
          log('INFO', 'CC process stopped');
          resolve({ status: 'stopped' });
        }
      }, 100);
    } catch (e) {
      log('ERROR', `Failed to stop CC process: ${e.message}`);
      deletePid();
      isRunning = false;
      resolve({ status: 'error', message: e.message });
    }
  });
}

// Restart CC process
async function restart() {
  log('INFO', 'Restarting CC process...');
  await stop();
  // Wait a bit before restarting
  await new Promise(r => setTimeout(r, 1000));
  return start();
}

// Health check
async function checkHealth() {
  const pid = readPid();
  
  if (!pid) {
    return { healthy: false, reason: 'No PID file' };
  }

  if (!isProcessRunning(pid)) {
    return { healthy: false, reason: 'Process not running', pid };
  }

  const info = await getProcessInfo(pid);
  if (!info) {
    return { healthy: false, reason: 'Cannot get process info', pid };
  }

  return { healthy: true, pid, info };
}

// Start health check timer
function startHealthCheck() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
  }
  
  healthCheckTimer = setInterval(async () => {
    const health = await checkHealth();
    if (!health.healthy) {
      log('WARN', `Health check failed: ${health.reason}`);
      // Auto-restart if process died
      if (health.reason === 'Process not running') {
        log('INFO', 'Attempting auto-restart...');
        start().catch(e => log('ERROR', `Auto-restart failed: ${e.message}`));
      }
    }
  }, CONFIG.HEALTH_CHECK_INTERVAL);
}

// Stop health check timer
function stopHealthCheck() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

// Get status
async function status() {
  const pid = readPid();
  const running = pid ? isProcessRunning(pid) : false;
  const health = running ? await checkHealth() : { healthy: false, reason: 'Not running' };
  
  return {
    running,
    pid,
    healthy: health.healthy,
    healthInfo: health
  };
}

// systemd integration
function getSystemdStatus() {
  return new Promise((resolve) => {
    exec('systemctl is-active openclaw-cc', (err, stdout) => {
      if (err) {
        resolve({ active: false, unit: 'openclaw-cc', error: err.message });
      } else {
        resolve({ active: stdout.trim() === 'active', unit: 'openclaw-cc' });
      }
    });
  });
}

// Export functions
module.exports = {
  start,
  stop,
  restart,
  status,
  checkHealth,
  getSystemdStatus,
  isRunning: () => isRunning
};

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  async function run() {
    switch (command) {
      case 'start': {
        const result = await start();
        console.log('Start result:', JSON.stringify(result, null, 2));
        break;
      }
      case 'stop': {
        const result = await stop();
        console.log('Stop result:', JSON.stringify(result, null, 2));
        break;
      }
      case 'restart': {
        const result = await restart();
        console.log('Restart result:', JSON.stringify(result, null, 2));
        break;
      }
      case 'status': {
        const result = await status();
        console.log('Status:', JSON.stringify(result, null, 2));
        break;
      }
      case 'health': {
        const result = await checkHealth();
        console.log('Health:', JSON.stringify(result, null, 2));
        break;
      }
      default:
        console.log('Usage: node cc-manager.js <command>');
        console.log('Commands: start, stop, restart, status, health');
    }
    process.exit(0);
  }

  run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
}
