# gemilive 🎙️🚀

[![PyPI version](https://badge.fury.io/py/gemilive.svg)](https://badge.fury.io/py/gemilive)
[![npm version](https://badge.fury.io/js/gemilive-js.svg)](https://badge.fury.io/js/gemilive-js)

**Plug-and-play Gemini Multimodal Live AI (voice + video) for your custom stack.**

While Google provides excellent core SDKs for the Gemini Multimodal Live API, integrating it securely into a production app usually kills a weekend. You can't put your API keys directly into a browser frontend, so you are forced to build a custom backend proxy. Suddenly, you're hand-wiring WebSockets to bridge raw 16kHz microphone streams from a JS frontend into a Python backend just to forward them to Gemini.

**`gemilive` permanently solves this "Proxy Problem."** 

It provides a seamless, secure bridge connecting your frontend directly to Google's AI through your own custom backend. It abstracts away all the tedious boilerplate of WebSockets, bidirectional audio streams (16kHz up / 24kHz down), gapless browser PCM playback, and live video framing.

Instead of spending hours reading Web Audio specs, you can now add secure, multimodal conversational AI to your project in just **six lines of code**.

This repository contains the full ecosystem spanning two packages:
- 🐍 **`gemilive`**: The secure Python backend extension for FastAPI.
- 🌐 **`gemilive-js`**: The companion JavaScript client that handles all browser multimedia.

## ✨ Why gemilive?

- **Real-Time Voice**: Native PCM audio streaming for natural, interruption-friendly conversations. No laggy turn-by-turn.
- **Multimodal Vision**: The AI can securely see what your camera sees via optimized JPEG snapshots (1fps).
- **Zero-Boilerplate Backend**: Just wrap your existing FastAPI app with `mount_gemilive()`. It abstracts all the WebSocket proxying securely.
- **Lightweight JS SDK**: A clean browser `GemiliveClient` handling media permissions, capturing, scaling, and gapless audio resampling so you never have to touch the Web Audio API.

---

## 🛠️ Installation & Quickstart

Integration requires two pieces: the Python server endpoint and the JavaScript browser client. They are designed to work together flawlessly.

### 🐍 Backend (Python / FastAPI)

Install the pip package. You can use standard `pip` or modern package managers like `uv`:
```bash
uv add gemilive
```

Setup requires a Google Gemini API key. You can provide it directly in code or grab it from your `.env`:
```env
GOOGLE_API_KEY=your_gemini_api_key_here
MODEL_NAME=gemini-3.1-flash-live-preview
```

Mount it into any FastAPI application:
```python
from fastapi import FastAPI
from gemilive import mount_gemilive

app = FastAPI()

# Mounts the secure WebSocket proxy route automatically at /ws/live
mount_gemilive(app, system_prompt="You are a helpful assistant. Keep your answers brief and conversational.")
```

### Frontend (JavaScript)

Install the npm package:
```bash
npm install gemilive-js
```
*Or use via CDN in plain HTML:*
```html
<script src="https://cdn.jsdelivr.net/npm/gemilive-js/dist/gemilive.min.js"></script>
```

Initialize the client, connect, and start talking:
```javascript
import { GemiliveClient } from 'gemilive-js';

// Point it to your FastAPI server's mount path
const client = new GemiliveClient("ws://localhost:8000/ws/live");

client.onMessage = (text) => console.log("Gemini:", text);
client.onError = (err) => console.error("Error:", err);

// Start the connection (prompts user for Mic & Camera)
await client.start();

// Disable video mid-session (audio continues)
// client.toggleVideo(false);

// Stop and disconnect
// client.stop();
```

---

## ⚙️ Advanced Configuration

### Python `mount_gemilive()` Overrides
You can override environment variables dynamically when mounting the API:

```python
mount_gemilive(
    app,
    google_api_key="...",                 # Overrides GOOGLE_API_KEY env 
    model="gemini-3.1-flash-live-preview",# Overrides MODEL_NAME env
    voice="Aoede",                        # Optional Gemini Voice ("Aoede", "Charon", etc.)
    allow_origins=["https://myapp.com"],  # Essential if your frontend is on a different domain
    debug_mode=True                       # Console logging of message flow
)
```

### The System Prompt
You can set system prompts on the **server-side** (via `mount_gemilive`) or the **client-side** (via `new GemiliveClient(url, { systemPrompt: "..." })`). 
If both are provided, the server-side prompt takes precedence, and the client-side prompt is appended securely as "Additional context".

---

## 📂 Project Structure (For Contributors)

`gemilive` is developed as a monorepo containing two packages:

```text
├── gemilive/             # PyPI package source
│   ├── mount.py        # Public FastAPI installer
│   ├── config.py       # Pydantic env validation
│   └── router.py       # Internal WebSocket / GenAI flow
├── gemilive-js/          # npm package source
│   ├── src/index.js    # Browser SDK (Web Audio API logic)
│   └── package.json
└── main.py             # Sandbox FastAPI app for testing and local dev
```

For guidelines on local development and how to publish to PyPI and npm, read `PUBLISHING.md`.

---

## ⚠️ Important Considerations

1. **Browser Security**: Browsers restrict microphone/camera access to secure contexts. `getUserMedia` requires **HTTPS** in production. `localhost` works for development.
2. **Audio Resampling**: Browsers typically record audio at 44.1kHz or 48kHz. The `gemilive-js` SDK seamlessly resamples microphone inputs to **16kHz PCM** to meet Gemini's strict API requirements. Responses from Gemini are returned as 24kHz PCM and gaplessly played back using Javascript time-scheduling.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
