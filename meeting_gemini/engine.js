/* Gemini 엔진: 받아쓰기 + 요약. 브라우저에서 구글 API 로 직접 호출한다(중간 서버 없음).
 *
 * 받아쓰기: 전용 모델이 혼잡하거나 무료 한도가 차면 범용 모델로 자동 전환한다.
 * 호출 방식은 문서의 Interactions API(v1beta/interactions)를 쓴다. */
(function () {
  const MA = (window.MA = window.MA || {});
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';
  // 무료 구간은 모델마다 한도와 혼잡 정도가 달라서, 품질이 좋은 순서로 시도하고 안 되면 다음 모델로 넘어간다.
  // 가벼운 모델(flash-lite)은 영어·고유 표현을 더 자주 틀려서 맨 뒤에 둔다.
  const TRANSCRIBE_MODELS = ['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
  const SUMMARY_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];
  const sleep = (ms, signal) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('중단', 'AbortError')); }, { once: true });
  });

  function toBase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] || '');
      r.onerror = () => rej(new MA.AppError('녹음 파일을 읽지 못했어요.', { code: 'bad' }));
      r.readAsDataURL(blob);
    });
  }

  function mimeFor(t) {
    const m = String(t || '').split(';')[0].trim().toLowerCase();
    if (m === 'audio/mp4' || m === 'video/mp4') return 'audio/m4a';
    if (m === 'video/webm') return 'audio/webm';
    if (m === 'audio/x-m4a') return 'audio/m4a';
    return m || 'audio/webm';
  }

  function extract(d) {
    const out = [];
    for (const st of d.steps || []) {
      if (st.type && st.type !== 'model_output') continue;
      for (const c of st.content || []) if (typeof c.text === 'string') out.push(c.text);
    }
    if (out.length) return out.join('\n').trim();
    if (Array.isArray(d.candidates) && d.candidates[0]) {
      return ((d.candidates[0].content || {}).parts || []).map((p) => p.text || '').join('').trim();
    }
    return '';
  }

  function mapError(status, msg) {
    const m = String(msg || '');
    if (status === 401 || status === 403 || /api key|api_key|permission|credential/i.test(m) && status < 500) {
      return new MA.AppError('API 키가 올바르지 않거나 권한이 없어요. 설정에서 키를 확인해 주세요.', { code: 'auth' });
    }
    if (status === 429) return new MA.AppError('무료 사용 한도에 걸렸어요. 잠시 뒤나 내일 다시 시도해 주세요.', { code: 'quota' });
    if (status === 413) return new MA.AppError('파일이 너무 커요.', { code: 'size' });
    if (status >= 500 || status === 408) return new MA.AppError('서버가 혼잡해요. 잠시 뒤 다시 시도해 주세요.', { code: 'busy', retryable: true });
    return new MA.AppError(`요청이 거절됐어요 (${status}). ${m.slice(0, 120)}`, { code: 'error' });
  }

  async function call(model, input, key, signal, timeoutMs) {
    const ac = new AbortController();
    let timedOut = false;
    const to = setTimeout(() => { timedOut = true; ac.abort(); }, timeoutMs);
    const onAbort = () => ac.abort();
    if (signal) {
      if (signal.aborted) ac.abort(); else signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      let res;
      try {
        res = await fetch(`${BASE}/interactions`, {
          method: 'POST', signal: ac.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ model, input }),
        });
      } catch (e) {
        if (e.name === 'AbortError') {
          if (timedOut) { const te = new MA.AppError('응답이 너무 늦어요.', { code: 'busy', retryable: true }); te.timeout = true; throw te; }
          throw e;
        }
        throw new MA.AppError('인터넷 연결을 확인해 주세요.', { code: 'network', retryable: true });
      }
      if (!res.ok) {
        let msg = '';
        try { msg = ((await res.json()).error || {}).message || ''; } catch (e) { /* 본문 없음 */ }
        throw mapError(res.status, msg);
      }
      let d;
      try { d = await res.json(); } catch (e) {
        if (timedOut) { const te = new MA.AppError('응답이 너무 늦어요.', { code: 'busy', retryable: true }); te.timeout = true; throw te; }
        throw e;
      }
      const text = extract(d);
      if (!text) throw new MA.AppError('빈 응답이 왔어요.', { code: 'busy', retryable: true });
      return text;
    } finally {
      clearTimeout(to);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * 모델을 차례로 시도한다. 모델마다 혼잡하면 한 번만 짧게 다시 시도하고 바로 다음 모델로 넘어간다.
   * 모든 모델이 안 되면 잠시 기다린 뒤 한 바퀴 더 돈다. 키 오류·파일 크기 오류는 바로 중단한다.
   */
  async function callModels(models, input, opts) {
    const key = MA.cfg.get('apiKey', '');
    if (!key) throw new MA.AppError('API 키를 먼저 설정해 주세요.', { code: 'auth' });
    const timeoutMs = opts.timeoutMs || 60000;
    let last;
    for (let pass = 0; pass < 2; pass++) {
      let allQuota = true;
      for (const model of models) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const text = await call(model, input, key, opts.signal, timeoutMs);
            return { text, model, costUsd: 0 };
          } catch (e) {
            if (e.name === 'AbortError' || e.code === 'auth' || e.code === 'size') throw e;
            last = e;
            if (e.code !== 'quota') allQuota = false;
            if (e.code === 'busy' && attempt === 0 && !e.timeout) {
              if (opts.onStatus) opts.onStatus(`${model} 이(가) 혼잡해서 잠시 뒤 다시 시도해요`);
              await sleep(3000, opts.signal);
              continue;
            }
            break;
          }
        }
        if (opts.onStatus && model !== models[models.length - 1]) opts.onStatus(`${model} 을(를) 쓸 수 없어서 다른 모델로 시도해요`);
      }
      if (allQuota || pass === 1) break;
      if (opts.onStatus) opts.onStatus('서버가 혼잡해요. 잠시 기다렸다가 다시 시도해요');
      await sleep(12000, opts.signal);
    }
    throw last;
  }

  const cleanText = (t) => t.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();

  MA.engine = {
    id: 'gemini',
    name: 'Google Gemini',
    short: 'Gemini',
    segmentSec: 1800,               // 30분마다 파일을 나눈다 (무료 한도가 '요청 수' 기준이라 크게 잡음)
    maxFileBytes: 14 * 1024 * 1024, // 인라인 전송 한도(20MB, base64 포함)보다 안전하게
    features: { credits: false },
    models: { transcribe: TRANSCRIBE_MODELS, summary: SUMMARY_MODELS },
    keyGuide: {
      title: 'Google Gemini 키 만들기',
      link: { label: 'Google AI Studio 열기', url: 'https://aistudio.google.com/apikey' },
      steps: [
        '위 버튼으로 Google AI Studio 를 열고 구글 계정으로 로그인해요.',
        '"Create API key"(API 키 만들기)를 눌러요.',
        '만들어진 키를 복사해서 아래 칸에 붙여넣고 "연결 테스트"를 눌러요.',
      ],
      notes: [
        '무료로 시작할 수 있어요. 하루 사용 한도가 있어요.',
        '무료 플랜은 입력한 내용이 구글 제품 개선에 쓰일 수 있어요. 민감한 회의는 결제를 연결한 유료 키를 쓰세요.',
        '키는 이 브라우저에만 저장돼요. 공용 컴퓨터에서는 쓰지 마세요.',
      ],
    },

    async validateKey(key) {
      try {
        const r = await fetch(`${BASE}/models?pageSize=1`, { headers: { 'x-goog-api-key': key } });
        if (r.ok) return { ok: true, message: '연결됐어요!' };
        if (r.status === 400 || r.status === 401 || r.status === 403) return { ok: false, invalid: true, message: '키가 올바르지 않아요. 다시 확인해 주세요.' };
        return { ok: false, message: `확인하지 못했어요 (${r.status}). 잠시 뒤 다시 시도해 주세요.` };
      } catch (e) {
        return { ok: false, message: '인터넷 연결을 확인해 주세요.' };
      }
    },

    async transcribe(blob, opts) {
      opts = opts || {};
      if (blob.size > this.maxFileBytes) throw new MA.AppError('파일이 너무 커요. 더 짧게 나눠 주세요.', { code: 'size' });
      const data = await toBase64(blob);
      const input = [
        { type: 'text', text: MA.TRANSCRIBE_PROMPT },
        { type: 'audio', data, mime_type: mimeFor(blob.type || opts.mime) },
      ];
      const r = await callModels(TRANSCRIBE_MODELS, input, Object.assign({}, opts, { timeoutMs: Math.min(600000, Math.max(45000, (opts.durationSec || 0) * 1500)) }));
      return { text: cleanText(r.text), model: r.model, costUsd: 0 };
    },

    async summarize(transcript, opts) {
      opts = opts || {};
      return MA.summarizeWith((prompt) => callModels(SUMMARY_MODELS, [{ type: 'text', text: prompt }], opts), transcript, opts);
    },
  };
})();
