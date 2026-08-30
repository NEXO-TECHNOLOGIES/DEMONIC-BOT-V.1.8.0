#!/usr/bin/env node

/**
 * DEMONIC BOT PROCESS MANAGER
 * Auto-restarts the bot if it crashes
 * Provides stability and monitoring
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BOT_SCRIPT = path.join(__dirname, 'index.js');
const MAX_CRASHES = 10;
const CRASH_WINDOW = 600000; // 10 minutes
const RESTART_DELAY = 5000;

let crashTimes = [];
let childProcess = null;
let restartCount = 0;

console.log('🚀 DEMONIC BOT PROCESS MANAGER STARTED');
console.log('📊 Monitoring bot stability and auto-restarting on crashes...\n');

function shouldRestart() {
  const now = Date.now();
  // Remove old crash times outside the window
  crashTimes = crashTimes.filter(time => now - time < CRASH_WINDOW);

  if (crashTimes.length >= MAX_CRASHES) {
    console.log(`🚨 TOO MANY CRASHES (${crashTimes.length}) IN ${CRASH_WINDOW/60000} MINUTES`);
    console.log('🛑 Pausing restarts for safety. Will resume after cooldown.');

    // Schedule a cooldown: clear crash history and resume monitoring after the window
    setTimeout(() => {
      console.log('🔁 Restart cooldown expired — resuming process manager monitoring.');
      crashTimes = [];
      restartCount = 0;
      startBot();
    }, CRASH_WINDOW);

    return false; // don't start a new child now
  }

  return true;
}

function startBot() {
  if (!shouldRestart()) return;

  console.log(`🔄 Starting DEMONIC Bot (Attempt ${restartCount + 1})...`);

  childProcess = spawn('node', [BOT_SCRIPT], {
    stdio: 'inherit',
    cwd: __dirname,
    env: { ...process.env, NODE_ENV: 'production' }
  });

  childProcess.on('exit', (code, signal) => {
    crashTimes.push(Date.now());
    restartCount++;

    if (code === 0) {
      console.log('✅ Bot exited cleanly (code 0)');
      process.exit(0);
    } else {
      console.log(`❌ Bot crashed with code ${code}, signal ${signal}`);
      console.log(`⏳ Restarting in ${RESTART_DELAY/1000} seconds...`);
      setTimeout(startBot, RESTART_DELAY);
    }
  });

  childProcess.on('error', (error) => {
    console.error('❌ Failed to start bot:', error);
    crashTimes.push(Date.now());
    restartCount++;
    console.log(`⏳ Retrying in ${RESTART_DELAY/1000} seconds...`);
    setTimeout(startBot, RESTART_DELAY);
  });
}

// Handle process manager shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Process Manager shutting down...');
  if (childProcess) {
    childProcess.kill('SIGINT');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Process Manager shutting down...');
  if (childProcess) {
    childProcess.kill('SIGTERM');
  }
  process.exit(0);
});

// Check if bot script exists
if (!fs.existsSync(BOT_SCRIPT)) {
  console.error(`❌ Bot script not found: ${BOT_SCRIPT}`);
  process.exit(1);
}

// Start the bot
startBot();