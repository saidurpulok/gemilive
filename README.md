# TalkToGemini

TalkToGemini is a high-performance, real-time voice and text interface built on top of the **Google Gemini Live API (Multimodal Live)**. It provides a seamless bridge between a web-based frontend and Gemini's multimodal capabilities, featuring low-latency bidirectional audio streaming and live video frame analysis.

## 🚀 Features

- **Bidirectional Voice AI**: Real-time PCM audio streaming (16kHz up / 24kHz down) for natural, fluid conversations.
- **Multimodal Support**: Support for sending live video frames (JPEG) for visual reasoning.
- **FastAPI Backend**: Robust WebSocket handling with the latest `google-genai` Python SDK.
- **Lightweight JS SDK**: A dedicated `LiveAIClient` for easy integration into any web project.
- **Dynamic Configuration**: Easily customizable system prompts, voices, and security tokens.
- **Automatic Resampling**: Frontend SDK handles native browser sample rate conversion to Gemini-compatible PCM.

## 🛠️ Tech Stack

- **Backend**: Python 3.14+, [FastAPI](https://fastapi.tiangolo.com/), [google-genai](https://github.com/googleapis/python-genai)
- **Frontend**: Vanilla JavaScript (Web Audio API, WebSockets)
- **Package Management**: [uv](https://github.com/astral-sh/uv)

---

## 📂 Project Structure

```text
├── main.py              # FastAPI application entry point
├── api/
│   └── live_routes.py   # WebSocket endpoint and Gemini Live logic
├── core/
│   └── config.py        # Pydantic-based configuration management
├── sdk/
│   └── liveai.js        # Frontend JavaScript SDK (The Core Client)
├── static/
│   └── index.html       # Prototype UI for testing
├── .env.example         # Template for environment variables
└── pyproject.toml       # Backend dependencies
```

---

## ⚙️ Setup & Installation

### 1. Prerequisites
- **Python 3.14+** (Recommended)
- **uv** (Python package manager)
- A **Google Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/))

### 2. Environment Configuration
Copy the template and fill in your credentials:
```bash
cp .env.example .env
```
Key variables:
- `GOOGLE_API_KEY`: Your Gemini API key.
- `MODEL_NAME`: Usually `gemini-2.0-flash-exp` or `gemini-3.1-flash-live-preview`.
- `APP_TOKENS`: A comma-separated list of valid tokens for frontend authentication.

### 3. Install Dependencies
```bash
uv sync
```

### 4. Run the Server
```bash
uv run fastapi dev main.py
```
The server will start at `http://localhost:8000`.

---

## 📖 Developer Guide

### Backend: WebSocket Endpoint
The main interaction happens over a WebSocket at `/ws/live`.
- **Protocol**: JSON-wrapped messages.
- **Setup Message**: Must send a `setup` object first to initialize the Gemini session.
  ```json
  {
    "setup": {
        "system_prompt": "You are a helpful AI assistant.",
        "greeting": "Optional initial text trigger"
    }
  }
  ```

### Frontend: Using the SDK
The `LiveAIClient` handles the heavy lifting of Web Audio and WebSockets.

```javascript
const client = new LiveAIClient("ws://localhost:8000/ws/live", {
    token: "your_app_token",
    systemPrompt: "You are a helpful assistant."
});

// Callbacks
client.onMessage = (text) => console.log("Gemini:", text);
client.onAudio = (base64) => { /* Raw PCM being played */ };

// Start 
await client.start({ audio: true, video: false });

// Stop
client.stop();
```

---

## ⚠️ Important Considerations

1. **Browser Security**: `getUserMedia` (Mic/Camera) requires **HTTPS** in production. Localhost works for development.
2. **Audio Resampling**: The SDK resamples browser audio (typically 48kHz) down to **16kHz PCM** as required by Gemini.
3. **Session Management**: Each WebSocket connection creates a fresh Gemini Live session.
4. **Resumption**: The API currently provides session resumption handles in logs, though the SDK currently restarts sessions on reconnect for simplicity.

---

## 📄 License
This project is for internal use and experimental development.
