// ================= MENU AUDIO MODULE =================
// Audio file sent when user types /menu

const fs = require("fs");
const path = require("path");

// 🔴 REPLACE THIS PATH WITH YOUR AUDIO FILE PATH
// Default: put an `audio.mp3` file next to this script or update the name below
const AUDIO_PATH = path.join(__dirname, "audio.mp3");

// Function to send menu audio
const sendMenuAudio = async (sock, from) => {
  try {
    // Debug log
    console.log("🎵 sendMenuAudio triggered for:", from);

    // Safety Check 1: Verify socket connection
    if (!sock || typeof sock.sendMessage !== "function") {
      console.error("❌ Invalid socket connection in sendMenuAudio");
      return;
    }

    // Safety Check 2: Verify destination
    if (!from || typeof from !== "string" || from.trim() === "") {
      console.error("❌ Invalid destination in sendMenuAudio");
      return;
    }

    // Safety Check 3: Check AUDIO_PATH
    if (typeof AUDIO_PATH !== "string") {
      console.error("❌ AUDIO_PATH is not a string");
      return;
    }

    let resolvedAudioPath = AUDIO_PATH;
    let fileExists = false;

    try {
      if (fs.existsSync(resolvedAudioPath)) {
        fileExists = true;
      } else {
        // Try other extensions
        const baseDir = path.dirname(AUDIO_PATH);
        const ext = path.extname(AUDIO_PATH);
        const name = path.basename(AUDIO_PATH, ext);
        const base = path.join(baseDir, name); // Build base path without extension

        const tryExts = [".mp3", ".m4a", ".ogg", ".opus", ".wav", ".mp4", ".mpeg"];
        for (const e of tryExts) {
          const p = base + e;
          if (fs.existsSync(p)) {
            resolvedAudioPath = p;
            console.log("ℹ️ Found audio at:", resolvedAudioPath);
            fileExists = true;
            break;
          }
        }
      }
    } catch (fsError) {
      console.error("❌ FS Check Error:", fsError.message);
      return sock.sendMessage(from, { text: "❌ Error checking audio file: " + fsError.message });
    }

    if (!fileExists) {
      console.warn(`⚠️ Audio file not found at: ${AUDIO_PATH}`);
      return sock.sendMessage(from, {
        text: "❌ Audio file not found. Please upload 'audio.mp3' to the bot folder."
      });
    }

    // Safety Check 4: Verify file size
    try {
      const stats = fs.statSync(resolvedAudioPath);
      if (stats.size === 0) {
        console.error("❌ Audio file is empty");
        return sock.sendMessage(from, { text: "❌ Audio file is corrupted (empty)" });
      }

      const maxSize = 100 * 1024 * 1024; // 100MB
      if (stats.size > maxSize) {
        console.error("❌ Audio file starts too large");
        return sock.sendMessage(from, { text: "❌ Audio file is too large (max 100MB)" });
      }
    } catch (statError) {
      console.error("❌ FS Stat Error:", statError.message);
      return;
    }

    // Determine mimetype
    const ext = path.extname(resolvedAudioPath).toLowerCase();
    let mimetype = "audio/mpeg";
    let ptt = false;

    if (ext === ".mp3") mimetype = "audio/mpeg";
    else if (ext === ".m4a" || ext === ".mp4") mimetype = "audio/mp4";
    else if (ext === ".ogg" || ext === ".opus") {
      mimetype = "audio/ogg; codecs=opus";
      ptt = true;
    } else if (ext === ".wav") mimetype = "audio/wav";
    else {
      console.warn("⚠️ Unknown audio extension:", ext);
      return sock.sendMessage(from, { text: "❌ Unsupported audio format" });
    }

    // Send audio
    console.log(`📤 Sending audio: ${resolvedAudioPath} (${mimetype})`);

    // Using a Buffer instead of Stream can sometimes be more stable for small files
    // But Stream is better for memory. We will stick to stream but add error handlers.
    const audioStream = fs.createReadStream(resolvedAudioPath);

    audioStream.on('error', (err) => {
      console.error("❌ Stream Error:", err);
    });

    await sock.sendMessage(from, {
      audio: { stream: audioStream }, // Pass stream specifically if using Baileys stream support, or just pass the stream object
      mimetype: mimetype,
      ptt: ptt
    });

    console.log("✅ Audio command executed");

  } catch (error) {
    console.error("❌ CRITICAL MENU AUDIO ERROR:", error);
    try {
      if (sock && from) {
        await sock.sendMessage(from, {
          text: `❌ Error sending audio: ${error.message || String(error)}`
        });
      }
    } catch (e) {
      console.error("❌ Failed to send error report:", e);
    }
  }
};

module.exports = { sendMenuAudio };
