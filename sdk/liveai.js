class LiveAIClient {
    constructor(url, options = {}) {
        this.url = url;
        this.token = options.token || "";
        this.systemPrompt = options.systemPrompt || "";
        this.websocket = null;
        this.stream = null;
        this.videoInterval = null;
        this._videoEl = null;
        this._videoCanvas = null;
        this._videoCtx = null;

        // Audio recording nodes (cleaned up on stop)
        this.audioContext = null;
        this.audioSource = null;
        this.audioProcessor = null;
        this.muteNode = null;

        // Playback
        this.playbackContext = null;
        this.nextPlayTime = 0;

        // Callbacks
        this.onMessage = null;
        this.onAudio = null;
        this.onError = null;
        this.onClose = null;
    }

    async start() {
        return new Promise((resolve, reject) => {
            let wsUrl = this.url;
            if (this.token) {
                wsUrl += `?token=${encodeURIComponent(this.token)}`;
            }

            this.websocket = new WebSocket(wsUrl);

            this.websocket.onopen = async () => {
                this.websocket.send(JSON.stringify({
                    setup: { system_prompt: this.systemPrompt }
                }));

                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                    this.stream = stream;

                    const audioStream = new MediaStream(stream.getAudioTracks());
                    this._startAudioRecording(audioStream);
                    this._setupVideoCapture(stream);

                    resolve();
                } catch (e) {
                    this.websocket.close();
                    if (this.onError) this.onError(e);
                    reject(e);
                }
            };

            this.websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "text" && this.onMessage) {
                    this.onMessage(data.text);
                } else if (data.type === "audio") {
                    this._enqueueAudio(data.data, data.mimeType);
                    if (this.onAudio) this.onAudio(data.data);
                }
            };

            this.websocket.onerror = () => {
                const err = new Error("WebSocket error. Check your token and server status.");
                if (this.onError) this.onError(err);
                reject(err);
            };

            this.websocket.onclose = () => {
                this._cleanupAudio();
                if (this.onClose) this.onClose();
            };
        });
    }

    sendText(text) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({ text }));
        }
    }

    /** Enable or disable video frame sending mid-session. */
    toggleVideo(enabled) {
        if (enabled) {
            this._startVideoInterval();
        } else {
            this._stopVideoInterval();
        }
    }

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

    _cleanupAudio() {
        // Disconnect all audio graph nodes so they don't leak on reconnect
        if (this.audioProcessor) {
            this.audioProcessor.onaudioprocess = null;
            try { this.audioProcessor.disconnect(); } catch(_) {}
            this.audioProcessor = null;
        }
        if (this.audioSource) {
            try { this.audioSource.disconnect(); } catch(_) {}
            this.audioSource = null;
        }
        if (this.muteNode) {
            try { this.muteNode.disconnect(); } catch(_) {}
            this.muteNode = null;
        }
        if (this.audioContext) {
            try { this.audioContext.close(); } catch(_) {}
            this.audioContext = null;
        }
        // Reset playback scheduler
        if (this.playbackContext) {
            try { this.playbackContext.close(); } catch(_) {}
            this.playbackContext = null;
        }
        this.nextPlayTime = 0;
    }

    _startAudioRecording(audioStream) {
        // Always create a fresh AudioContext (native sample rate, e.g. 48kHz on Mac)
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // Resume necessary if browser suspended it
        this.audioContext.resume();

        const sourceSampleRate = this.audioContext.sampleRate;
        const targetSampleRate = 16000;
        const resampleRatio = targetSampleRate / sourceSampleRate;

        console.log(`[LiveAI] Capturing at ${sourceSampleRate}Hz, resampling → ${targetSampleRate}Hz`);

        this.audioSource = this.audioContext.createMediaStreamSource(audioStream);
        // 8192 samples = ~170ms per chunk at 48kHz = better latency/throughput balance
        this.audioProcessor = this.audioContext.createScriptProcessor(8192, 1, 1);
        this.muteNode = this.audioContext.createGain();
        this.muteNode.gain.value = 0; // mute mic to avoid echo

        this.audioProcessor.onaudioprocess = (e) => {
            if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;

            const channelData = e.inputBuffer.getChannelData(0);

            // Downsample to 16kHz via linear interpolation
            const outLen = Math.round(channelData.length * resampleRatio);
            const downsampled = new Float32Array(outLen);
            for (let i = 0; i < outLen; i++) {
                const src = i / resampleRatio;
                const lo = Math.floor(src);
                const hi = Math.min(lo + 1, channelData.length - 1);
                const t = src - lo;
                downsampled[i] = channelData[lo] * (1 - t) + channelData[hi] * t;
            }

            // Convert Float32 → Int16 PCM
            const int16 = new Int16Array(outLen);
            for (let i = 0; i < outLen; i++) {
                const s = Math.max(-1, Math.min(1, downsampled[i]));
                int16[i] = s < 0 ? s * 32768 : s * 32767;
            }

            // Encode to Base64
            const raw = new Uint8Array(int16.buffer);
            let bin = '';
            for (let i = 0; i < raw.byteLength; i++) bin += String.fromCharCode(raw[i]);

            this.websocket.send(JSON.stringify({
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: "audio/pcm",
                        data: window.btoa(bin)
                    }]
                }
            }));
        };

        this.audioSource.connect(this.audioProcessor);
        this.audioProcessor.connect(this.muteNode);
        this.muteNode.connect(this.audioContext.destination);
    }

    _setupVideoCapture(videoStream) {
        const vid = document.createElement("video");
        vid.autoplay = true;
        vid.muted = true;
        vid.playsInline = true;
        vid.srcObject = videoStream;

        // Browsers require the video element to be in the DOM and playing
        // to actually decode frames — otherwise canvas captures only black.
        Object.assign(vid.style, {
            position: "fixed",
            top: "-9999px",
            left: "-9999px",
            width: "1px",
            height: "1px",
            opacity: "0",
            pointerEvents: "none"
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

        vid.play().catch(e => console.warn("[LiveAI] Video play() failed:", e));
    }

    _startVideoInterval() {
        // Avoid double-starting
        if (this.videoInterval) return;
        this.videoInterval = setInterval(() => {
            if (this.websocket?.readyState === WebSocket.OPEN &&
                this._videoEl?.readyState >= this._videoEl?.HAVE_CURRENT_DATA) {
                this._videoCtx.drawImage(this._videoEl, 0, 0, this._videoCanvas.width, this._videoCanvas.height);
                const data = this._videoCanvas.toDataURL("image/jpeg", 0.5).split(',')[1];
                this.websocket.send(JSON.stringify({
                    realtimeInput: {
                        mediaChunks: [{ mimeType: "image/jpeg", data }]
                    }
                }));
            }
        }, 1000);
    }

    _stopVideoInterval() {
        if (this.videoInterval) {
            clearInterval(this.videoInterval);
            this.videoInterval = null;
        }
    }

    /**
     * Queue incoming PCM audio chunks from Gemini and play them
     * sequentially without gaps or overlaps using audioContext.currentTime scheduling.
     */
    _enqueueAudio(base64Data, mimeType) {
        // Lazily create a dedicated playback context
        if (!this.playbackContext) {
            this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            this.nextPlayTime = this.playbackContext.currentTime;
        }

        try {
            // Decode Base64 → Uint8Array
            const bin = window.atob(base64Data);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

            // Gemini Live returns raw Int16 PCM at 24kHz
            const numSamples = bytes.length / 2;
            const audioBuffer = this.playbackContext.createBuffer(1, numSamples, 24000);
            const channel = audioBuffer.getChannelData(0);
            const view = new DataView(bytes.buffer);
            for (let i = 0; i < numSamples; i++) {
                channel[i] = view.getInt16(i * 2, true) / 32768; // little-endian Int16 → float
            }

            const source = this.playbackContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.playbackContext.destination);

            // Schedule to play after previous chunk ends (gapless)
            const startAt = Math.max(this.nextPlayTime, this.playbackContext.currentTime);
            source.start(startAt);
            this.nextPlayTime = startAt + audioBuffer.duration;

        } catch (e) {
            console.error("[LiveAI] Audio decode/play error:", e);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LiveAIClient;
} else {
    window.LiveAIClient = LiveAIClient;
}
