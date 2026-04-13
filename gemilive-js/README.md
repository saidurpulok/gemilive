# gemilive-js

[![npm version](https://badge.fury.io/js/gemilive-js.svg)](https://badge.fury.io/js/gemilive-js)

**IMPORTANT: This is the companion Frontend SDK for the Python [`gemilive`](https://github.com/saidurpulok/gemilive) FastAPI package. It must be connected to a backend running `gemilive`.**

`gemilive-js` handles the complex browser APIs required for real-time AI streaming so you don't have to. It manages native WebSockets, microphone capture, audio resampling, video frame sampling, and timeline-based gapless PCM playback. 

With this SDK, your frontend integrates perfectly with the Gemini Multimodal Live API proxy provided by `gemilive`.

## Install

```bash
npm install gemilive-js
```

Or via CDN (no bundler needed):

```html
<script src="https://cdn.jsdelivr.net/npm/gemilive-js/dist/gemilive.min.js"></script>
```

## Usage

```javascript
import { GemiliveClient } from 'gemilive-js';

// The URL MUST point to the FastAPI endpoint where you mounted `mount_gemilive()`
const client = new GemiliveClient("ws://localhost:8000/ws/live", {
    systemPrompt: "You are a helpful assistant." // Overrides or appends to backend prompt
});

// React to Gemini
client.onMessage = (text) => console.log("Gemini:", text);
client.onError   = (err)  => console.error(err);
client.onClose   = ()     => console.log("disconnected");

// Connect — automatically requests mic + camera permissions
await client.start();

// Toggle camera on/off mid-session (audio continues)
// client.toggleVideo(false);

// Send text messages concurrently
client.sendText("What do you see?");

// Disconnect and release devices
// client.stop();
```

## API

### `new GemiliveClient(url, options)`

| Param | Type | Description |
|---|---|---|
| `url` | `string` | The WebSocket URL of your `gemilive` Python backend endpoint |
| `options.systemPrompt` | `string` | Optional system prompt sent dynamically at connect time |

### Methods

| Method | Description |
|---|---|
| `start()` | Connect to the backend and begin audio+video capture. Returns a Promise. |
| `stop()` | Disconnect the WebSocket, stop all tracks, and release hardware devices. |
| `sendText(text)` | Send a text string instantly to Gemini. |
| `toggleVideo(enabled)` | Pause or resume sending video frames. Audio remains uninterrupted. |

### Callbacks

| Callback | Signature | Description |
|---|---|---|
| `onMessage` | `(text: string) => void` | Fired when Gemini streams a block of text |
| `onAudio` | `(base64: string) => void` | Backdoor callback: Fired when an audio chunk is received, but already played by the SDK |
| `onError` | `(error: Error) => void` | Fired on WebSocket failures or media permission rejections |
| `onClose` | `() => void` | Fired when the session ends or backend disconnects |

## Technical Notes

- **HTTPS Required**: Browsers completely block `getUserMedia()` on HTTP connections. You must run your remote frontend over HTTPS (Localhost is exempt).
- **Audio Resampling**: Most browsers record at 44.1kHz or 48kHz. This SDK strictly downsamples outgoing audio to **16kHz PCM** as required by Gemini. Responses from Gemini are natively **24kHz PCM**, which this SDK plays back gaplessly using JavaScript Web Audio Time Scheduling.
- **Video Framerate**: Video frames are snapped from a hidden `<video>` element to a hidden `<canvas>` and sent as JPEG payloads at precisely **1 frame per second**.

## License

MIT
