# gemilive

Plug-and-play **Gemini Live AI** (voice + video) for your FastAPI app.

`gemilive` provides a seamless bridge between a web-based frontend and Google's Gemini Multimodal Live API. It handles the heavy lifting of WebSockets, bidirectional audio streams (16kHz up / 24kHz down), gapless browser PCM playback, and live video framing — allowing you to add conversational AI to your project in just **six lines of code**.

This repo contains both the Python backend plugin (`gemilive`) and the companion JavaScript client (`gemilive-js`).

## 🚀 Features

- **Bidirectional Voice AI**: Real-time PCM audio streaming for natural, fluid conversions. No laggy turn-by-turn.
- **Multimodal Vision**: The AI can see what your camera sees via 1fps JPEG snapshots.
- **Zero-Boilerplate Backend**: Just wrap your existing FastAPI app with `mount_gemilive()`.
- **Lightweight JS SDK**: A clean browser `GemiliveClient` handling media capture and resampling.
- **Toggleable Media**: Turn your camera off/on mid-session seamlessly.

---

## 🛠️ Installation & Quickstart

Integration requires two pieces: the Python server endpoint and the JavaScript browser client.

### Backend (Python)

Install the pip package:
```bash
uv add gemilive
# or pip install gemilive
```

Setup requires an API key. You can provide it in code or grab it from your `.env`:
```env
GOOGLE_API_KEY=your_gemini_api_key_here
MODEL_NAME=gemini-3.1-flash-live-preview
```

Mount it into any FastAPI app:
```python
from fastapi import FastAPI
from gemilive import mount_gemilive

app = FastAPI()

# Mounts the WebSocket route at /ws/live
mount_gemilive(app, system_prompt="You are a helpful assistant. Keep answers brief.")
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
