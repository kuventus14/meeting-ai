/* 요약 프롬프트, 결과 정리, 숫자·날짜 추출, 내보내기용 마크다운.
 * 두 엔진(Gemini·OpenAI)이 같은 프롬프트와 같은 결과 형식을 쓴다. */
(function () {
  const MA = (window.MA = window.MA || {});

  MA.AppError = class AppError extends Error {
    constructor(message, opts) {
      super(message);
      this.code = (opts && opts.code) || 'error'; // auth | quota | busy | size | network | bad | error
      this.retryable = !!(opts && opts.retryable);
    }
  };

  MA.TRANSCRIBE_PROMPT =
    '이 오디오의 한국어 음성을 들리는 그대로 정확히 받아쓰세요. ' +
    '날짜, 금액, 수량은 아라비아 숫자로 적으세요. ' +
    '요약, 설명, 번역, 머리말, 시간 표시, 화자 표시 없이 받아쓴 글만 출력하세요. ' +
    '말소리가 전혀 없으면 아무것도 출력하지 마세요.';

  MA.SUMMARY_PROMPT =
    '당신은 회의 내용을 정리하는 비서입니다. 아래는 회의를 받아쓴 글이며 음성 인식 오류가 섞여 있을 수 있습니다.\n' +
    '규칙:\n' +
    '- 글에 없는 내용은 절대 지어내지 마세요. 확실하지 않으면 비워 두세요.\n' +
    '- 숫자, 날짜, 이름은 글에 나온 그대로 쓰세요.\n' +
    '- 한국어로 간결하게 쓰세요. 할 일의 담당자와 기한은 글에서 분명할 때만 적으세요.\n' +
    '다음 JSON 형식으로만 답하세요. 설명이나 코드 블록 표시는 쓰지 마세요.\n' +
    '{"title":"20자 이내 제목","topic":"핵심 주제 1~2문장","decisions":["결정된 것"],' +
    '"todos":[{"what":"할 일","who":"담당자 또는 빈 문자열","due":"기한 또는 빈 문자열"}],' +
    '"open":["아직 결정되지 않았거나 확인이 필요한 것"]}\n\n' +
    '--- 받아쓴 글 ---\n';

  /** 모델 응답에서 JSON을 꺼내 형식을 맞춘다. 실패하면 MA.AppError */
  MA.parseSummary = function (text) {
    const s = String(text || '');
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a < 0 || b <= a) throw new MA.AppError('요약 결과를 해석하지 못했어요. 다시 시도해 주세요.', { code: 'bad', retryable: true });
    let o;
    try { o = JSON.parse(s.slice(a, b + 1)); } catch (e) {
      throw new MA.AppError('요약 결과 형식이 올바르지 않아요. 다시 시도해 주세요.', { code: 'bad', retryable: true });
    }
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const arr = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
    return {
      title: str(o.title).slice(0, 40),
      topic: str(o.topic),
      decisions: arr(o.decisions),
      todos: (Array.isArray(o.todos) ? o.todos : [])
        .map((t) => (typeof t === 'string' ? { what: t.trim(), who: '', due: '' } : { what: str(t && t.what), who: str(t && t.who), due: str(t && t.due) }))
        .filter((t) => t.what),
      open: arr(o.open),
    };
  };

  MA.MERGE_PROMPT =
    '아래는 하나의 회의를 여러 부분으로 나눠 정리한 JSON 목록입니다. 하나의 회의 요약으로 합쳐 주세요.\n' +
    '중복은 한 번만 쓰고, 글에 없는 내용은 지어내지 마세요. 다음 JSON 형식으로만 답하세요.\n' +
    '{"title":"20자 이내 제목","topic":"핵심 주제 1~2문장","decisions":["결정된 것"],' +
    '"todos":[{"what":"할 일","who":"담당자 또는 빈 문자열","due":"기한 또는 빈 문자열"}],"open":["아직 결정되지 않은 것"]}\n\n' +
    '--- 부분별 요약 ---\n';

  /**
   * 엔진 공통 요약 흐름.
   * callText(prompt) 는 {text, model, costUsd} 를 돌려주는 엔진별 함수다.
   * 결과 형식이 깨지면 한 번 더 시도하고, 매우 긴 글은 나눠서 요약한 뒤 합친다.
   */
  MA.summarizeWith = async function (callText, transcript, opts) {
    opts = opts || {};
    let cost = 0, model = '';
    const run = async (prompt) => {
      let err;
      for (let i = 0; i < 2; i++) {
        const r = await callText(prompt);
        cost += r.costUsd || 0;
        model = r.model || model;
        try { return MA.parseSummary(r.text); } catch (e) { err = e; }
      }
      throw err;
    };
    const parts = MA.splitText(transcript, 120000);
    if (parts.length === 1) return { summary: await run(MA.SUMMARY_PROMPT + transcript), model, costUsd: cost };
    const partial = [];
    for (let i = 0; i < parts.length; i++) {
      if (opts.onStatus) opts.onStatus(`긴 회의를 나눠서 정리하는 중 (${i + 1}/${parts.length})`);
      partial.push(await run(MA.SUMMARY_PROMPT + parts[i]));
    }
    if (opts.onStatus) opts.onStatus('나눠서 정리한 내용을 합치는 중');
    return { summary: await run(MA.MERGE_PROMPT + JSON.stringify(partial)), model, costUsd: cost };
  };

  /** 아주 긴 글은 나눠서 요약한 뒤 합친다 (글자 수 기준) */
  MA.splitText = function (text, max) {
    if (text.length <= max) return [text];
    const parts = [];
    let cur = '';
    for (const para of text.split(/\n{2,}/)) {
      if ((cur + '\n\n' + para).length > max && cur) { parts.push(cur); cur = ''; }
      cur = cur ? cur + '\n\n' + para : para;
      while (cur.length > max) { parts.push(cur.slice(0, max)); cur = cur.slice(max); }
    }
    if (cur) parts.push(cur);
    return parts;
  };

  /* ---------- 숫자·날짜 ---------- */
  const NUM_RE = /\d{4}년(?:\s?\d{1,2}월)?(?:\s?\d{1,2}일)?|\d{1,2}월\s?\d{1,2}일|\d[\d,.]*(?:\s?(?:만\s?원|억\s?원|원|월|일|시간|시|분|초|명|%|퍼센트|개|건|번|주|달|년|회|차|안|장|대|곳|층|호|배|점|위|살|세|부|쪽|페이지|가지|프로|달러|엔))?/g;

  MA.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  /** 받아쓴 글 안의 숫자·날짜에 <mark>를 씌운 안전한 HTML */
  MA.highlightNumbers = function (text) {
    let out = '', last = 0, m;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(text))) {
      out += MA.esc(text.slice(last, m.index)) + '<mark>' + MA.esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    return out + MA.esc(text.slice(last));
  };

  /** 요약 안에 나온 숫자·날짜 목록 (중복 제거) */
  MA.numbersIn = function (sum) {
    const pool = [sum.topic, ...sum.decisions, ...sum.todos.map((t) => `${t.what} ${t.due}`), ...sum.open].join('\n');
    const seen = new Set();
    (pool.match(NUM_RE) || []).forEach((n) => seen.add(n.trim()));
    return [...seen];
  };

  /* ---------- 표시용 ---------- */
  MA.fmtDur = function (sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return `${h}시간 ${m}분`;
    if (m) return `${m}분${s && m < 10 ? ' ' + s + '초' : ''}`;
    return `${s}초`;
  };
  MA.fmtClock = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    return [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, '0')).join(':');
  };
  MA.fmtDate = function (iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  /** 공유·파일 저장용 마크다운 */
  MA.toMarkdown = function (s, withTranscript) {
    const sm = s.summary;
    const L = [];
    L.push(`# ${s.title || sm.title || '회의 요약'}`);
    L.push(`${MA.fmtDate(s.createdAt)} · 녹음 ${MA.fmtDur(s.durationSec || 0)}`, '');
    L.push('## 핵심 주제', sm.topic || '-', '');
    if (sm.decisions.length) L.push('## 결정된 것', ...sm.decisions.map((d) => `- ${d}`), '');
    if (sm.todos.length) {
      L.push('## 할 일', ...sm.todos.map((t) => `- [ ] ${t.what}${t.who || t.due ? ` (${[t.who, t.due].filter(Boolean).join(' · ')})` : ''}`), '');
    }
    if (sm.open.length) L.push('## 아직 정하지 못한 것', ...sm.open.map((d) => `- ${d}`), '');
    const nums = MA.numbersIn(sm);
    if (nums.length) L.push('## 숫자·날짜 (받아쓴 글에서 다시 확인하세요)', nums.join(', '), '');
    if (withTranscript && s.transcript) L.push('## 받아쓴 전체 글', s.transcript, '');
    L.push('---', '_Meeting AI 로 정리했어요. 숫자와 이름은 받아쓴 글과 대조해 확인해 주세요._');
    return L.join('\n');
  };

  MA.fileName = function (s, ext) {
    const d = new Date(s.createdAt);
    const p = (n) => String(n).padStart(2, '0');
    const stamp = isNaN(d) ? 'meeting' : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const t = (s.title || (s.summary && s.summary.title) || '회의').replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 40);
    return `${stamp} ${t}.${ext}`;
  };
})();
