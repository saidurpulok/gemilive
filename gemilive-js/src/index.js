/**
 * GemiliveClient
 *
 * Browser SDK for the gemilive Gemini Live AI proxy.
 * Handles WebSocket connection, audio capture + resampling,
 * video frame sampling, and gapless PCM audio playback.
 *
 * Usage:
 *   const client = new GemiliveClient("wss://your-backend.com/ws/live", {
 *     systemPrompt: "You are a helpful assistant."
 *   });
 *   await client.start();
 *   client.toggleVideo(false); // pause video mid-session
 *   client.sendText("Hello!");
 *   client.stop();
 */
export class GemiliveClient {
    /**
     * @param {string} url        - WebSocket URL of the gemilive backend (/ws/live)
     * @param {object} options
     * @param {string} [options.systemPrompt] - Optional system prompt sent at connect time
     */
    constructor(url, options = {}) {
        this.url = url;
        this.systemPrompt = options.systemPrompt || "";

        // WebSocket + media stream
        this.websocket = null;
        this.stream = null;

        // Video state
        this.videoInterval = null;
        this._videoEl = null;
        this._videoCanvas = null;
        this._videoCtx = null;

        // Audio capture nodes (cleaned up on stop)
        this.audioContext = null;
        this.audioSource = null;
        this.audioProcessor = null;
        this.muteNode = null;

        // Audio playback scheduler
        this.playbackContext = null;
        this.nextPlayTime = 0;

        // Callbacks — assign before calling start()
        this.onMessage = null; // (text: string) => void
        this.onAudio = null;   // (base64: string) => void
        this.onError = null;   // (error: Error) => void
        this.onClose = null;   // () => void
    }

    /**
     * Connect to the backend and start audio + video capture.
     * Always requests both mic and camera. Use toggleVideo(false) to pause video.
     * @returns {Promise<void>}
     */
    async start() {
        if (
            typeof navigator === "undefined" ||
            !navigator.mediaDevices ||
            typeof navigator.mediaDevices.getUserMedia !== "function"
        ) {
            const secureContextHint =
                typeof window !== "undefined" && !window.isSecureContext
                    ? " This page is not running in a secure context. Use HTTPS (or localhost during development)."
                    : "";
            const err = new Error(
                "Media input is unavailable in this browser/environment. Microphone and camera require a supported browser and secure context." +
                    secureContextHint
            );
            if (this.onError) this.onError(err);
            throw err;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
        });
        this.stream = stream;
        this._startAudioRecording(new MediaStream(stream.getAudioTracks()));
        this._setupVideoCapture(stream);

        return new Promise((resolve, reject) => {
            this.websocket = new WebSocket(this.url);

            this.websocket.onopen = async () => {
                // Send setup — server merges this with any server-side system_prompt
                this.websocket.send(JSON.stringify({
                    setup: { system_prompt: this.systemPrompt }
                }));
                resolve();
            };

            this.websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "text" && this.onMessage) {
                    this.onMessage(data.text);
                } else if (data.type === "audio") {
                    this._enqueueAudio(data.data);
                    if (this.onAudio) this.onAudio(data.data);
                }
            };

            this.websocket.onerror = () => {
                const err = new Error("WebSocket error. Check your backend URL and server status.");
                this.stop();
                if (this.onError) this.onError(err);
                reject(err);
            };

            this.websocket.onclose = () => {
                this._cleanupAudio();
                if (this.onClose) this.onClose();
            };
        });
    }

    /**
     * Send a text message to Gemini.
     * @param {string} text
     */
    sendText(text) {
        if (this.websocket?.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({ text }));
        }
    }

    /**
     * Enable or disable video frame sending mid-session.
     * Audio continues regardless. Does NOT disconnect.
     * @param {boolean} enabled
     */
    toggleVideo(enabled) {
        if (enabled) {
            this._startVideoInterval();
        } else {
            this._stopVideoInterval();
        }
    }

    /**
     * Stop all capture, close the WebSocket, and release media devices.
     */
    stop() {
        this._cleanupAudio();
        this._stopVideoInterval();
        if (this._videoEl) {
            this._videoEl.srcObject = null;
            this._videoEl.remove();
            this._videoEl = null;
        }
        this._videoCanvas = null;
        this._videoCtx = null;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.websocket &&
            (this.websocket.readyState === WebSocket.OPEN ||
             this.websocket.readyState === WebSocket.CONNECTING)) {
            this.websocket.close();
        }
    }

    // ---------------------------------------------------------------------------
    // Private: Audio capture
    // ---------------------------------------------------------------------------

    _startAudioRecording(audioStream) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioContext.resume();

        const sourceSampleRate = this.audioContext.sampleRate;
        const targetSampleRate = 16000; // Gemini requires 16kHz PCM input
        const resampleRatio = targetSampleRate / sourceSampleRate;

        this.audioSource = this.audioContext.createMediaStreamSource(audioStream);
        this.audioProcessor = this.audioContext.createScriptProcessor(8192, 1, 1);
        this.muteNode = this.audioContext.createGain();
        this.muteNode.gain.value = 0; // prevent mic echo

        this.audioProcessor.onaudioprocess = (e) => {
            if (this.websocket?.readyState !== WebSocket.OPEN) return;

            const channelData = e.inputBuffer.getChannelData(0);

            // Downsample via linear interpolation
            const outLen = Math.round(channelData.length * resampleRatio);
            const downsampled = new Float32Array(outLen);
            for (let i = 0; i < outLen; i++) {
                const src = i / resampleRatio;
                const lo = Math.floor(src);
                const hi = Math.min(lo + 1, channelData.length - 1);
                downsampled[i] = channelData[lo] * (1 - (src - lo)) + channelData[hi] * (src - lo);
            }

            // Float32 → Int16 PCM
            const int16 = new Int16Array(outLen);
            for (let i = 0; i < outLen; i++) {
                const s = Math.max(-1, Math.min(1, downsampled[i]));
                int16[i] = s < 0 ? s * 32768 : s * 32767;
            }

            // Int16 → Base64
            const raw = new Uint8Array(int16.buffer);
            let bin = "";
            for (let i = 0; i < raw.byteLength; i++) bin += String.fromCharCode(raw[i]);

            this.websocket.send(JSON.stringify({
                realtimeInput: {
                    mediaChunks: [{ mimeType: "audio/pcm", data: window.btoa(bin) }]
                }
            }));
        };

        this.audioSource.connect(this.audioProcessor);
        this.audioProcessor.connect(this.muteNode);
        this.muteNode.connect(this.audioContext.destination);
    }

    _cleanupAudio() {
        if (this.audioProcessor) {
            this.audioProcessor.onaudioprocess = null;
            try { this.audioProcessor.disconnect(); } catch (_) {}
            this.audioProcessor = null;
        }
        if (this.audioSource) {
            try { this.audioSource.disconnect(); } catch (_) {}
            this.audioSource = null;
        }
        if (this.muteNode) {
            try { this.muteNode.disconnect(); } catch (_) {}
            this.muteNode = null;
        }
        if (this.audioContext) {
            try { this.audioContext.close(); } catch (_) {}
            this.audioContext = null;
        }
        if (this.playbackContext) {
            try { this.playbackContext.close(); } catch (_) {}
            this.playbackContext = null;
        }
        this.nextPlayTime = 0;
    }

    // ---------------------------------------------------------------------------
    // Private: Video capture
    // ---------------------------------------------------------------------------

    _setupVideoCapture(videoStream) {
        const vid = document.createElement("video");
        vid.autoplay = true;
        vid.muted = true;
        vid.playsInline = true;
        vid.srcObject = videoStream;

        // Must be in the DOM for the browser to decode frames
        Object.assign(vid.style, {
            position: "fixed",
            top: "-9999px",
            left: "-9999px",
            width: "1px",
            height: "1px",
            opacity: "0",
            pointerEvents: "none",
        });
        document.body.appendChild(vid);
        this._videoEl = vid;

        this._videoCanvas = document.createElement("canvas");
        this._videoCtx = this._videoCanvas.getContext("2d");

        vid.addEventListener("canplay", () => {
            this._videoCanvas.width = 640;
            this._videoCanvas.height = Math.round((vid.videoHeight / vid.videoWidth) * 640) || 360;
            this._startVideoInterval();
        }, { once: true });

        vid.play().catch(e => console.warn("[gemilive] video play() failed:", e));
    }

    _startVideoInterval() {
        if (this.videoInterval) return; // already running
        this.videoInterval = setInterval(() => {
            if (this.websocket?.readyState === WebSocket.OPEN &&
                this._videoEl?.readyState >= this._videoEl?.HAVE_CURRENT_DATA) {
                this._videoCtx.drawImage(this._videoEl, 0, 0, this._videoCanvas.width, this._videoCanvas.height);
                const data = this._videoCanvas.toDataURL("image/jpeg", 0.5).split(",")[1];
                this.websocket.send(JSON.stringify({
                    realtimeInput: {
                        mediaChunks: [{ mimeType: "image/jpeg", data }]
                    }
                }));
            }
        }, 1000); // 1 frame per second
    }

    _stopVideoInterval() {
        if (this.videoInterval) {
            clearInterval(this.videoInterval);
            this.videoInterval = null;
        }
    }

    // ---------------------------------------------------------------------------
    // Private: Audio playback (gapless PCM scheduling)
    // ---------------------------------------------------------------------------

    /**
     * Decode and schedule a base64-encoded Int16 PCM chunk from Gemini (24kHz).
     * Uses Web Audio API's timeline scheduling for gap-free playback.
     * @param {string} base64Data
     */
    _enqueueAudio(base64Data) {
        if (!this.playbackContext) {
            this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            this.nextPlayTime = this.playbackContext.currentTime;
        }

        try {
            // Base64 → Uint8Array
            const bin = window.atob(base64Data);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

            // Int16 little-endian PCM → float [-1, 1]
            const numSamples = bytes.length / 2;
            const buffer = this.playbackContext.createBuffer(1, numSamples, 24000);
            const channel = buffer.getChannelData(0);
            const view = new DataView(bytes.buffer);
            for (let i = 0; i < numSamples; i++) {
                channel[i] = view.getInt16(i * 2, true) / 32768;
            }

            const source = this.playbackContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.playbackContext.destination);

            const startAt = Math.max(this.nextPlayTime, this.playbackContext.currentTime);
            source.start(startAt);
            this.nextPlayTime = startAt + buffer.duration;

        } catch (e) {
            console.error("[gemilive] audio playback error:", e);
        }
    }
}

// Support plain <script type="module"> tag fallback
if (typeof window !== "undefined") {
    window.GemiliveClient = GemiliveClient;
}
