# gemilive-js

Browser SDK for the [`gemilive`](https://github.com/your-org/central_gemilive) Gemini Live AI proxy.
Handles WebSocket connection, microphone capture, audio resampling, video frame sampling, and gapless PCM playback — so you don't have to.

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

const client = new GemiliveClient("wss://your-backend.com/ws/live", {
    systemPrompt: "You are a helpful assistant."
});

client.onMessage = (text) => console.log("Gemini:", text);
client.onError   = (err)  => console.error(err);
client.onClose   = ()     => console.log("disconnected");

// Connect — requests mic + camera (both always active)
await client.start();

// Toggle camera on/off mid-session (audio continues)
client.toggleVideo(false);
client.toggleVideo(true);

// Send a text message
client.sendText("What do you see?");

// Disconnect and release devices
client.stop();
```

## API

### `new GemiliveClient(url, options)`

| Param | Type | Description |
|---|---|---|
| `url` | `string` | WebSocket URL of your gemilive backend |
| `options.systemPrompt` | `string` | Optional system prompt sent at connect time |

### Methods

| Method | Description |
|---|---|
| `start()` | Connect and begin audio+video capture. Returns a Promise. |
| `stop()` | Disconnect, stop all tracks, release devices. |
| `sendText(text)` | Send a text message to Gemini. |
| `toggleVideo(enabled)` | Pause or resume video frame sending. Audio is unaffected. |

### Callbacks

| Callback | Signature | Description |
|---|---|---|
| `onMessage` | `(text: string) => void` | Fired for each text chunk from Gemini |
| `onAudio` | `(base64: string) => void` | Fired when an audio chunk is received |
| `onError` | `(error: Error) => void` | Fired on WebSocket or media errors |
| `onClose` | `() => void` | Fired when the connection closes |

## Notes

- **HTTPS required** in production for `getUserMedia` (mic/camera access). Localhost works for development.
- Audio is captured at the browser's native sample rate and resampled to **16kHz PCM** before sending.
- Gemini responds with **24kHz PCM** audio, played back gaplessly via the Web Audio API.
- Video frames are sent as JPEG snapshots at **1 frame per second**.

## License

MIT
