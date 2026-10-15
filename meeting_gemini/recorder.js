/* 녹음기: 소음 억제 요청, 조각 단위 자동 저장, 일시정지, 화면 꺼짐 방지.
 *
 * 소음 대응
 *   1) 마이크를 열 때 브라우저 내장 소음 억제 · 에코 제거 · 자동 음량 조절을 켠다.
 *      (마이크 단계에서 적용되므로 녹음 경로에 따로 손대지 않는다)
 *   2) 시작 직후 말소리와 배경 소음의 차이를 재서 환경이 나쁘면 화면에 알려 준다.
 * 녹음 경로에 추가 필터를 넣어 봤지만 받아쓰기 정확도가 오히려 떨어져서 뺐다.
 * 겹쳐서 말하는 소리나 아주 큰 소음은 없애지 못한다. 마이크를 입 가까이 두는 게 가장 효과가 크다. */
(function () {
  const MA = (window.MA = window.MA || {});

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const m of cands) if (MediaRecorder.isTypeSupported(m)) return m;
    return '';
  }

  class Recorder {
    static supported() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    }

    constructor(opts) {
      this.o = Object.assign({
        segmentSec: 1800, noise: true, wakeLock: true,
        onLevel() {}, onTick() {}, onSegment() {}, onNoise() {},
      }, opts);
      this.segs = [];
      this.state = 'idle';
      this.totalMs = 0;
      this._pending = [];
      this._levels = [];
      this._noiseSent = 0;
    }

    async start(sid) {
      this.sid = sid;
      const o = this.o;
      this.stream = o.stream || await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: o.noise, noiseSuppression: o.noise, autoGainControl: o.noise },
      });
      const track = this.stream.getAudioTracks()[0];
      this.applied = track && track.getSettings ? track.getSettings() : {};

      this.recStream = this.stream; // 녹음은 마이크 스트림을 그대로 쓴다
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        if (this.ctx.resume) await this.ctx.resume();
        this.analyser = this.ctx.createAnalyser(); // 소리 크기 표시와 소음 측정에만 쓴다
        this.analyser.fftSize = 1024;
        this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
        const mute = this.ctx.createGain(); // 일부 브라우저는 출력에 연결돼야 분석이 돈다 (소리는 나지 않는다)
        mute.gain.value = 0;
        this.analyser.connect(mute);
        mute.connect(this.ctx.destination);
        this._buf = new Float32Array(this.analyser.fftSize);
      } catch (e) {
        this.analyser = null; // 분석이 안 돼도 녹음은 계속된다
      }

      this.mime = pickMime();
      if (this.mime === null) throw new Error('이 브라우저는 녹음을 지원하지 않아요.');
      this._startSeg();
      this.state = 'recording';
      this._last = performance.now();
      this._timer = setInterval(() => this._tick(), 250);
      this._meter = setInterval(() => this._level(), 100);
      this._lockScreen();
      this._vis = () => { if (document.visibilityState === 'visible' && this.state !== 'idle') this._lockScreen(); };
      document.addEventListener('visibilitychange', this._vis);
    }

    _startSeg() {
      const idx = this.segs.length;
      const opt = { audioBitsPerSecond: 32000 };
      if (this.mime) opt.mimeType = this.mime;
      const rec = new MediaRecorder(this.recStream, opt);
      const seg = { idx, mime: rec.mimeType || this.mime || 'audio/webm', activeMs: 0, n: 0, bytes: 0, durationSec: 0 };
      this.segs.push(seg);
      this.cur = { rec, seg };
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) {
          const n = seg.n++;
          seg.bytes += e.data.size;
          this._pending.push(MA.store.putChunk(this.sid, idx, n, e.data));
        }
      };
      rec.start(5000); // 5초마다 저장 → 갑자기 닫혀도 마지막 5초만 잃는다
    }

    async _endSeg() {
      const { rec, seg } = this.cur;
      await new Promise((res) => {
        rec.onstop = res;
        if (rec.state !== 'inactive') rec.stop(); else res();
      });
      await Promise.all(this._pending);
      this._pending = [];
      seg.durationSec = Math.round(seg.activeMs / 100) / 10;
      this.o.onSegment(seg);
    }

    async _tick() {
      if (this.state !== 'recording' || this._busy) return;
      const now = performance.now();
      const d = now - this._last;
      this._last = now;
      this.cur.seg.activeMs += d;
      this.totalMs += d;
      this.o.onTick(this.totalMs / 1000);
      if (this.cur.seg.activeMs >= this.o.segmentSec * 1000) {
        this._busy = true; // 조각 전환: 같은 마이크 스트림에서 새 파일을 이어서 시작
        try { await this._endSeg(); this._startSeg(); } finally { this._busy = false; this._last = performance.now(); }
      }
    }

    _level() {
      if (!this.analyser || this.state === 'idle') return;
      this.analyser.getFloatTimeDomainData(this._buf);
      let sum = 0;
      for (let i = 0; i < this._buf.length; i++) sum += this._buf[i] * this._buf[i];
      const rms = Math.sqrt(sum / this._buf.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-6));
      this.o.onLevel(this.state === 'paused' ? 0 : Math.min(1, Math.max(0, (db + 60) / 50)), db);
      if (this.state !== 'recording' || this._noiseSent >= 2) return;
      this._ticks = (this._ticks || 0) + 1;
      if (db > -100) this._levels.push(db); // 완전 무음(디지털 0)은 제외
      if (this._ticks !== 40 && this._ticks !== 100) return; // 약 4초, 10초 시점에 판단
      const sorted = [...this._levels].sort((a, b) => a - b);
      if (sorted.length < 10 || sorted[sorted.length - 1] < -58) { if (this._ticks === 100) this._noiseSent = 2; return this.o.onNoise('silent', null); }
      if (this._ticks === 40) return; // 말소리가 확인되면 10초 시점에 한 번만 더 판단
      this._noiseSent = 2;
      // 자동 음량 조절이 소리 크기를 바꾸므로 절대 크기 대신 '말소리와 배경 소음의 차이(dB)'로 본다
      const floor = sorted[Math.floor(sorted.length * 0.1)];
      const speech = sorted[Math.floor(sorted.length * 0.9)];
      const snr = speech - floor;
      this.noiseSnr = snr;
      this.o.onNoise(snr >= 25 ? 'quiet' : snr >= 14 ? 'normal' : 'loud', snr);
    }

    pause() {
      if (this.state !== 'recording') return;
      try { this.cur.rec.pause(); } catch (e) { /* 일부 브라우저는 미지원 */ }
      this.state = 'paused';
    }

    resume() {
      if (this.state !== 'paused') return;
      try { this.cur.rec.resume(); } catch (e) { /* 무시 */ }
      this.state = 'recording';
      this._last = performance.now();
    }

    async _lockScreen() {
      try {
        if (this.o.wakeLock && navigator.wakeLock) this._wl = await navigator.wakeLock.request('screen');
      } catch (e) { /* 지원하지 않거나 거부됨 */ }
    }

    async stop() {
      if (this.state === 'idle') return { segments: this.segs, durationSec: this.totalMs / 1000 };
      this.state = 'idle';
      clearInterval(this._timer);
      clearInterval(this._meter);
      document.removeEventListener('visibilitychange', this._vis);
      while (this._busy) await new Promise((r) => setTimeout(r, 50));
      await this._endSeg();
      this.stream.getTracks().forEach((t) => t.stop());
      try { if (this.ctx) await this.ctx.close(); } catch (e) { /* 무시 */ }
      try { if (this._wl) await this._wl.release(); } catch (e) { /* 무시 */ }
      return { segments: this.segs, durationSec: this.totalMs / 1000 };
    }

    /** 저장하지 않고 즉시 중단 (취소) */
    async abort() {
      this.state = 'idle';
      clearInterval(this._timer);
      clearInterval(this._meter);
      document.removeEventListener('visibilitychange', this._vis);
      try { if (this.cur && this.cur.rec.state !== 'inactive') this.cur.rec.stop(); } catch (e) { /* 무시 */ }
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      try { if (this.ctx) await this.ctx.close(); } catch (e) { /* 무시 */ }
      try { if (this._wl) await this._wl.release(); } catch (e) { /* 무시 */ }
    }
  }

  MA.Recorder = Recorder;
})();
