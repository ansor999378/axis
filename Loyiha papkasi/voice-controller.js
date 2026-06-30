const VoiceController = {
  isSessionActive: false,
  isListening: false,
  isTranscribing: false,
  isPlaying: false,

  _permStream: null,
  mediaRecorder: null,
  audioStream: null,
  audioChunks: [],
  audioContext: null,
  analyser: null,
  monitorTimer: null,
  recordingStartedAt: 0,
  lastVoiceAt: 0,
  playbackContext: null,
  playbackSource: null,

  isStreamActive: false,
  streamBuffer: '',
  streamCtx: null,
  streamSource: null,
  streamAnalyser: null,
  playChain: Promise.resolve(),

  waveRafId: null,
  waveCanvas: null,
  waveCtx2d: null,
  waveBars: null,

  silenceDelayMs: 1500,
  minRecordingMs: 500,
  silenceThreshold: 0.02,
  minBlobSize: 1000,

  STT_MODEL: 'gemini-2.0-flash',
  TTS_MODEL: 'gemini-2.0-flash-preview-tts',

  // ─── internal flags ───
  _startingRecording: false,
  _sendingSegment: false,
  _hadVoice: false,
  _voiceStartAt: 0,
  _lastRmsLog: 0,
  _waveFlashUntil: 0,
  _recordingMimeType: '',

  // ═══════════════════════════════════════
  //  TOGGLE — tugmani bosganda
  // ═══════════════════════════════════════
  async toggle() {
    if (this.isSessionActive) {
      this.stopSession();
      return;
    }

    if (!AppState.apiKeys.sttGroq && !AppState.apiKeys.sttGemini && !AppState.apiKeys.sttOpenai) {
      alert('STT (ovoz → matn) API kiritilmagan!\n\nSettings → Bo\'lim 2 ga Groq, Gemini yoki OpenAI Whisper API key qo\'ying.');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Mikrofon ishlamayapti!\n\nSaytni http://localhost orqali oching.\nBrauzer manzil satrida mikrofon ikonkasini bosib ruxsat bering.');
      return;
    }

    try {
      this.isSessionActive = true;
      this.initWaveCanvas();
      this.showWavePanel();
      this.startWaveLoop();
      this.updateUI(true);
      await this.startRecording();
    } catch (err) {
      console.error('[VC] toggle error:', err);
      this.stopSession();
    }
  },

  // ═══════════════════════════════════════
  //  START RECORDING
  // ═══════════════════════════════════════
  async startRecording() {
    if (!this.isSessionActive) return;
    if (this.isListening) { console.log('[VC] startRecording: already listening'); return; }
    if (this._startingRecording) { console.log('[VC] startRecording: already starting'); return; }

    this._startingRecording = true;
    console.log('[VC] startRecording called');

    try {
      // Bir marta ruxsat olamiz
      if (!this._permStream) {
        this._permStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[VC] getUserMedia: OK');
      }

      if (!this.isSessionActive) return;

      // State reset — yangi segment uchun
      this.audioStream = this._permStream;
      this.audioChunks = [];
      this.recordingStartedAt = Date.now();
      this.lastVoiceAt = Date.now();
      this._hadVoice = false;
      this._voiceStartAt = 0;
      this._sendingSegment = false; // ← MUHIM: har safar reset

      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
      this._recordingMimeType = mimeType;

      this.mediaRecorder = new MediaRecorder(this._permStream, { mimeType });

      this.mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        console.log('[VC] onstop fired. session=', this.isSessionActive, 'chunks=', this.audioChunks.length);
        // onstop da chunks ni o'chirmaymiz — sendSegment allaqachon splice qilgan
        // Faqat analyser va monitorni tozalaymiz
        this.stopSilenceMonitor();
        this.mediaRecorder = null;
        this.isListening = false;

        if (this.isSessionActive && !this.isTranscribing) {
          // Sessiya davom etayapti — qayta yozishni boshlashga urinamiz
          try {
            await this.startRecording();
          } catch (e) {
            console.warn('[VC] restart after onstop failed:', e);
            this.stopSession();
          }
        }
      };

      this.mediaRecorder.start(100);
      this.isListening = true;
      this.updateUI(true);
      this.startSilenceMonitor();
      console.log('[VC] Recording started, mime=', mimeType);

    } catch (err) {
      console.error('[VC] startRecording error:', err);
      this.isSessionActive = false;
      this.isListening = false;
      this.updateUI(false);
      this.hideWavePanel();
      alert('Mikrofon xatosi: ' + err.message);
    } finally {
      this._startingRecording = false;
    }
  },

  // ═══════════════════════════════════════
  //  STOP SESSION
  // ═══════════════════════════════════════
  stopSession() {
    console.log('[VC] stopSession');
    this.isSessionActive = false;
    this._sendingSegment = false;

    this.stopSilenceMonitor();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (e) {}
    }
    this.mediaRecorder = null;
    this.isListening = false;
    this.audioChunks = [];

    this.stopPlayback();
    this.stopWaveLoop();
    this.hideWavePanel();
    this.updateUI(false);

    if (this._permStream) {
      this._permStream.getTracks().forEach(t => t.stop());
      this._permStream = null;
      this.audioStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.analyser = null;
    }
  },

  // ═══════════════════════════════════════
  //  SILENCE MONITOR
  // ═══════════════════════════════════════
  startSilenceMonitor() {
    this.stopSilenceMonitor();
    if (!this.audioStream) return;

    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      const source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);
    } catch (e) {
      console.warn('[VC] AudioContext error:', e);
      return;
    }

    const samples = new Float32Array(this.analyser.fftSize);

    this.monitorTimer = setInterval(() => {
      if (!this.isListening || !this.analyser) return;

      this.analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);
      const now = Date.now();

      if (rms > this.silenceThreshold) {
        if (!this._voiceStartAt) this._voiceStartAt = now;
        if (now - this._voiceStartAt > 200) {
          this.lastVoiceAt = now;
          this._hadVoice = true;
          if (this.isPlaying) {
            console.log('[VC] User spoke during playback — interrupting');
            this.stopPlayback();
          }
        }
        return;
      }
      this._voiceStartAt = 0;

      if (!this._lastRmsLog || now - this._lastRmsLog > 1000) {
        console.log('[VC] RMS:', rms.toFixed(4), '| hadVoice:', this._hadVoice, '| silenceMs:', (now - this.lastVoiceAt), '| sendingSegment:', this._sendingSegment);
        this._lastRmsLog = now;
      }

      // AI gapiryapti — yozishni to'xtatmaymiz
      if (this.isPlaying) return;

      const recordingMs = now - this.recordingStartedAt;
      const silenceMs = now - this.lastVoiceAt;

      if (
        !this.isTranscribing &&
        !this._sendingSegment &&
        this._hadVoice &&
        recordingMs > this.minRecordingMs &&
        silenceMs > this.silenceDelayMs
      ) {
        console.log('[VC] Silence detected! Sending segment. silenceMs=', silenceMs);
        this.sendSegment();
      }
    }, 150);
  },

  stopSilenceMonitor() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (e) {}
      this.analyser = null;
    }
    // audioContext ni yopmaymiz — startSilenceMonitor uni qayta ishlatadi
    // Faqat session to'xtaganda stopSession() da yopiladi
  },

  // ═══════════════════════════════════════
  //  SEND SEGMENT — audio → STT
  // ═══════════════════════════════════════
  async sendSegment() {
    if (this._sendingSegment) {
      console.log('[VC] sendSegment: already sending, skip');
      return;
    }
    if (this.audioChunks.length === 0) {
      console.log('[VC] sendSegment: no chunks, skip');
      return;
    }

    this._sendingSegment = true;
    this._hadVoice = false;

    // Chunks ni olimiz — lekin MediaRecorder davom etayapti, yangi chunks keladi
    const chunks = this.audioChunks.splice(0);
    // Reset timers — yangi segment uchun
    this.recordingStartedAt = Date.now();
    this.lastVoiceAt = Date.now();

    console.log('[VC] sendSegment: chunks=', chunks.length);

    try {
      const rawBlob = new Blob(chunks, { type: this._recordingMimeType || 'audio/webm' });
      console.log('[VC] sendSegment: rawBlob.size=', rawBlob.size);

      if (rawBlob.size < this.minBlobSize) {
        console.log('[VC] sendSegment: blob too small, skip');
        return;
      }

      let wavBlob;
      try {
        wavBlob = await this.blobToWav(rawBlob);
        console.log('[VC] sendSegment: WAV size=', wavBlob.size);
      } catch (e) {
        console.warn('[VC] WAV conversion failed, using raw:', e.message);
        wavBlob = rawBlob;
      }

      await this.transcribeAudio(wavBlob);

    } catch (e) {
      console.error('[VC] sendSegment error:', e);
    } finally {
      // MUHIM: _sendingSegment ni faqat shu yerda false qilamiz
      this._sendingSegment = false;
      console.log('[VC] sendSegment: done, _sendingSegment=false');
    }
  },

  // ═══════════════════════════════════════
  //  STT — Audio → Matn
  // ═══════════════════════════════════════
  async transcribeAudio(blob) {
    const sttGroq   = AppState.apiKeys.sttGroq;
    const sttGemini = AppState.apiKeys.sttGemini;
    const sttOpenai = AppState.apiKeys.sttOpenai;

    console.log('[VC] transcribeAudio: size=', blob.size, 'groq=', !!sttGroq, 'gemini=', !!sttGemini, 'openai=', !!sttOpenai);

    if (!sttGroq && !sttGemini && !sttOpenai) {
      this.flashWaveMessage('STT API yo\'q! Settings → Bo\'lim 2 ga key qo\'ying.');
      return false;
    }

    this.isTranscribing = true;
    this.updateUI(true);

    try {
      let text = '';

      // 1. Groq Whisper
      if (!text && sttGroq) {
        try {
          let groqBlob;
          try {
            groqBlob = await this.blobToWav(blob);
          } catch (e) {
            groqBlob = blob;
          }
          const formData = new FormData();
          const groqExt = groqBlob.type.includes('ogg') ? 'ogg' : groqBlob.type.includes('wav') ? 'wav' : 'webm';
          formData.append('file', groqBlob, `audio.${groqExt}`);
          formData.append('model', 'whisper-large-v3');
          formData.append('response_format', 'json');
          const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${sttGroq}` },
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            text = data.text?.trim() || '';
            console.log('[VC] Groq STT:', JSON.stringify(text));
          } else {
            const err = await res.text();
            console.error('[VC] Groq error:', res.status, err.slice(0, 200));
          }
        } catch (e) {
          console.warn('[VC] Groq failed:', e.message);
        }
      }

      // 2. Gemini STT
      if (!text && sttGemini) {
        try {
          const base64 = await this.blobToBase64(blob);
          let mime = blob.type || (this._recordingMimeType || 'audio/webm').split(';')[0];
          if (mime.includes(';')) mime = mime.split(';')[0];
          if (!['audio/webm','audio/ogg','audio/mp4','audio/wav','audio/flac'].includes(mime)) mime = 'audio/webm';
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${this.STT_MODEL}:generateContent?key=${sttGemini}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [
                  { inline_data: { mime_type: mime, data: base64 } },
                  { text: 'Transcribe this audio exactly. Return only the spoken text, nothing else.' }
                ]}]
              })
            }
          );
          if (res.ok) {
            const data = await res.json();
            text = data.candidates?.[0]?.content?.parts?.filter(p => p.text)?.map(p => p.text)?.join('')?.trim() || '';
            console.log('[VC] Gemini STT:', JSON.stringify(text));
          } else {
            const err = await res.text();
            console.error('[VC] Gemini STT error:', res.status, err.slice(0, 200));
          }
        } catch (e) {
          console.warn('[VC] Gemini STT failed:', e.message);
        }
      }

      // 3. OpenAI Whisper
      if (!text && sttOpenai) {
        try {
          const formData = new FormData();
          const openaiExt = blob.type.includes('wav') ? 'wav' : blob.type.includes('ogg') ? 'ogg' : 'webm';
          formData.append('file', blob, `audio.${openaiExt}`);
          formData.append('model', 'whisper-1');
          const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${sttOpenai}` },
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            text = data.text?.trim() || '';
            console.log('[VC] OpenAI STT:', JSON.stringify(text));
          }
        } catch (e) {
          console.warn('[VC] OpenAI STT failed:', e.message);
        }
      }

      if (!text) {
        console.warn('[VC] All STT returned empty.');
        this.flashWaveMessage('Hech narsa eshitilmadi, qaytadan urinib ko\'ring.');
        return false;
      }

      // ── Matn filtri ──
      const words = text.trim().split(/\s+/).filter(w => w.length > 0);

      const hasLetters = /[a-zA-Z\u0400-\u04FF\u0600-\u06FF]/.test(text);
      if (!hasLetters) { this.flashWaveMessage('Yana gapiring...'); return false; }

      if (words.length < 1) { this.flashWaveMessage('Yana gapiring...'); return false; }

      const FILLERS = new Set(['a','an','the','ok','okay','um','uh','hmm','hm','ah','oh','yeah','yes','hi','hey','hello','ha','yo','va','bu','u','e','ey','da','net','nu','ey']);
      const nonFiller = words.filter(w => !FILLERS.has(w.toLowerCase().replace(/[.,!?;]+$/,'')));
      if (nonFiller.length === 0) { this.flashWaveMessage('Yana gapiring...'); return false; }

      const meaningful = words.filter(w => w.replace(/[^a-zA-Z\u0400-\u04FF\u0600-\u06FF]/g,'').length >= 3);
      if (meaningful.length === 0) { this.flashWaveMessage('Yana gapiring...'); return false; }

      console.log('[VC] STT accepted:', JSON.stringify(text));

      // Input ga qo'y va jo'nat
      UIController.els.inp.value = text;
      resize(UIController.els.inp);
      AppState.isVoiceInput = true;

      // Agar ChatController band bo'lsa, bo'shashini kutamiz (maks 15s)
      let busyWaited = 0;
      while (AppState.isBusy && busyWaited < 15000) {
        await new Promise(r => setTimeout(r, 200));
        busyWaited += 200;
      }
      if (AppState.isBusy) {
        console.warn('[VC] ChatController is busy — voice message dropped after wait');
        this.flashWaveMessage('Tizim band, keyinroq urinib ko\'ring.');
        return false;
      }

      await ChatController.sendMessage();
      return true;

    } catch (err) {
      console.error('[VC] transcribeAudio error:', err);
      this.flashWaveMessage('STT xato: ' + err.message.slice(0, 50));
    } finally {
      this.isTranscribing = false;
      this.updateUI(this.isSessionActive);

      // Transcribe tugagach — agar sessiya davom etayapti va yozish to'xtagan bo'lsa qayta boshlash
      // Bu resumeIfNeeded ga qo'shimcha himoya
      if (this.isSessionActive && !this.isListening && !this._startingRecording && !this.isPlaying && !this.isStreamActive) {
        console.log('[VC] transcribeAudio finally: restarting recording immediately');
        try {
          await this.startRecording();
        } catch (e) {
          console.warn('[VC] restart after transcribe failed:', e);
        }
      }
    }
    return false;
  },

  // ═══════════════════════════════════════
  //  TTS — Matn → Ovoz
  // ═══════════════════════════════════════
  async play(text) {
    if (!text) return;
    const hasTTS = AppState.apiKeys.ttsEleven || AppState.apiKeys.ttsUnreal || AppState.apiKeys.ttsGemini || AppState.apiKeys.ttsOpenai || AppState.apiKeys.ttsAi;
    if (!hasTTS) return;

    const clean = this.cleanForSpeech(text);
    if (!clean) return;

    this.isPlaying = true;
    this.updateUI(true);

    if (AppState.apiKeys.ttsEleven) {
      await this.speakWithElevenLabs(clean);
    } else if (AppState.apiKeys.ttsUnreal) {
      await this.speakWithUnrealSpeech(clean);
    } else if (AppState.apiKeys.ttsOpenai) {
      await this.speakWithOpenAI(clean);
    } else if (AppState.apiKeys.ttsAi) {
      await this.speakWithTTSAI(clean);
    } else if (AppState.apiKeys.ttsGemini) {
      await this.speakWithGemini(clean);
    }

    this.isPlaying = false;
    this.updateUI(this.isSessionActive);
  },

  async speakWithElevenLabs(text) {
    const key = AppState.apiKeys.ttsEleven;
    if (!key) return;
    try {
      const voiceId = '21m00Tcm4TlvDq8ikWAM';
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      });
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.playbackContext = ctx;
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      await new Promise((resolve, reject) => {
        const source = ctx.createBufferSource();
        this.playbackSource = source;
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = resolve;
        source.onerror = reject;
        source.start();
      });
    } catch (err) {
      console.error('[VC] ElevenLabs error:', err.message);
    } finally {
      if (this.playbackContext) { this.playbackContext.close().catch(() => {}); this.playbackContext = null; }
      this.playbackSource = null;
    }
  },

  async speakWithGemini(text) {
    const key = AppState.apiKeys.ttsGemini;
    if (!key) return;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.TTS_MODEL}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Say this naturally: ${text}` }] }],
            generationConfig: {
              response_modalities: ['AUDIO'],
              speech_config: { voice_config: { prebuilt_voice_config: { voice_name: 'Aoede' } } }
            }
          })
        }
      );
      if (!res.ok) throw new Error(`Gemini TTS ${res.status}`);
      const data = await res.json();
      const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data;
      if (!audioData) return;
      const bytes = this.base64ToBytes(audioData);
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.playbackContext = ctx;
      let buffer;
      try {
        buffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      } catch {
        const sampleRate = 24000;
        const samples = bytes.length / 2;
        buffer = ctx.createBuffer(1, samples, sampleRate);
        const channel = buffer.getChannelData(0);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < samples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
      }
      await new Promise(resolve => {
        const source = ctx.createBufferSource();
        this.playbackSource = source;
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = resolve;
        source.start();
      });
    } catch (err) {
      console.warn('[VC] Gemini TTS failed:', err.message);
    } finally {
      if (this.playbackContext) { this.playbackContext.close().catch(() => {}); this.playbackContext = null; }
    }
  },

  async speakWithUnrealSpeech(text) {
    const key = AppState.apiKeys.ttsUnreal;
    if (!key) return;
    try {
      const res = await fetch('https://api.v8.unrealspeech.com/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ Text: text, VoiceId: 'Sierra', Bitrate: '192k', Speed: '0', Pitch: '1', TimestampType: 'sentence' }),
      });
      if (!res.ok) throw new Error(`Unreal Speech ${res.status}`);
      const data = await res.json();
      const audioUrl = data.OutputUri;
      if (!audioUrl) throw new Error('No OutputUri');
      const audioRes = await fetch(audioUrl);
      const arrayBuffer = await audioRes.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.playbackContext = ctx;
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      await new Promise((resolve, reject) => {
        const source = ctx.createBufferSource();
        this.playbackSource = source;
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = resolve;
        source.onerror = reject;
        source.start();
      });
    } catch (err) {
      console.error('[VC] Unreal Speech error:', err.message);
    } finally {
      if (this.playbackContext) { this.playbackContext.close().catch(() => {}); this.playbackContext = null; }
      this.playbackSource = null;
    }
  },

  async _ttsAiGenerate(text) {
    const key = AppState.apiKeys.ttsAi;
    if (!key) return null;
    const res = await fetch('https://api.tts.ai/v1/tts/', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: 'af_bella', model: 'kokoro', format: 'mp3' }),
    });
    if (!res.ok) throw new Error(`TTS AI ${res.status}`);
    const data = await res.json();
    const uuid = data.uuid;
    let result, waited = 0;
    while (waited < 15000) {
      await new Promise(r => setTimeout(r, 400));
      waited += 400;
      const pollRes = await fetch(`https://api.tts.ai/v1/speech/results/?uuid=${uuid}`, { headers: { 'Authorization': `Bearer ${key}` } });
      result = await pollRes.json();
      if (result.status === 'completed') break;
      if (result.status === 'failed') throw new Error('TTS AI failed');
    }
    if (result?.status !== 'completed') throw new Error('TTS AI timeout');
    const audioRes = await fetch(result.result_url);
    return await audioRes.arrayBuffer();
  },

  async _playArrayBuffer(arrayBuffer) {
    if (!arrayBuffer) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.playbackContext = ctx;
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    await new Promise((resolve, reject) => {
      const source = ctx.createBufferSource();
      this.playbackSource = source;
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = resolve;
      source.onerror = reject;
      source.start();
    });
    ctx.close().catch(() => {});
    this.playbackContext = null;
    this.playbackSource = null;
  },

  async speakWithOpenAI(text) {
    const key = AppState.apiKeys.ttsOpenai;
    if (!key) return;
    try {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', input: text, voice: 'alloy' }),
      });
      if (!res.ok) throw new Error(`OpenAI TTS ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.playbackContext = ctx;
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      await new Promise((resolve, reject) => {
        const source = ctx.createBufferSource();
        this.playbackSource = source;
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = resolve;
        source.onerror = reject;
        source.start();
      });
    } catch (err) {
      console.error('[VC] OpenAI TTS error:', err.message);
    } finally {
      if (this.playbackContext) { this.playbackContext.close().catch(() => {}); this.playbackContext = null; }
      this.playbackSource = null;
    }
  },

  async speakWithTTSAI(text) {
    try {
      const buf = await this._ttsAiGenerate(text);
      await this._playArrayBuffer(buf);
    } catch (err) {
      console.error('[VC] TTS AI failed:', err.message);
    }
  },

  // ═══════════════════════════════════════
  //  STREAM SPEECH
  // ═══════════════════════════════════════
  beginSpeechStream() {
    this.stopPlayback();
    this.isStreamActive = true;
    this.isPlaying = true;
    this.streamBuffer = '';
    this.playChain = Promise.resolve();
    this.updateUI(true);
  },

  feedSpeech(textChunk) {
    if (!this.isStreamActive || !textChunk) return;
    this.streamBuffer += textChunk;
    let match;
    while ((match = this.streamBuffer.match(/^([^.!?\n]*[.!?\n]+)/))) {
      const sentence = match[1];
      this.streamBuffer = this.streamBuffer.slice(sentence.length);
      const clean = this.cleanForSpeech(sentence);
      if (clean.length > 5) this.enqueueSentence(clean);
    }
    if (this.streamBuffer.length > 200) {
      const chunk = this.streamBuffer;
      this.streamBuffer = '';
      const clean = this.cleanForSpeech(chunk);
      if (clean) this.enqueueSentence(clean);
    }
  },

  async endSpeechStream() {
    if (!this.isStreamActive) return;
    if (this.streamBuffer.trim()) {
      const clean = this.cleanForSpeech(this.streamBuffer);
      if (clean) this.enqueueSentence(clean);
      this.streamBuffer = '';
    }
    await this.playChain.catch(e => console.warn('Stream end error:', e));
    this.isStreamActive = false;
    this.isPlaying = false;
    this.updateUI(this.isSessionActive);
  },

  enqueueSentence(sentence) {
    const genPromise = AppState.apiKeys.ttsAi && !AppState.apiKeys.ttsEleven && !AppState.apiKeys.ttsUnreal && !AppState.apiKeys.ttsOpenai
      ? this._ttsAiGenerate(sentence).catch(() => null)
      : null;
    this.playChain = this.playChain.then(async () => {
      if (!this.isStreamActive) return;
      try {
        if (AppState.apiKeys.ttsEleven) await this.speakWithElevenLabs(sentence);
        else if (AppState.apiKeys.ttsUnreal) await this.speakWithUnrealSpeech(sentence);
        else if (AppState.apiKeys.ttsOpenai) await this.speakWithOpenAI(sentence);
        else if (AppState.apiKeys.ttsAi) { const buf = await genPromise; if (this.isStreamActive && buf) await this._playArrayBuffer(buf); }
        else if (AppState.apiKeys.ttsGemini) await this.speakWithGemini(sentence);
      } catch (e) { console.warn('[VC] enqueueSentence error:', e); }
    });
  },

  stopPlayback(resetState = true) {
    this.isStreamActive = false;
    this.streamBuffer = '';
    this.playChain = Promise.resolve();
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    if (this.playbackSource) { try { this.playbackSource.stop(); } catch (e) {} this.playbackSource = null; }
    if (this.playbackContext) { this.playbackContext.close().catch(() => {}); this.playbackContext = null; }
    if (this.streamSource) { try { this.streamSource.stop(); } catch (e) {} this.streamSource = null; }
    if (this.streamCtx) { this.streamCtx.close().catch(() => {}); this.streamCtx = null; }
    this.streamAnalyser = null;
    if (resetState) {
      this.isPlaying = false;
    }
  },

  cleanForSpeech(text) {
    return String(text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[*#_`>~|]/g, ' ')
      .replace(/━+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  // ═══════════════════════════════════════
  //  resumeIfNeeded — AI gapib bo'lgach mic qaytarish
  // ═══════════════════════════════════════
  async resumeIfNeeded() {
    if (!this.isSessionActive) return;

    // isPlaying/isStreamActive/isTranscribing tugaguncha kutamiz
    let waited = 0;
    while ((this.isTranscribing || this.isPlaying || this.isStreamActive) && waited < 30000) {
      await new Promise(r => setTimeout(r, 100));
      waited += 100;
    }

    if (!this.isSessionActive) return;
    if (this.isListening) return; // allaqachon yozayapti

    console.log('[VC] resumeIfNeeded: 3s kutilmoqda...');
    await new Promise(r => setTimeout(r, 3000));

    if (!this.isSessionActive) return;
    if (this.isListening || this._startingRecording) return;

    console.log('[VC] resumeIfNeeded: startRecording');
    try {
      await this.startRecording();
    } catch (err) {
      console.warn('[VC] resumeIfNeeded: failed:', err);
    }
  },

  // ═══════════════════════════════════════
  //  UTILITY
  // ═══════════════════════════════════════
  async blobToWav(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
    let audioBuffer;
    try { audioBuffer = await tmpCtx.decodeAudioData(arrayBuffer); }
    finally { tmpCtx.close().catch(() => {}); }
    const numCh = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const samples = audioBuffer.length;
    const dataSize = samples * numCh * 2;
    const wavBuf = new ArrayBuffer(44 + dataSize);
    const v = new DataView(wavBuf);
    const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true);
    str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, numCh, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * numCh * 2, true); v.setUint16(32, numCh * 2, true);
    v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, dataSize, true);
    let off = 44;
    for (let i = 0; i < samples; i++) {
      for (let ch = 0; ch < numCh; ch++) {
        const s = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([wavBuf], { type: 'audio/wav' });
  },

  async blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
    }
    return btoa(binary);
  },

  base64ToBytes(base64) {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  },

  // ═══════════════════════════════════════
  //  UI
  // ═══════════════════════════════════════
  currentStateName(active) {
    if (!active) return 'off';
    if (this.isPlaying || this.isStreamActive) return 'speaking';
    if (this.isTranscribing) return 'processing';
    if (this.isListening) return 'listening';
    return 'idle';
  },

  updateUI(active) {
    const state = this.currentStateName(active);
    this.updateMicButton(active, state);
    this.updateWavePanel(active, state);
  },

  updateMicButton(active, state) {
    const btn = document.getElementById('voiceBtn');
    if (!btn) return;
    btn.classList.toggle('session-active', !!active);
    const tooltips = { listening: 'Tinglayapti…', speaking: 'AI gapiryapti…', processing: 'Qayta ishlanmoqda…', idle: 'Sessiya faol…', off: 'Use voice mode' };
    btn.setAttribute('data-tooltip', tooltips[state] || tooltips.off);
    const palette = {
      listening:  { color: '#ef4444', background: '#fee2e2', shadow: 'rgba(239,68,68,0.25)' },
      speaking:   { color: '#3b82f6', background: '#dbeafe', shadow: 'rgba(59,130,246,0.25)' },
      processing: { color: '#d97706', background: '#fef3c7', shadow: 'rgba(217,119,6,0.2)' },
      idle:       { color: '#ef4444', background: '#fee2e2', shadow: 'rgba(239,68,68,0.15)' },
    };
    const p = palette[state];
    if (p) {
      btn.style.color = p.color;
      btn.style.background = p.background;
      btn.style.boxShadow = `0 0 0 3px ${p.shadow}`;
    } else {
      btn.style.color = btn.style.background = btn.style.boxShadow = '';
    }
  },

  updateWavePanel(active, state) {
    const panel = document.getElementById('voiceWavePanel');
    const status = document.getElementById('voiceWaveStatus');
    if (!panel) return;
    if (!active) { this.hideWavePanel(); return; }
    panel.classList.remove('hidden');
    panel.classList.remove('state-listening', 'state-speaking', 'state-processing', 'state-idle');
    panel.classList.add(`state-${state}`);
    if (this._waveFlashUntil && Date.now() < this._waveFlashUntil) return;
    const labels = { listening: 'Tinglayapti…', speaking: 'Gapiryapti…', processing: 'Qayta ishlanmoqda…', idle: 'Tayyor — gapirishni boshlang' };
    if (status) status.textContent = labels[state] || '';
  },

  flashWaveMessage(message, durationMs = 3000) {
    const status = document.getElementById('voiceWaveStatus');
    const panel = document.getElementById('voiceWavePanel');
    if (!status || !panel) return;
    this._waveFlashUntil = Date.now() + durationMs;
    status.textContent = message;
    panel.classList.add('state-processing');
    setTimeout(() => {
      this._waveFlashUntil = 0;
      this.updateUI(this.isSessionActive);
    }, durationMs);
  },

  showWavePanel() {
    const panel = document.getElementById('voiceWavePanel');
    const wrapper = document.getElementById('inputAreaWrapper');
    if (panel) panel.classList.remove('hidden');
    if (wrapper) wrapper.classList.add('voice-hidden');
  },

  hideWavePanel() {
    const panel = document.getElementById('voiceWavePanel');
    const wrapper = document.getElementById('inputAreaWrapper');
    if (panel) panel.classList.add('hidden');
    if (wrapper) wrapper.classList.remove('voice-hidden');
  },

  // ── Waveform ──
  initWaveCanvas() {
    const canvas = document.getElementById('voiceWaveCanvas');
    if (!canvas) return;
    this.waveCanvas = canvas;
    this.waveCtx2d = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 72;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    this.waveCtx2d.scale(dpr, dpr);
    this.waveCanvasCssSize = { w, h };
    this.waveBars = new Array(40).fill(0.06);
  },

  startWaveLoop() {
    if (this.waveRafId) return;
    const tick = () => {
      if (!this.isSessionActive) { this.waveRafId = null; return; }
      this.drawWaveFrame();
      this.waveRafId = requestAnimationFrame(tick);
    };
    this.waveRafId = requestAnimationFrame(tick);
  },

  stopWaveLoop() {
    if (this.waveRafId) { cancelAnimationFrame(this.waveRafId); this.waveRafId = null; }
  },

  readWaveLevels() {
    if (!this.waveBars) return null;
    let src = null;
    if (this.isListening && this.analyser) src = this.analyser;
    else if ((this.isPlaying || this.isStreamActive) && this.streamAnalyser) src = this.streamAnalyser;
    if (!src) return null;
    const freqData = new Uint8Array(src.frequencyBinCount);
    src.getByteFrequencyData(freqData);
    const n = this.waveBars.length;
    const step = Math.max(1, Math.floor(freqData.length / n));
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += freqData[i * step + j] || 0;
      this.waveBars[i] = sum / step / 255;
    }
    return this.waveBars;
  },

  drawWaveFrame() {
    const ctx2d = this.waveCtx2d;
    if (!ctx2d || !this.waveBars) return;
    const { w, h } = this.waveCanvasCssSize || { w: 640, h: 72 };
    const bars = this.waveBars;
    const live = this.readWaveLevels();
    const breathing = 0.12 + 0.05 * Math.sin(Date.now() / 600);
    for (let i = 0; i < bars.length; i++) {
      const target = live ? Math.max(0.05, live[i]) : breathing;
      bars[i] += (target - bars[i]) * (live ? 0.35 : 0.08);
    }
    ctx2d.clearRect(0, 0, w, h);
    const colorByState = { listening: '#ef4444', speaking: '#3b82f6', processing: '#d97706', idle: '#9ca3af', off: '#9ca3af' };
    ctx2d.fillStyle = colorByState[this.currentStateName(this.isSessionActive)] || '#9ca3af';
    const gap = 4;
    const barW = (w - gap * (bars.length - 1)) / bars.length;
    const midY = h / 2;
    for (let i = 0; i < bars.length; i++) {
      const barH = Math.max(3, bars[i] * h * 0.9);
      const x = i * (barW + gap);
      const y = midY - barH / 2;
      this._roundRect(ctx2d, x, y, barW, barH, barW / 2);
    }
  },

  _roundRect(ctx2d, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx2d.beginPath();
    ctx2d.moveTo(x + radius, y);
    ctx2d.arcTo(x + w, y, x + w, y + h, radius);
    ctx2d.arcTo(x + w, y + h, x, y + h, radius);
    ctx2d.arcTo(x, y + h, x, y, radius);
    ctx2d.arcTo(x, y, x + w, y, radius);
    ctx2d.closePath();
    ctx2d.fill();
  },
};

AppState.isVoiceInput = false;
window.playVoice = (text) => VoiceController.play(text);