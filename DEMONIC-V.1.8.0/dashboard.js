/**
 * =====================================================================
 * 🤖 DEMONIC BOT — LOCALHOST WEB ADMIN DASHBOARD
 * Modern, responsive control panel for monitoring and managing the bot
 * =====================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

function createDashboardServer(context) {
  const PORT = process.env.PORT || process.env.ADMIN_PORT || process.env.HEALTH_PORT || 3000;

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname;
    const method = req.method;

    // Helper for JSON responses
    const json = (data, status = 200) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end(JSON.stringify(data));
    };

    // Helper for parsing request body
    const parseBody = () => new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          resolve({});
        }
      });
      req.on('error', reject);
    });

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    try {
      // 1. Health check endpoint (compatible with probes / monitors)
      if (pathname === '/health') {
        const stats = context.getStats ? context.getStats() : {};
        return json({
          status: 'ok',
          uptime: process.uptime(),
          pid: process.pid,
          socket: stats.socketStatus || 'unknown',
          timestamp: Date.now()
        });
      }

      // 2. API - Live Stats
      if (pathname === '/api/stats' && method === 'GET') {
        const stats = context.getStats ? context.getStats() : {};
        return json({ success: true, data: stats });
      }

      // 3. API - Toggles Get/Set
      if (pathname === '/api/toggles' && method === 'GET') {
        const toggles = context.getToggles ? context.getToggles() : {};
        return json({ success: true, data: toggles });
      }

      if (pathname === '/api/toggles' && method === 'POST') {
        const body = await parseBody();
        if (typeof body.key === 'string' && body.value !== undefined) {
          const updated = context.setToggle ? context.setToggle(body.key, body.value) : false;
          return json({ success: true, updated, key: body.key, value: body.value });
        }
        return json({ success: false, error: 'Invalid payload' }, 400);
      }

      // 4. API - Config & API Keys
      if (pathname === '/api/config' && method === 'GET') {
        const config = context.getConfig ? context.getConfig() : {};
        return json({ success: true, data: config });
      }

      if (pathname === '/api/config' && method === 'POST') {
        const body = await parseBody();
        if (context.updateConfig) {
          const result = context.updateConfig(body);
          return json({ success: true, message: 'Configuration saved successfully', result });
        }
        return json({ success: false, error: 'Config update handler missing' }, 500);
      }

      // 5. API - Groups & Broadcast
      if (pathname === '/api/groups' && method === 'GET') {
        const groups = context.getGroups ? await context.getGroups() : [];
        return json({ success: true, data: groups });
      }

      if (pathname === '/api/broadcast' && method === 'POST') {
        const body = await parseBody();
        if (!body.message || !body.message.trim()) {
          return json({ success: false, error: 'Message cannot be empty' }, 400);
        }
        if (context.broadcastMessage) {
          const res = await context.broadcastMessage(body.message.trim());
          return json({ success: true, ...res });
        }
        return json({ success: false, error: 'Broadcast not supported' }, 500);
      }

      // 6. API - Logs
      if (pathname === '/api/logs' && method === 'GET') {
        const type = reqUrl.searchParams.get('type') || 'activity';
        const logs = context.getLogs ? context.getLogs(type) : [];
        return json({ success: true, data: logs });
      }

      // 7. API - Maintenance (Cleanup & Restart)
      if (pathname === '/api/cleanup' && method === 'POST') {
        if (context.runCleanup) {
          const result = context.runCleanup();
          return json({ success: true, message: 'Cleanup completed', data: result });
        }
        return json({ success: false, error: 'Cleanup handler missing' }, 500);
      }

      if (pathname === '/api/restart' && method === 'POST') {
        setTimeout(() => {
          process.exit(0);
        }, 1000);
        return json({ success: true, message: 'Bot restart initiated...' });
      }

      // 8. Main Dashboard HTML UI
      if (pathname === '/' || pathname === '/index.html' || pathname === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderDashboardHtml());
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\x1b[36m🌐 DEMONIC Web Admin Panel running at:\x1b[0m \x1b[32m\x1b[1mhttp://localhost:${PORT}\x1b[0m`);
  });

  server.on('error', (e) => {
    console.error(`⚠️ Web Admin Dashboard server error: ${e.message}`);
  });

  return server;
}

function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DEMONIC Bot — Admin Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0c10;
      --card-bg: #141721;
      --card-border: #1f2438;
      --primary: #ff334b;
      --primary-glow: rgba(255, 51, 75, 0.35);
      --cyan: #00f2fe;
      --cyan-glow: rgba(0, 242, 254, 0.3);
      --green: #10b981;
      --yellow: #f59e0b;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --radius: 14px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; padding: 24px 20px 60px; }

    .container { max-width: 1240px; margin: 0 auto; }

    /* Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      margin-bottom: 28px;
      border-bottom: 1px solid var(--card-border);
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-logo {
      width: 46px; height: 46px; border-radius: 12px;
      background: linear-gradient(135deg, var(--primary), #800020);
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; box-shadow: 0 0 20px var(--primary-glow);
    }
    .brand-title h1 { font-size: 22px; font-weight: 900; letter-spacing: 0.5px; }
    .brand-title span { color: var(--primary); }
    .brand-badge {
      font-size: 11px; font-weight: 700; background: rgba(255,51,75,0.15);
      color: var(--primary); padding: 2px 8px; border-radius: 6px; margin-left: 8px;
    }

    .header-actions { display: flex; align-items: center; gap: 12px; }
    .status-pill {
      display: flex; align-items: center; gap: 8px; font-size: 13px;
      font-weight: 600; padding: 8px 16px; border-radius: 20px;
      background: var(--card-bg); border: 1px solid var(--card-border);
    }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--green); box-shadow: 0 0 10px var(--green); }
    .status-dot.offline { background: var(--primary); box-shadow: 0 0 10px var(--primary); }

    .btn {
      background: var(--card-bg); color: var(--text); border: 1px solid var(--card-border);
      padding: 9px 18px; border-radius: 10px; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px;
    }
    .btn:hover { border-color: var(--cyan); box-shadow: 0 0 12px var(--cyan-glow); }
    .btn-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
    .btn-primary:hover { opacity: 0.9; box-shadow: 0 0 15px var(--primary-glow); }
    .btn-danger { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); color: #ef4444; }
    .btn-danger:hover { background: #ef4444; color: #fff; }

    /* Nav Tabs */
    .tabs { display: flex; gap: 10px; margin-bottom: 24px; border-bottom: 1px solid var(--card-border); padding-bottom: 12px; overflow-x: auto; }
    .tab-btn {
      background: transparent; color: var(--text-muted); border: none; font-size: 14px;
      font-weight: 600; padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: 0.2s;
    }
    .tab-btn.active, .tab-btn:hover { background: var(--card-bg); color: var(--text); }
    .tab-btn.active { color: var(--cyan); border-bottom: 2px solid var(--cyan); border-radius: 8px 8px 0 0; }

    /* Stat Cards Grid */
    .grid-stats {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px; margin-bottom: 28px;
    }
    .stat-card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: var(--radius); padding: 20px; position: relative; overflow: hidden;
    }
    .stat-card::after {
      content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
      background: var(--cyan);
    }
    .stat-card.accent-red::after { background: var(--primary); }
    .stat-card.accent-green::after { background: var(--green); }
    .stat-card.accent-yellow::after { background: var(--yellow); }

    .stat-label { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }
    .stat-value { font-size: 26px; font-weight: 900; margin: 8px 0 4px; }
    .stat-sub { font-size: 12px; color: var(--text-muted); }

    /* Section Cards */
    .card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: var(--radius); padding: 24px; margin-bottom: 24px;
    }
    .card-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--card-border);
    }
    .card-title { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; }

    /* Toggles Grid */
    .grid-toggles {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px;
    }
    .toggle-item {
      background: rgba(255,255,255,0.02); border: 1px solid var(--card-border);
      border-radius: 10px; padding: 14px 16px; display: flex; justify-content: space-between;
      align-items: center; transition: all 0.2s;
    }
    .toggle-item:hover { border-color: rgba(255,255,255,0.15); }
    .toggle-info h4 { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
    .toggle-info p { font-size: 11px; color: var(--text-muted); }

    /* Modern Switch */
    .switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #2b3040; transition: .3s; border-radius: 24px;
    }
    .slider:before {
      position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
      background-color: white; transition: .3s; border-radius: 50%;
    }
    input:checked + .slider { background-color: var(--green); box-shadow: 0 0 10px rgba(16,185,129,0.4); }
    input:checked + .slider:before { transform: translateX(20px); }

    /* Form Fields */
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text); }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%; background: #0c0e14; border: 1px solid var(--card-border);
      color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 13px; outline: none;
      transition: border 0.2s;
    }
    .form-group input:focus, .form-group textarea:focus { border-color: var(--cyan); }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

    /* Logs Terminal */
    .terminal {
      background: #06070a; border: 1px solid #1a1d27; border-radius: 10px;
      padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 12px;
      height: 320px; overflow-y: auto; color: #a0aec0; line-height: 1.6;
    }
    .terminal-line { margin-bottom: 4px; word-break: break-all; }
    .terminal-line.error { color: #f87171; }
    .terminal-line.warn { color: #fbbf24; }
    .terminal-line.info { color: #60a5fa; }
    .terminal-line.success { color: #34d399; }

    /* Toast */
    #toast {
      position: fixed; bottom: 24px; right: 24px; background: var(--card-bg);
      border: 1px solid var(--card-border); color: #fff; padding: 12px 20px;
      border-radius: 10px; font-size: 13px; font-weight: 600; display: none;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 999;
    }

    @media (max-width: 768px) {
      .form-row { grid-template-columns: 1fr; }
      .grid-toggles { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header>
      <div class="brand">
        <div class="brand-logo">👹</div>
        <div class="brand-title">
          <h1>DEMONIC <span>CONTROL PANEL</span> <span class="brand-badge" id="versionBadge">v1.9.5</span></h1>
        </div>
      </div>
      <div class="header-actions">
        <div class="status-pill">
          <div class="status-dot" id="statusDot"></div>
          <span id="statusText">Connecting...</span>
        </div>
        <button class="btn btn-danger" onclick="triggerRestart()">🔄 Restart</button>
        <button class="btn" onclick="triggerCleanup()">🧹 Cleanup</button>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('overview')">📊 Overview & Toggles</button>
      <button class="tab-btn" onclick="switchTab('config')">🔑 API Keys & Settings</button>
      <button class="tab-btn" onclick="switchTab('broadcast')">📢 Group Broadcast</button>
      <button class="tab-btn" onclick="switchTab('logs')">📜 Live Logs</button>
    </div>

    <!-- TAB 1: OVERVIEW & TOGGLES -->
    <div id="tab-overview">
      <div class="grid-stats">
        <div class="stat-card">
          <div class="stat-label">Bot Uptime</div>
          <div class="stat-value" id="uptimeVal">--</div>
          <div class="stat-sub" id="timeVal">Local Time: --</div>
        </div>
        <div class="stat-card accent-red">
          <div class="stat-label">Memory in Use</div>
          <div class="stat-value" id="ramVal">-- MB</div>
          <div class="stat-sub" id="rssVal">RSS: -- MB</div>
        </div>
        <div class="stat-card accent-green">
          <div class="stat-label">Messages Handled</div>
          <div class="stat-value" id="msgCountVal">0</div>
          <div class="stat-sub" id="cmdCountVal">Commands run: 0</div>
        </div>
        <div class="stat-card accent-yellow">
          <div class="stat-label">Active Tasks</div>
          <div class="stat-value" id="activeTasksVal">0 / 10</div>
          <div class="stat-sub" id="modeVal">Mode: PUBLIC</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">⚡ Instant Feature Toggles</div>
          <span style="font-size:12px; color:var(--text-muted);">Changes take effect instantly and persist to config</span>
        </div>
        <div class="grid-toggles" id="togglesContainer">
          <!-- Populated dynamically via JS -->
          <div style="color:var(--text-muted); font-size:13px;">Loading toggles...</div>
        </div>
      </div>
    </div>

    <!-- TAB 2: CONFIG & API KEYS -->
    <div id="tab-config" style="display:none;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">🔑 API Keys & Configuration</div>
          <button class="btn btn-primary" onclick="saveConfigSettings()">💾 Save Settings</button>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Bot Name</label>
            <input type="text" id="cfgBotName" placeholder="DEMONIC">
          </div>
          <div class="form-group">
            <label>Command Prefix</label>
            <input type="text" id="cfgPrefix" placeholder="/">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>OpenAI API Key (Chatbot 1, 3, 4)</label>
            <input type="password" id="cfgOpenAI" placeholder="sk-...">
          </div>
          <div class="form-group">
            <label>Google Gemini API Key (Vision / Image AI)</label>
            <input type="password" id="cfgGemini" placeholder="AIza...">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>RapidAPI Key (YouTube Downloader)</label>
            <input type="password" id="cfgRapidAPI" placeholder="RapidAPI Key">
          </div>
          <div class="form-group">
            <label>VirusTotal API Key (/curl2 phishing check)</label>
            <input type="password" id="cfgVirusTotal" placeholder="VirusTotal Key">
          </div>
        </div>
        <div class="form-group">
          <label>Ollama Host URL</label>
          <input type="text" id="cfgOllama" placeholder="http://127.0.0.1:11434">
        </div>
        <div class="form-group">
          <label>Offline Auto-Reply Message</label>
          <textarea id="cfgOfflineMsg" rows="3" placeholder="My master is currently offline..."></textarea>
        </div>
      </div>
    </div>

    <!-- TAB 3: BROADCAST -->
    <div id="tab-broadcast" style="display:none;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">📢 Group Announcement & Broadcast</div>
          <span id="groupCountBadge" style="font-size:12px; color:var(--cyan); font-weight:700;">Scanning groups...</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
          Send a broadcast notification to all WhatsApp groups where this bot is a participant. A 1-second delay is automatically enforced between groups to prevent WhatsApp rate limits.
        </p>
        <div class="form-group">
          <label>Broadcast Message</label>
          <textarea id="broadcastText" rows="6" placeholder="Type your announcement here... (Markdown supported)"></textarea>
        </div>
        <button class="btn btn-primary" onclick="sendBroadcast()">🚀 Send Broadcast to All Groups</button>
      </div>
    </div>

    <!-- TAB 4: LIVE LOGS -->
    <div id="tab-logs" style="display:none;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">📜 Live Activity Logs</div>
          <div style="display:flex; gap:8px;">
            <button class="btn" onclick="fetchLogs('activity')">Activity</button>
            <button class="btn" onclick="fetchLogs('error')">Errors</button>
            <button class="btn" onclick="fetchLogs('warn')">Warnings</button>
          </div>
        </div>
        <div class="terminal" id="terminalOutput">
          <div class="terminal-line info">Loading logs...</div>
        </div>
      </div>
    </div>
  </div>

  <div id="toast">Action completed</div>

  <script>
    const TOGGLE_DEFS = [
      { key: 'PUBLIC', label: 'Public Mode', desc: 'Allow all users or owner-only' },
      { key: 'ANTILINK', label: 'Anti-Link', desc: 'Auto-delete links in groups' },
      { key: 'WELCOME', label: 'Welcome Greeter', desc: 'Greet new group members' },
      { key: 'GROUP_DEFENSE', label: 'Group Defense', desc: 'Block malicious APKs & crash text' },
      { key: 'ANTISTICKER', label: 'Anti-Sticker', desc: 'Delete incoming stickers' },
      { key: 'ANTIGHOST', label: 'Anti-Ghost', desc: 'Protect view-once media' },
      { key: 'ANTICHAT', label: 'Anti-Chat', desc: 'Mute group chat' },
      { key: 'ANTICALL', label: 'Anti-Call', desc: 'Auto-reject WhatsApp calls' },
      { key: 'ANTIBADWORDS', label: 'Anti-Badwords', desc: 'Filter profanity & offensive words' },
      { key: 'ANTIGAY', label: 'Anti-Gay Words', desc: 'Filter gay keywords' },
      { key: 'AUTOTYPING', label: 'Auto-Typing', desc: 'Simulate typing presence' },
      { key: 'AUTORECORDING', label: 'Auto-Recording', desc: 'Simulate recording presence' },
      { key: 'AUTOREACT', label: 'Auto-React', desc: 'React with emojis to messages' },
      { key: 'OFFLINE_MODE', label: 'Offline Mode', desc: 'Auto-reply when away' }
    ];

    let currentToggles = {};

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 3000);
    }

    function switchTab(name) {
      document.querySelectorAll('.tabs .tab-btn').forEach((b, idx) => {
        b.classList.remove('active');
      });
      event.target.classList.add('active');

      ['overview', 'config', 'broadcast', 'logs'].forEach(t => {
        document.getElementById('tab-' + t).style.display = (t === name) ? 'block' : 'none';
      });

      if (name === 'config') loadConfig();
      if (name === 'broadcast') loadGroups();
      if (name === 'logs') fetchLogs('activity');
    }

    async function fetchStats() {
      try {
        const res = await fetch('/api/stats');
        const json = await res.json();
        if (!json.success) return;
        const d = json.data;

        document.getElementById('uptimeVal').innerText = d.uptime || '--';
        document.getElementById('timeVal').innerText = 'Time: ' + (d.time || '--');
        document.getElementById('ramVal').innerText = (d.heapMB || '--') + ' MB';
        document.getElementById('rssVal').innerText = 'RSS: ' + (d.rssMB || '--') + ' MB';
        document.getElementById('msgCountVal').innerText = (d.messageCount || 0).toLocaleString();
        document.getElementById('cmdCountVal').innerText = 'Commands run: ' + (d.commandCount || 0).toLocaleString();
        document.getElementById('activeTasksVal').innerText = (d.activeCommands || 0) + ' / ' + (d.maxCommands || 10);
        document.getElementById('modeVal').innerText = 'Mode: ' + (d.isPublic ? '🟢 PUBLIC' : '🔒 PRIVATE');
        document.getElementById('versionBadge').innerText = 'v' + (d.version || '1.9.5');

        const isOnline = d.socketStatus && d.socketStatus.includes('Connected');
        document.getElementById('statusDot').className = 'status-dot' + (isOnline ? '' : ' offline');
        document.getElementById('statusText').innerText = d.socketStatus || 'Connected';
      } catch (e) {}
    }

    async function loadToggles() {
      try {
        const res = await fetch('/api/toggles');
        const json = await res.json();
        if (!json.success) return;
        currentToggles = json.data;

        const container = document.getElementById('togglesContainer');
        container.innerHTML = TOGGLE_DEFS.map(def => {
          const isChecked = !!currentToggles[def.key];
          return \`
            <div class="toggle-item">
              <div class="toggle-info">
                <h4>\${def.label}</h4>
                <p>\${def.desc}</p>
              </div>
              <label class="switch">
                <input type="checkbox" \${isChecked ? 'checked' : ''} onchange="handleToggle('\${def.key}', this.checked)">
                <span class="slider"></span>
              </label>
            </div>
          \`;
        }).join('');
      } catch (e) {}
    }

    async function handleToggle(key, value) {
      try {
        const res = await fetch('/api/toggles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value })
        });
        const json = await res.json();
        if (json.success) {
          showToast(\`✅ \${key} set to \${value ? 'ON' : 'OFF'}\`);
          fetchStats();
        }
      } catch (e) {
        showToast('❌ Failed to update toggle');
      }
    }

    async function loadConfig() {
      try {
        const res = await fetch('/api/config');
        const json = await res.json();
        if (!json.success) return;
        const d = json.data;

        document.getElementById('cfgBotName').value = d.BOT_NAME || '';
        document.getElementById('cfgPrefix').value = d.PREFIX || '';
        document.getElementById('cfgOpenAI').value = d.OPENAI_API_KEY || '';
        document.getElementById('cfgGemini').value = d.GEMINI_API_KEY || '';
        document.getElementById('cfgRapidAPI').value = d.RAPIDAPI_KEY || '';
        document.getElementById('cfgVirusTotal').value = d.VIRUSTOTAL_API_KEY || '';
        document.getElementById('cfgOllama').value = d.OLLAMA_HOST || '';
        document.getElementById('cfgOfflineMsg').value = d.OFFLINE_MESSAGE || '';
      } catch (e) {}
    }

    async function saveConfigSettings() {
      const payload = {
        BOT_NAME: document.getElementById('cfgBotName').value.trim(),
        PREFIX: document.getElementById('cfgPrefix').value.trim(),
        OPENAI_API_KEY: document.getElementById('cfgOpenAI').value.trim(),
        GEMINI_API_KEY: document.getElementById('cfgGemini').value.trim(),
        RAPIDAPI_KEY: document.getElementById('cfgRapidAPI').value.trim(),
        VIRUSTOTAL_API_KEY: document.getElementById('cfgVirusTotal').value.trim(),
        OLLAMA_HOST: document.getElementById('cfgOllama').value.trim(),
        OFFLINE_MESSAGE: document.getElementById('cfgOfflineMsg').value.trim()
      };

      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
          showToast('✅ Settings saved successfully!');
          fetchStats();
        } else {
          showToast('❌ Failed to save: ' + json.error);
        }
      } catch (e) {
        showToast('❌ Network error while saving');
      }
    }

    async function loadGroups() {
      const badge = document.getElementById('groupCountBadge');
      badge.innerText = 'Scanning groups...';
      try {
        const res = await fetch('/api/groups');
        const json = await res.json();
        if (json.success) {
          badge.innerText = \`👥 \${json.data.length} Groups Participating\`;
        }
      } catch (e) {
        badge.innerText = 'Unable to fetch groups';
      }
    }

    async function sendBroadcast() {
      const text = document.getElementById('broadcastText').value.trim();
      if (!text) return alert('Please enter a message to broadcast.');

      if (!confirm('Are you sure you want to broadcast this message to ALL groups?')) return;

      try {
        showToast('⏳ Broadcasting message...');
        const res = await fetch('/api/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });
        const json = await res.json();
        if (json.success) {
          showToast(\`✅ Broadcast sent to \${json.sent || 0} groups!\`);
          document.getElementById('broadcastText').value = '';
        } else {
          showToast('❌ ' + (json.error || 'Broadcast failed'));
        }
      } catch (e) {
        showToast('❌ Error sending broadcast');
      }
    }

    async function fetchLogs(type) {
      const term = document.getElementById('terminalOutput');
      term.innerHTML = '<div class="terminal-line info">Loading logs...</div>';
      try {
        const res = await fetch('/api/logs?type=' + type);
        const json = await res.json();
        if (json.success && json.data.length) {
          term.innerHTML = json.data.map(line => {
            let cls = 'info';
            if (/error|critical|fail/i.test(line)) cls = 'error';
            else if (/warn|alert/i.test(line)) cls = 'warn';
            else if (/success|connected|active/i.test(line)) cls = 'success';
            return \`<div class="terminal-line \${cls}">\${escapeHtml(line)}</div>\`;
          }).join('');
          term.scrollTop = term.scrollHeight;
        } else {
          term.innerHTML = '<div class="terminal-line">No recent logs recorded.</div>';
        }
      } catch (e) {
        term.innerHTML = '<div class="terminal-line error">Failed to load logs.</div>';
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    async function triggerCleanup() {
      if (!confirm('Run memory cleanup and log rotation now?')) return;
      try {
        const res = await fetch('/api/cleanup', { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          showToast('🧹 Cleanup completed successfully!');
          fetchStats();
        }
      } catch (e) {
        showToast('❌ Cleanup error');
      }
    }

    async function triggerRestart() {
      if (!confirm('Restart the DEMONIC Bot process now?')) return;
      try {
        await fetch('/api/restart', { method: 'POST' });
        showToast('🔄 Restart initiated. Reconnecting in 5s...');
        setTimeout(() => location.reload(), 5000);
      } catch (e) {}
    }

    // Initial load & periodic polling
    fetchStats();
    loadToggles();
    setInterval(fetchStats, 3000);
  </script>
</body>
</html>`;
}

module.exports = {
  createDashboardServer
};
