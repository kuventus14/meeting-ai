/* OpenAI 엔진: 받아쓰기(gpt-4o-transcribe) + 요약(gpt-5-mini). 브라우저에서 OpenAI API 로 직접 호출한다.
 *
 * 크레딧: OpenAI 는 API 키로 잔액을 읽게 해 주지 않는다. 그래서 사용자가 입력한 잔액에서
 * 앱이 사용한 만큼을 빼며 남은 녹음 시간을 '추정'한다. 정확한 잔액은 OpenAI 결제 페이지에서 확인해야 한다. */
(function () {
  const MA = (window.MA = window.MA || {});
  const BASE = 'https://api.openai.com/v1';
  const TRANSCRIBE_MODEL = 'gpt-4o-transcribe';
  const SUMMARY_MODELS = ['gpt-5-mini', 'gpt-4.1-mini'];

  /** 가격표 (달러). 2026-10 기준 OpenAI 가격 페이지 값이며 화면의 '남은 시간' 추정에만 쓴다. */
  const PRICE = {
    transcribePerMin: 0.006,
    tokens: { 'gpt-5-mini': { in: 0.25, out: 2.0 }, 'gpt-4.1-mini': { in: 0.4, out: 1.6 } }, // 100만 토큰당
  };

  const sleep = (ms, signal) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('중단', 'AbortError')); }, { once: true });
  });

  function mapError(status, body) {
    const e = (body && body.error) || {};
    const code = e.code || '';
    const msg = String(e.message || '');
    if (status === 401) return new MA.AppError('API 키가 올바르지 않아요. 설정에서 키를 확인해 주세요.', { code: 'auth' });
    if (status === 403) return new MA.AppError('이 키로는 사용할 수 없어요. 키 권한이나 결제 상태를 확인해 주세요.', { code: 'auth' });
    if (status === 429 && (code === 'insufficient_quota' || /quota|billing|credit/i.test(msg))) {
      return new MA.AppError('크레딧이 부족해요. OpenAI 결제 페이지에서 충전한 뒤 이어서 정리할 수 있어요.', { code: 'quota' });
    }
    if (status === 429) return new MA.AppError('요청이 잠시 몰렸어요. 잠시 뒤 다시 시도해 주세요.', { code: 'busy', retryable: true });
    if (status === 413) return new MA.AppError('파일이 너무 커요.', { code: 'size' });
    if (status === 404 && /model/i.test(msg)) return new MA.AppError('사용할 수 없는 모델이에요.', { code: 'model' });
    if (status >= 500 || status === 408) return new MA.AppError('서버가 혼잡해요. 잠시 뒤 다시 시도해 주세요.', { code: 'busy', retryable: true });
    return new MA.AppError(`요청이 거절됐어요 (${status}). ${msg.slice(0, 120)}`, { code: 'error' });
  }

  async function api(path, init, key, signal, timeoutMs) {
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
        res = await fetch(BASE + path, Object.assign({}, init, { signal: ac.signal, headers: Object.assign({ Authorization: `Bearer ${key}` }, init.headers || {}) }));
      } catch (e) {
        if (e.name === 'AbortError') {
          if (timedOut) throw new MA.AppError('응답이 너무 늦어요.', { code: 'busy', retryable: true });
          throw e;
        }
        throw new MA.AppError('인터넷 연결을 확인해 주세요.', { code: 'network', retryable: true });
      }
      let body = null;
      try { body = await res.json(); } catch (e) {
        if (timedOut) throw new MA.AppError('응답이 너무 늦어요.', { code: 'busy', retryable: true });
      }
      if (!res.ok) throw mapError(res.status, body);
      return body;
    } finally {
      clearTimeout(to);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  async function withRetry(fn, opts) {
    const waits = [3000, 8000, 15000];
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) {
        if (e.name === 'AbortError' || !e.retryable || i >= waits.length) throw e;
        if (opts.onStatus) opts.onStatus(`서버가 혼잡해서 ${Math.round(waits[i] / 1000)}초 뒤 다시 시도해요 (${i + 1}/${waits.length})`);
        await sleep(waits[i], opts.signal);
      }
    }
  }

  function needKey() {
    const key = MA.cfg.get('apiKey', '');
    if (!key) throw new MA.AppError('API 키를 먼저 설정해 주세요.', { code: 'auth' });
    return key;
  }

  function fileNameFor(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('webm')) return 'audio.webm';
    if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'audio.m4a';
    if (m.includes('ogg')) return 'audio.ogg';
    if (m.includes('wav')) return 'audio.wav';
    if (m.includes('mpeg') || m.includes('mp3')) return 'audio.mp3';
    return 'audio.webm';
  }

  function outputText(d) {
    if (typeof d.output_text === 'string') return d.output_text;
    const out = [];
    for (const item of d.output || []) {
      if (item.type !== 'message') continue;
      for (const c of item.content || []) if (typeof c.text === 'string') out.push(c.text);
    }
    return out.join('\n').trim();
  }

  /** 요약 한 번 호출. 모델 목록을 차례로 시도한다. */
  async function summaryCall(prompt, opts) {
    const key = needKey();
    let last;
    for (const model of SUMMARY_MODELS) {
      const body = { model, input: prompt, text: { format: { type: 'json_object' } } };
      if (/^gpt-5/.test(model)) body.reasoning = { effort: 'low' }; // 요약은 깊이 생각할 필요가 없어서 빠르고 싸게
      try {
        const d = await withRetry(() => api('/responses', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }, key, opts.signal, 90000), opts);
        const text = outputText(d);
        if (!text) throw new MA.AppError('빈 응답이 왔어요.', { code: 'busy', retryable: true });
        const u = d.usage || {};
        const p = PRICE.tokens[model];
        const cost = p ? ((u.input_tokens || 0) * p.in + (u.output_tokens || 0) * p.out) / 1e6 : 0;
        return { text, model, costUsd: cost };
      } catch (e) {
        if (e.name === 'AbortError' || e.code === 'auth' || e.code === 'quota') throw e;
        last = e;
        if (opts.onStatus) opts.onStatus(`${model} 을(를) 쓸 수 없어서 다른 모델로 시도해요`);
      }
    }
    throw last;
  }

  MA.engine = {
    id: 'openai',
    name: 'OpenAI',
    short: 'OpenAI',
    segmentSec: 600,                 // 10분마다 파일을 나눈다 (받아쓰기 파일 한도 25MB 보다 훨씬 작다)
    maxFileBytes: 24 * 1024 * 1024,
    features: { credits: true },
    costPerHourUsd: 60 * PRICE.transcribePerMin + 0.012, // 1시간 녹음 = 받아쓰기 + 요약(약 1센트)
    models: { transcribe: [TRANSCRIBE_MODEL], summary: SUMMARY_MODELS },
    prices: PRICE,
    keyGuide: {
      title: 'OpenAI API 키 만들기',
      link: { label: 'OpenAI 플랫폼 열기', url: 'https://platform.openai.com/api-keys' },
      steps: [
        '위 버튼으로 OpenAI 플랫폼을 열고 로그인해요. (ChatGPT 구독과는 별개예요)',
        'Billing(결제)에서 카드를 등록하고 크레딧을 충전해요. 처음에는 $5 정도면 충분해요. "자동 충전"은 꺼 두세요.',
        'API keys 에서 "Create new secret key"로 키를 만들어 복사해요.',
        '아래 칸에 붙여넣고 "연결 테스트"를 눌러요.',
      ],
      notes: [
        '쓴 만큼만 크레딧에서 빠져나가요. 1시간 회의가 약 $0.37(약 500원)이에요.',
        '충전한 크레딧은 1년 뒤 사라지고, 환불은 원칙적으로 안 돼요.',
        '남은 크레딧은 앱 홈 화면에서 "잔액 입력"으로 알려 주면 남은 녹음 시간을 보여 드려요.',
        '키는 이 브라우저에만 저장돼요. 공용 컴퓨터에서는 쓰지 마세요.',
      ],
    },

    async validateKey(key) {
      try {
        const r = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (r.ok) return { ok: true, message: '연결됐어요! (크레딧이 남아 있는지는 결제 페이지에서 확인해 주세요)' };
        if (r.status === 401 || r.status === 403) return { ok: false, invalid: true, message: '키가 올바르지 않아요. 다시 확인해 주세요.' };
        return { ok: false, message: `확인하지 못했어요 (${r.status}). 잠시 뒤 다시 시도해 주세요.` };
      } catch (e) {
        return { ok: false, message: '인터넷 연결을 확인해 주세요.' };
      }
    },

    async transcribe(blob, opts) {
      opts = opts || {};
      const key = needKey();
      if (blob.size > this.maxFileBytes) throw new MA.AppError('파일이 너무 커요. 더 짧게 나눠 주세요.', { code: 'size' });
      const mime = blob.type || opts.mime || 'audio/webm';
      const durationSec = opts.durationSec || 0;
      const timeoutMs = Math.min(600000, Math.max(60000, durationSec * 1500));
      const d = await withRetry(() => {
        const fd = new FormData(); // 재시도마다 새로 만든다
        fd.append('file', new File([blob], fileNameFor(mime), { type: mime.split(';')[0] }));
        fd.append('model', TRANSCRIBE_MODEL);
        fd.append('language', 'ko');
        fd.append('response_format', 'json');
        return api('/audio/transcriptions', { method: 'POST', body: fd }, key, opts.signal, timeoutMs);
      }, opts);
      const text = String((d && d.text) || '').trim();
      return { text, model: TRANSCRIBE_MODEL, costUsd: (durationSec / 60) * PRICE.transcribePerMin };
    },

    async summarize(transcript, opts) {
      opts = opts || {};
      return MA.summarizeWith((prompt) => summaryCall(prompt, opts), transcript, opts);
    },
  };
})();
