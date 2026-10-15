/* 화면과 흐름. 엔진(MA.engine)은 engine.js 가 채운다 — Gemini 판과 OpenAI 판의 차이는 그 파일 하나뿐이다. */
(function () {
  const MA = window.MA;
  const E = MA.engine;
  const esc = MA.esc;
  const $app = document.getElementById('app');
  const BILLING_URL = 'https://platform.openai.com/settings/organization/billing/overview';

  const S = {
    view: 'home', cur: null, sessions: [], rec: null, recSession: null, recSaver: null,
    proc: null, noise: null, level: 0, folderPerm: false, keyMsg: null, welcomePick: null,
  };
  MA.app = { state: S }; // 점검용

  /* ---------- 작은 도구 ---------- */
  const T = () => MA.THEMES[MA.cfg.get('theme', 'bear')] || MA.THEMES.bear;
  const hasKey = () => !!MA.cfg.get('apiKey', '');
  const newId = () => 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const go = (v) => { S.view = v; render(); window.scrollTo(0, 0); };

  const I = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    back: I('<path d="M15 5l-7 7 7 7"/>'),
    share: I('<path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
    copy: I('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
    down: I('<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>'),
    file: I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
    pause: I('<path d="M8 5v14M16 5v14"/>'),
    play: I('<path d="M7 5l12 7-12 7z"/>'),
  };

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
  }

  /** 앱 안 대화상자. buttons: [{label, value, kind}] → 누른 버튼의 value 를 돌려준다 */
  function modal(title, html, buttons) {
    return new Promise((res) => {
      const root = document.getElementById('modal-root');
      root.innerHTML = `<div class="scrim" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet">
        <h3>${esc(title)}</h3><div>${html}</div>
        <div class="row wrap">${buttons.map((b, i) => `<button class="btn ${b.kind === undefined ? 'sec' : b.kind}" data-mv="${i}">${esc(b.label)}</button>`).join('')}</div>
      </div></div>`;
      const first = root.querySelector('input,button');
      if (first) first.focus();
      const done = (v) => { root.innerHTML = ''; res(v); };
      root.querySelectorAll('[data-mv]').forEach((b) => b.addEventListener('click', () => {
        const btn = buttons[+b.dataset.mv];
        done(typeof btn.value === 'function' ? btn.value(root) : btn.value);
      }));
    });
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { /* 무시 */ }
      ta.remove();
      return ok;
    }
  }

  /* ---------- OpenAI 판 전용: 크레딧 ---------- */
  const CR = {
    get() { return MA.cfg.get('credits', { balanceUsd: null, setAt: null }); },
    set(usd) { MA.cfg.set('credits', { balanceUsd: Math.max(0, usd), setAt: new Date().toISOString() }); },
    charge(usd) {
      const c = CR.get();
      if (c.balanceUsd == null || !usd) return;
      c.balanceUsd = Math.max(0, +(c.balanceUsd - usd).toFixed(6));
      MA.cfg.set('credits', c);
    },
    hours() {
      const c = CR.get();
      return c.balanceUsd == null || !E.costPerHourUsd ? null : c.balanceUsd / E.costPerHourUsd;
    },
  };
  const fmtHours = (h) => (h < 1 ? `${Math.max(0, Math.round(h * 60))}분` : `${h.toFixed(1)}시간`);

  function creditBox() {
    if (!E.features.credits) return '';
    const c = CR.get();
    if (c.balanceUsd == null) {
      return `<div class="credit"><span>남은 크레딧을 입력하면 몇 시간 더 녹음할 수 있는지 알려 드려요</span>
        <button class="btn small" data-act="credit-edit">잔액 입력</button></div>`;
    }
    const h = CR.hours();
    const low = h < 1;
    return `<div class="credit${low ? ' warn' : ''}" style="${low ? 'background:var(--hl);color:#141414' : ''}">
      <span>남은 크레딧 <b>$${c.balanceUsd.toFixed(2)}</b><br><small class="muted" style="${low ? 'color:#141414' : ''}">약 <b>${fmtHours(h)}</b> 분량 녹음 가능 (추정)</small></span>
      <button class="btn small sec" data-act="credit-edit">수정</button></div>`;
  }

  async function creditEdit() {
    const c = CR.get();
    const v = await modal('남은 크레딧 입력',
      `<p class="muted">OpenAI 는 앱이 잔액을 직접 읽도록 허용하지 않아요. 결제 페이지에서 확인한 잔액을 입력하면, 앱이 사용한 만큼 빼면서 남은 시간을 <b>추정</b>해 드려요. 가끔 다시 맞춰 주세요.</p>
       <p style="margin:10px 0"><a href="${BILLING_URL}" target="_blank" rel="noopener">OpenAI 결제 페이지에서 잔액 확인 ↗</a></p>
       <div class="field"><label for="cr-in">현재 잔액 (달러)</label><input id="cr-in" type="number" inputmode="decimal" min="0" step="0.01" placeholder="예: 5.00" value="${c.balanceUsd == null ? '' : c.balanceUsd.toFixed(2)}"></div>`,
      [{ label: '취소', value: null }, { label: '저장', kind: '', value: (r) => r.querySelector('#cr-in').value }]);
    if (v === null || v === '') return;
    const n = parseFloat(v);
    if (!isFinite(n) || n < 0) { toast('올바른 금액을 입력해 주세요'); return; }
    CR.set(n);
    toast('잔액을 저장했어요');
    render();
  }

  /* ---------- 폴더 자동 저장 (Chrome·Edge 데스크톱) ---------- */
  const FS = {
    supported: 'showDirectoryPicker' in window,
    async handle() { try { return await MA.store.metaGet('dir'); } catch (e) { return null; } },
    async choose() {
      const h = await window.showDirectoryPicker({ mode: 'readwrite' });
      await MA.store.metaSet('dir', h);
      MA.cfg.set('autoSave', true);
      return h.name;
    },
    async write(s) {
      const h = await FS.handle();
      if (!h) return 'none';
      const p = await h.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted') return 'perm';
      const fh = await h.getFileHandle(MA.fileName(s, 'md'), { create: true });
      const w = await fh.createWritable();
      await w.write(MA.toMarkdown(s, true));
      await w.close();
      return 'ok';
    },
    async grant() {
      const h = await FS.handle();
      return !!h && (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
    },
  };

  /* ---------- 데이터 ---------- */
  async function reload() { S.sessions = await MA.store.allSessions(); }
  const getS = (id) => S.sessions.find((s) => s.id === id);
  async function save(s) { await MA.store.putSession(s); const i = S.sessions.findIndex((x) => x.id === s.id); if (i >= 0) S.sessions[i] = s; else S.sessions.unshift(s); }

  /* ---------- 공통 조각 ---------- */
  function topbar(opts) {
    opts = opts || {};
    const t = T();
    const left = opts.back
      ? `<button class="icon-btn" data-act="go" data-v="${opts.back}" aria-label="뒤로">${ICON.back}</button><span class="brand">${esc(opts.title || '')}</span>`
      : `<span class="brand"><span class="mini">${MA.char(t.id, 'idle', 36)}</span>${esc(t.name)}</span>`;
    const right = opts.nav === false ? '' : `<div class="top-actions">
      <button class="icon-btn" data-act="go" data-v="history" aria-label="기록">${ICON.clock}</button>
      <button class="icon-btn" data-act="go" data-v="settings" aria-label="설정">${ICON.gear}</button></div>`;
    return `<div class="topbar">${left}${right}</div>`;
  }

  function wave(n) {
    return `<div class="wave" id="wave">${Array.from({ length: n }, (_, i) => `<i style="animation-duration:${(0.7 + ((i * 37) % 9) / 10).toFixed(2)}s;animation-delay:-${(((i * 53) % 10) / 10).toFixed(1)}s"></i>`).join('')}</div>`;
  }

  function statusTag(s) {
    if (s.status === 'done') return '';
    if (s.status === 'failed') return '<span class="tag fail">정리 실패</span>';
    if (s.status === 'recording') return '<span class="tag fail">녹음 중단됨</span>';
    return '<span class="tag">정리 전</span>';
  }

  function listItem(s) {
    const title = s.title || (s.summary && s.summary.title) || '(제목 없음)';
    return `<button class="item" data-act="open" data-id="${esc(s.id)}"><span><b>${esc(title)}</b><small>${esc(MA.fmtDate(s.createdAt))} · ${esc(MA.fmtDur(s.durationSec || 0))}</small></span>${statusTag(s)}</button>`;
  }

  /* ---------- 화면: 처음 (테마 고르기) ---------- */
  function viewWelcome() {
    const pick = S.welcomePick || MA.cfg.get('theme', null);
    return `<div class="stage" style="margin-top:12px"><h2 class="center">마음에 드는 화면을 골라 주세요</h2>
      <p class="muted center">기능은 모두 같아요. 나중에 설정에서 언제든 바꿀 수 있어요.</p></div>
      <div class="theme-grid">${MA.THEME_ORDER.map((id) => {
        const t = MA.THEMES[id];
        return `<button class="theme-card" data-act="pick-theme" data-id="${id}" aria-pressed="${pick === id}">
          <span class="thumb" style="background:${t.thumbBg}">${MA.char(id, 'idle', 60).replace('class="bob"', 'class=""')}</span>
          <span><b>${esc(t.name)}</b><small>${esc(t.tag)}</small></span></button>`;
      }).join('')}</div>
      <button class="btn" data-act="theme-next" ${pick ? '' : 'disabled'}>이 화면으로 시작</button>`;
  }

  /* ---------- 화면: API 키 설정 ---------- */
  function guideHtml() {
    const g = E.keyGuide;
    return `<div class="card"><h3>${esc(g.title)}</h3>
      <p style="margin:10px 0"><a class="btn small" style="display:inline-flex;text-decoration:none" href="${esc(g.link.url)}" target="_blank" rel="noopener">${esc(g.link.label)} ↗</a></p>
      <ol class="steps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <ul style="margin-top:12px;padding-left:18px;display:grid;gap:6px">${g.notes.map((n) => `<li class="muted">${esc(n)}</li>`).join('')}</ul></div>`;
  }

  function viewKey() {
    const m = S.keyMsg;
    return `${topbar({ back: hasKey() ? 'settings' : null, title: 'API 키 설정', nav: false })}
      ${hasKey() ? '' : '<h2>API 키를 연결해 주세요</h2><p class="muted">키는 이 브라우저에만 저장되고, 녹음은 이 앱이 AI 서비스로 직접 보내요.</p>'}
      ${guideHtml()}
      <div class="field"><label for="key-in">API 키 붙여넣기</label>
        <input id="key-in" type="password" autocomplete="off" spellcheck="false" placeholder="여기에 붙여넣어요"></div>
      ${m ? `<div class="banner ${m.ok ? '' : 'warn'}"><span>${esc(m.text)}</span></div>` : ''}
      <button class="btn" data-act="key-save">연결 테스트하고 저장</button>
      ${m && !m.ok && !m.invalid ? '<button class="btn ghost" data-act="key-force">테스트 없이 그냥 저장</button>' : ''}
      ${hasKey() ? '' : '<button class="btn ghost" data-act="go" data-v="home">나중에 할게요</button>'}`;
  }

  /* ---------- 화면: 홈 ---------- */
  function viewHome() {
    const t = T();
    const notes = [];
    if (!hasKey()) notes.push(`<div class="banner warn"><span>API 키를 먼저 설정해 주세요</span><button class="btn small" data-act="go" data-v="key">설정하기</button></div>`);
    const unfinished = S.sessions.filter((s) => s.status === 'recording');
    if (unfinished.length) notes.push(`<div class="banner warn"><span>끝나지 않은 녹음이 ${unfinished.length}개 있어요</span><button class="btn small" data-act="recover" data-id="${esc(unfinished[0].id)}">복구하기</button></div>`);
    const pending = S.sessions.filter((s) => s.status === 'recorded' || s.status === 'failed' || s.status === 'processing');
    if (pending.length) notes.push(`<div class="banner"><span>정리가 끝나지 않은 기록이 ${pending.length}개 있어요</span><button class="btn small" data-act="open" data-id="${esc(pending[0].id)}">이어서 정리</button></div>`);
    const done = S.sessions.filter((s) => s.status === 'done');
    const last = MA.cfg.get('lastBackupAt', null);
    if (done.length && (!last || Date.now() - new Date(last) > 7 * 864e5)) {
      notes.push(`<div class="banner"><span>${last ? '백업한 지 일주일이 지났어요' : '기록을 파일로 백업해 두세요. 브라우저 데이터가 지워지면 사라져요'}</span><button class="btn small" data-act="backup">백업하기</button></div>`);
    }
    return `${topbar()}${notes.join('')}${creditBox()}
      <div class="stage" style="margin-top:6px">${MA.char(t.id, 'idle', 170)}<div class="hi">${t.hi}</div></div>
      <button class="btn" data-act="start">${ICON.mic}<span>${esc(t.start)}</span></button>
      <label class="btn sec" style="cursor:pointer">${ICON.file}<span>${esc(t.file)}</span>
        <input type="file" id="file-in" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.aac,.flac,.mp4" hidden></label>
      <div class="sec-title">최근 기록</div>
      <div class="list">${done.length || pending.length ? S.sessions.filter((s) => s.status !== 'recording').slice(0, 4).map(listItem).join('') : `<p class="muted center" style="padding:12px 0">${esc(t.empty)}</p>`}</div>
      ${S.sessions.length > 4 ? '<button class="btn ghost" data-act="go" data-v="history">전체 기록 보기</button>' : ''}`;
  }

  /* ---------- 화면: 녹음 ---------- */
  function noiseText() {
    const n = S.noise;
    const applied = S.rec && S.rec.applied && S.rec.applied.noiseSuppression === false ? '' : '소음 제거 켜짐 · ';
    if (!n) return `${applied}주변 소음을 확인하는 중…`;
    return {
      quiet: `${applied}주변이 조용해요 👍`,
      normal: `${applied}주변 소음이 조금 있어요`,
      loud: '주변이 시끄러워요. 마이크를 입 가까이 두면 정확해져요',
      silent: '소리가 거의 안 들려요. 마이크를 확인해 주세요',
    }[n];
  }

  function viewRecord() {
    const t = T();
    const paused = S.rec && S.rec.state === 'paused';
    const bad = S.noise === 'loud' || S.noise === 'silent';
    return `<div class="topbar"><span class="pill"><i class="dot${paused ? ' paused' : ''}"></i>${paused ? '일시정지' : '녹음 중'}</span>
        <span class="pill" id="noise" style="${bad ? 'background:var(--hl);color:#141414' : ''}">${esc(noiseText())}</span></div>
      <div class="stage">${MA.char(t.id, 'rec', 150)}<div class="bubble">${esc(paused ? '잠깐 쉬는 중이에요' : t.recBubble)}</div></div>
      <div class="timer" id="timer">${MA.fmtClock(S.rec ? S.rec.totalMs / 1000 : 0)}</div>
      ${wave(26).replace('class="wave"', `class="wave${paused ? ' off' : ''}"`)}
      <div class="meter" aria-hidden="true"><i id="meter"></i></div>
      <div class="row"><button class="btn sec" data-act="${paused ? 'resume' : 'pause'}">${paused ? ICON.play : ICON.pause}<span>${esc(paused ? t.resume : t.pause)}</span></button></div>
      <button class="btn dark" data-act="end">${esc(t.end)}</button>
      <p class="muted center">화면을 켜 둔 채로 두세요. 폰은 화면이 꺼지면 녹음이 멈출 수 있어요.<br>${Math.round(E.segmentSec / 60)}분마다 자동으로 나눠 저장해요.</p>
      <button class="btn ghost" data-act="rec-cancel">녹음 취소 (저장 안 함)</button>`;
  }

  /* ---------- 화면: 정리 중 ---------- */
  function viewProcess() {
    const t = T();
    const p = S.proc || {};
    const s = getS(p.sid) || {};
    if (p.error) {
      return `${topbar({ back: 'home', title: '정리하지 못했어요', nav: false })}
        <div class="stage">${MA.char(t.id, 'think', 130)}</div>
        <div class="card"><p>${esc(p.error.message)}</p>${p.error.code === 'auth' ? '<p class="muted" style="margin-top:6px">설정에서 키를 확인해 주세요.</p>' : ''}
          <p class="muted" style="margin-top:8px">녹음은 지워지지 않았어요. 문제를 해결한 뒤 이어서 정리할 수 있어요.</p></div>
        <button class="btn" data-act="retry" data-id="${esc(p.sid)}">다시 시도</button>
        ${p.error.code === 'auth' ? '<button class="btn sec" data-act="go" data-v="key">API 키 설정</button>' : ''}
        ${E.features.credits && p.error.code === 'quota' ? `<a class="btn sec" style="text-decoration:none" href="${BILLING_URL}" target="_blank" rel="noopener">크레딧 충전하러 가기 ↗</a>` : ''}
        <button class="btn ghost" data-act="go" data-v="home">홈으로</button>`;
    }
    const total = p.total || 1;
    const pct = p.step === 'summarize' ? 85 : Math.round(((p.done || 0) / total) * 75) + 5;
    const row = (label, st) => `<div style="opacity:${st === 'wait' ? 0.5 : 1};font-weight:${st === 'now' ? 700 : 400};padding:3px 0">${st === 'done' ? '✓' : st === 'now' ? '●' : '○'} ${esc(label)}</div>`;
    return `${topbar({ title: s.title || '', nav: false })}
      <div class="stage" style="margin-top:8px">${MA.char(t.id, 'think', 160)}<h2 class="center">${esc(t.thinkTitle)}</h2></div>
      <div class="card">
        ${row(`받아쓰기 (${Math.min(p.done || 0, total)}/${total})`, p.step === 'transcribe' ? 'now' : 'done')}
        ${row('핵심 정리', p.step === 'summarize' ? 'now' : 'wait')}
        <p class="muted" style="margin-top:8px;min-height:1.5em" id="proc-msg">${esc(p.msg || '')}</p></div>
      <div class="bar${p.step === 'summarize' ? ' indet' : ''}"><i style="width:${pct}%"></i></div>
      <p class="muted center">긴 회의는 몇 분 걸릴 수 있어요. 이 창을 닫지 말아 주세요.</p>
      <button class="btn ghost" data-act="proc-cancel">그만두기 (나중에 이어서 정리)</button>`;
  }

  /* ---------- 화면: 결과 ---------- */
  function viewResult() {
    const s = getS(S.cur);
    const t = T();
    if (!s || !s.summary) { S.view = 'home'; return viewHome(); }
    const sm = s.summary;
    const L = t.labels;
    const nums = MA.numbersIn(sm);
    const color = ['#f0764a', '#4f8fe8', '#3aa76d', '#b76ee0', '#d9a21b'];
    return `${topbar({ back: 'home', title: '' })}
      <div class="result">
        <div class="res-head">${MA.char(t.id, 'done', 76)}<div><div class="bubble" style="text-align:left">${esc(t.done)}</div>
          <small class="muted">${esc(MA.fmtDate(s.createdAt))} · ${esc(MA.fmtDur(s.durationSec || 0))}${s.costUsd ? ` · 이번 비용 약 $${s.costUsd.toFixed(3)}` : ''}</small></div></div>
        <input class="title-input" id="title-in" type="text" value="${esc(s.title || sm.title)}" aria-label="제목" maxlength="60">
        ${S.folderPerm ? '<div class="banner warn"><span>저장 폴더에 쓰려면 권한이 필요해요</span><button class="btn small" data-act="folder-grant">허용하기</button></div>' : ''}
        <section class="card main"><label>${esc(L.topic)}</label><p>${esc(sm.topic || '(핵심 주제를 찾지 못했어요)')}</p></section>
        <section class="card dec"><label>${esc(L.dec)}</label>${sm.decisions.length ? `<ul>${sm.decisions.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '<p class="muted">결정된 내용이 없어요</p>'}</section>
        <section class="card todo"><label>${esc(L.todo)}</label>${sm.todos.length ? `<div class="list" style="gap:12px">${sm.todos.map((x, i) => `<div class="todo-row"><span class="av" style="background:${color[i % color.length]}">${esc((x.who || '·').slice(0, 1))}</span><div><b>${esc(x.what)}</b><small>${esc([x.who, x.due].filter(Boolean).join(' · ') || '담당자·기한 미정')}</small></div></div>`).join('')}</div>` : '<p class="muted">할 일이 없어요</p>'}</section>
        ${sm.open.length ? `<section class="card open"><label>${esc(L.open)}</label><ul>${sm.open.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></section>` : ''}
        ${nums.length ? `<section class="card nums"><label>${esc(L.nums)}</label><div class="chips">${nums.map((n) => `<span class="chip warn">${esc(n)}</span>`).join('')}</div>
          <p class="muted" style="margin-top:8px">음성 인식은 숫자와 날짜를 잘못 들을 수 있어요. 아래 받아쓴 글에서 노란 표시를 확인해 보세요.</p></section>` : ''}
        <details class="transcript" id="tx-box"><summary>받아쓴 전체 글 보기</summary><div class="tx">${MA.highlightNumbers(s.transcript || '')}</div></details>
        <div class="sec-title">저장하고 보내기</div>
        <div class="row wrap">
          <button class="btn sec" data-act="share" data-id="${esc(s.id)}">${ICON.share}<span>공유하기</span></button>
          <button class="btn sec" data-act="copy" data-id="${esc(s.id)}">${ICON.copy}<span>복사하기</span></button>
        </div>
        <div class="row wrap">
          <button class="btn sec" data-act="save-md" data-id="${esc(s.id)}">${ICON.down}<span>파일로 저장</span></button>
          ${s.keepAudio ? `<button class="btn sec" data-act="save-audio" data-id="${esc(s.id)}">${ICON.file}<span>녹음 파일 저장</span></button>` : ''}
        </div>
        <div class="row wrap">
          <button class="btn sec" data-act="resum" data-id="${esc(s.id)}">요약 다시 만들기</button>
          <button class="btn sec" data-act="del" data-id="${esc(s.id)}">삭제</button>
        </div>
      </div>`;
  }

  /* ---------- 화면: 기록 ---------- */
  function viewHistory() {
    const list = S.sessions.filter((s) => s.status !== 'recording' || s.segments.length);
    return `${topbar({ back: 'home', title: '기록', nav: false })}
      <div class="list">${list.length ? list.map(listItem).join('') : `<p class="muted center" style="padding:24px 0">${esc(T().empty)}</p>`}</div>
      <div class="sec-title">백업</div>
      <p class="muted">기록은 이 기기의 브라우저에만 저장돼요. 브라우저 데이터를 지우면 사라지니 파일로 백업해 두세요. (API 키와 녹음 원본은 백업에 들어가지 않아요)</p>
      <div class="row wrap">
        <button class="btn sec" data-act="backup">${ICON.down}<span>전체 백업 내보내기</span></button>
        <label class="btn sec" style="cursor:pointer">${ICON.file}<span>백업 가져오기</span><input type="file" id="import-in" accept=".json,application/json" hidden></label>
      </div>`;
  }

  /* ---------- 화면: 설정 ---------- */
  function maskKey(k) { return k ? `${k.slice(0, 4)}••••••••${k.slice(-4)}` : '설정 안 됨'; }

  function viewSettings() {
    const cur = MA.cfg.get('theme', 'bear');
    const key = MA.cfg.get('apiKey', '');
    const sw = (id, title, sub, on) => `<label class="switch"><span>${esc(title)}<small>${esc(sub)}</small></span><input type="checkbox" data-set="${id}" ${on ? 'checked' : ''}></label>`;
    return `${topbar({ back: 'home', title: '설정', nav: false })}
      <div class="sec-title">화면</div>
      <div class="theme-grid">${MA.THEME_ORDER.map((id) => {
        const t = MA.THEMES[id];
        return `<button class="theme-card" data-act="set-theme" data-id="${id}" aria-pressed="${cur === id}">
          <span class="thumb" style="background:${t.thumbBg}">${MA.char(id, 'idle', 60).replace('class="bob"', 'class=""')}</span>
          <span><b>${esc(t.name)}</b><small>${esc(t.tag)}</small></span></button>`;
      }).join('')}</div>
      <div class="sec-title">${esc(E.name)} 키</div>
      <div class="card"><p>${esc(maskKey(key))}</p>
        <div class="row wrap" style="margin-top:10px"><button class="btn sec small" data-act="go" data-v="key">변경</button>
        <button class="btn sec small" data-act="key-test">연결 테스트</button>
        ${key ? '<button class="btn sec small" data-act="key-del">삭제</button>' : ''}</div></div>
      ${E.features.credits ? `<div class="sec-title">크레딧</div>${creditBox()}` : ''}
      <div class="sec-title">녹음</div>
      <div class="card">
        ${sw('noise', '소음 제거', '주변 소음·에코를 줄여서 녹음해요 (권장)', MA.cfg.get('noise', true))}
        ${sw('keepAudio', '녹음 원본 보관', '끄면 정리가 끝난 뒤 녹음 파일을 지워요 (권장)', MA.cfg.get('keepAudio', false))}
        ${sw('wakeLock', '녹음 중 화면 켜 두기', '화면이 꺼져서 녹음이 멈추는 걸 막아요', MA.cfg.get('wakeLock', true))}
      </div>
      ${FS.supported ? `<div class="sec-title">자동 저장 폴더</div><div class="card">
        ${sw('autoSave', '정리가 끝나면 폴더에 자동 저장', '컴퓨터의 폴더를 하나 정해 두면 .md 파일로 저장돼요', MA.cfg.get('autoSave', false))}
        <button class="btn sec small" data-act="folder-pick">폴더 고르기</button></div>` : ''}
      <div class="sec-title">데이터</div>
      <div class="row wrap">
        <button class="btn sec" data-act="backup">${ICON.down}<span>백업 내보내기</span></button>
        <label class="btn sec" style="cursor:pointer">${ICON.file}<span>백업 가져오기</span><input type="file" id="import-in" accept=".json,application/json" hidden></label>
      </div>
      <button class="btn sec" data-act="wipe" style="color:var(--danger)">모든 기록 삭제</button>
      <p class="muted center">Meeting AI · ${esc(E.name)} 판<br>받아쓰기 ${esc(E.models.transcribe[0])} · 요약 ${esc(E.models.summary[0])}</p>`;
  }

  /* ---------- 렌더 ---------- */
  function render() {
    const v = S.view;
    const html = { welcome: viewWelcome, key: viewKey, home: viewHome, record: viewRecord, process: viewProcess, result: viewResult, history: viewHistory, settings: viewSettings }[v]();
    $app.innerHTML = html;
    document.title = `${v === 'record' ? '● 녹음 중 · ' : ''}회의 요약 · ${E.short}`;
  }

  function applyTheme(id) {
    document.documentElement.dataset.theme = id;
    const bg = { bear: '#FFF3E2', blob: '#FFE45E', cat: '#F3F6FA' }[id];
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = bg;
  }

  /* ---------- 녹음 시작·종료 ---------- */
  async function startRecording() {
    if (!hasKey()) { go('key'); return; }
    if (!MA.Recorder.supported()) {
      await modal('녹음을 쓸 수 없어요', '<p>이 브라우저는 녹음을 지원하지 않아요. 최신 Chrome, Safari, Edge 를 써 주세요. 이미 있는 녹음 파일로는 요약할 수 있어요.</p>', [{ label: '확인', kind: '', value: true }]);
      return;
    }
    const sid = newId();
    const s = { id: sid, createdAt: new Date().toISOString(), title: '', durationSec: 0, status: 'recording', engine: E.id, segments: [], transcript: '', summary: null, keepAudio: MA.cfg.get('keepAudio', false), costUsd: 0 };
    S.noise = null;
    const rec = new MA.Recorder({
      segmentSec: E.segmentSec, noise: MA.cfg.get('noise', true), wakeLock: MA.cfg.get('wakeLock', true),
      onTick(sec) { const el = document.getElementById('timer'); if (el) el.textContent = MA.fmtClock(sec); },
      onLevel(l) { const el = document.getElementById('meter'); if (el) el.style.width = Math.round(l * 100) + '%'; },
      onNoise(kind) { S.noise = kind; const el = document.getElementById('noise'); if (el) { el.textContent = noiseText(); const bad = kind === 'loud' || kind === 'silent'; el.style.background = bad ? 'var(--hl)' : ''; el.style.color = bad ? '#141414' : ''; } },
    });
    await save(s);
    try {
      await rec.start(sid);
    } catch (e) {
      await MA.store.deleteSession(sid);
      await reload();
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      const none = e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError');
      await modal('녹음을 시작하지 못했어요',
        `<p>${denied ? '마이크 사용이 허용되지 않았어요. 주소창 옆 자물쇠(또는 사이트 설정)에서 마이크를 허용한 뒤 다시 눌러 주세요.' : none ? '사용할 수 있는 마이크를 찾지 못했어요.' : esc((e && e.message) || '알 수 없는 오류예요.')}</p>`,
        [{ label: '확인', kind: '', value: true }]);
      return;
    }
    S.rec = rec;
    S.recSession = s;
    S.recSaver = setInterval(() => saveRecProgress(), 8000);
    MA.store.persist();
    go('record');
  }

  async function saveRecProgress() {
    if (!S.rec || !S.recSession) return;
    const s = S.recSession;
    s.segments = S.rec.segs.map(({ idx, mime, durationSec, activeMs, bytes }) => ({ idx, mime, bytes, durationSec: durationSec || Math.round(activeMs / 100) / 10 }));
    s.durationSec = S.rec.totalMs / 1000;
    await MA.store.putSession(s);
  }

  async function endRecording() {
    const ok = await modal('녹음을 끝낼까요?', '<p>녹음을 끝내고 정리를 시작할까요?</p>', [
      { label: '계속 녹음', value: false }, { label: '끝내고 정리하기', kind: '', value: true }]);
    if (!ok || !S.rec) return;
    clearInterval(S.recSaver);
    const rec = S.rec, s = S.recSession;
    let r;
    try { r = await rec.stop(); } catch (e) { toast('녹음을 마무리하지 못했어요'); return; }
    S.rec = null;
    s.segments = r.segments.map(({ idx, mime, bytes, durationSec }) => ({ idx, mime, bytes, durationSec }));
    s.durationSec = r.durationSec;
    if (r.durationSec < 2 || !s.segments.some((x) => x.bytes > 0)) {
      await MA.store.deleteSession(s.id);
      await reload();
      toast('너무 짧아서 저장하지 않았어요');
      go('home');
      return;
    }
    s.status = 'recorded';
    await save(s);
    processSession(s.id);
  }

  async function cancelRecording() {
    const ok = await modal('녹음을 취소할까요?', '<p>지금까지 녹음한 내용이 모두 사라져요.</p>', [{ label: '계속 녹음', value: false }, { label: '취소하고 지우기', kind: 'danger', value: true }]);
    if (!ok || !S.rec) return;
    clearInterval(S.recSaver);
    await S.rec.abort();
    await MA.store.deleteSession(S.recSession.id);
    S.rec = null;
    await reload();
    go('home');
  }

  /* ---------- 정리(받아쓰기 → 요약) ---------- */
  async function processSession(sid) {
    const s = getS(sid) || (await MA.store.getSession(sid));
    if (!s) return;
    const ctl = new AbortController();
    S.proc = { sid, step: 'transcribe', done: 0, total: s.segments.length || 1, msg: '', error: null, ctl };
    const setMsg = (m) => { S.proc.msg = m; const el = document.getElementById('proc-msg'); if (el) { el.textContent = m; el.className = 'muted'; } };
    s.status = 'processing';
    s.error = '';
    await save(s);
    S.cur = sid;
    go('process');
    try {
      for (const seg of s.segments) {
        if (typeof seg.text === 'string') { S.proc.done++; continue; }
        const blob = await MA.store.segmentBlob(sid, seg.idx, seg.mime);
        if (!blob || blob.size < 500) { seg.text = ''; S.proc.done++; continue; }
        setMsg('');
        const r = await E.transcribe(blob, { mime: seg.mime, durationSec: seg.durationSec, signal: ctl.signal, onStatus: setMsg });
        seg.text = r.text || '';
        seg.model = r.model;
        s.costUsd = (s.costUsd || 0) + (r.costUsd || 0);
        if (E.features.credits) CR.charge(r.costUsd);
        await save(s);
        S.proc.done++;
        if (S.view === 'process') render();
      }
      s.transcript = s.segments.map((x) => x.text).filter(Boolean).join('\n\n');
      if (!s.transcript.trim()) throw new MA.AppError('받아쓴 내용이 없어요. 소리가 녹음되지 않았을 수 있어요. 마이크와 소음 환경을 확인해 주세요.', { code: 'bad' });
      S.proc.step = 'summarize';
      setMsg('');
      if (S.view === 'process') render();
      const r = await E.summarize(s.transcript, { signal: ctl.signal, onStatus: setMsg });
      s.summary = r.summary;
      s.title = s.title || r.summary.title || '';
      s.costUsd = (s.costUsd || 0) + (r.costUsd || 0);
      if (E.features.credits) CR.charge(r.costUsd);
      s.status = 'done';
      await save(s);
      if (!s.keepAudio) await MA.store.deleteChunks(sid);
      S.proc = null;
      if (MA.cfg.get('autoSave', false) && FS.supported) {
        try { S.folderPerm = (await FS.write(s)) === 'perm'; } catch (e) { /* 폴더 저장 실패는 무시 */ }
      }
      go('result');
      toast('정리가 끝났어요');
    } catch (e) {
      if (e.name === 'AbortError') {
        s.status = 'recorded';
        await save(s);
        S.proc = null;
        toast('나중에 기록에서 이어서 정리할 수 있어요');
        go('home');
        return;
      }
      s.status = 'failed';
      s.error = e.message;
      await save(s);
      S.proc.error = e instanceof MA.AppError ? e : new MA.AppError(e.message || '알 수 없는 오류예요.');
      if (S.view === 'process') render();
      else go('process');
    }
  }

  /* ---------- 파일 올리기 ---------- */
  function audioDuration(blob) {
    return new Promise((res) => {
      const a = new Audio();
      const u = URL.createObjectURL(blob);
      const fin = (v) => { URL.revokeObjectURL(u); res(v); };
      a.preload = 'metadata';
      a.onloadedmetadata = () => fin(isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => fin(0);
      setTimeout(() => fin(0), 4000);
      a.src = u;
    });
  }

  async function handleFile(file) {
    if (!file) return;
    if (!hasKey()) { go('key'); return; }
    if (file.size > E.maxFileBytes) {
      await modal('파일이 너무 커요', `<p>한 번에 처리할 수 있는 크기는 약 ${Math.round(E.maxFileBytes / 1048576)}MB 까지예요 (${(file.size / 1048576).toFixed(1)}MB). 더 짧게 자르거나, 이 앱의 녹음 기능을 써 주세요.</p>`, [{ label: '확인', kind: '', value: true }]);
      return;
    }
    const sid = newId();
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const mime = file.type || { m4a: 'audio/m4a', mp3: 'audio/mp3', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac', mp4: 'audio/mp4' }[ext] || 'audio/mpeg';
    const dur = await audioDuration(file);
    const s = { id: sid, createdAt: new Date().toISOString(), title: file.name.replace(/\.[^.]+$/, '').slice(0, 40), durationSec: dur, status: 'recorded', engine: E.id, segments: [{ idx: 0, mime, bytes: file.size, durationSec: dur }], transcript: '', summary: null, keepAudio: false, costUsd: 0 };
    await save(s);
    await MA.store.putChunk(sid, 0, 0, new Blob([file], { type: mime }));
    processSession(sid);
  }

  /* ---------- 내보내기 ---------- */
  async function shareSession(s) {
    const md = MA.toMarkdown(s, true);
    const name = MA.fileName(s, 'md');
    try {
      const file = new File([md], name, { type: 'text/markdown' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: s.title }); return; }
      if (navigator.share) { await navigator.share({ title: s.title, text: md }); return; }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
    downloadBlob(new Blob([md], { type: 'text/markdown' }), name);
    toast('공유 기능이 없어서 파일로 저장했어요');
  }

  async function doBackup() {
    const obj = await MA.backup.build(E.id);
    if (!obj.sessions.length) { toast('백업할 기록이 아직 없어요'); return; }
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    downloadBlob(new Blob([JSON.stringify(obj)], { type: 'application/json' }), `meeting-ai-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`);
    MA.cfg.set('lastBackupAt', d.toISOString());
    toast(`기록 ${obj.sessions.length}개를 백업했어요`);
    if (S.view === 'home') render();
  }

  async function doImport(file) {
    if (!file) return;
    try {
      const r = await MA.backup.restore(JSON.parse(await file.text()));
      await reload();
      toast(`${r.added}개를 가져왔어요${r.skipped ? ` (이미 있거나 건너뜀 ${r.skipped}개)` : ''}`);
      render();
    } catch (e) {
      await modal('가져오지 못했어요', `<p>${esc(e.message || '파일을 읽을 수 없어요.')}</p>`, [{ label: '확인', kind: '', value: true }]);
    }
  }

  /* ---------- 클릭 처리 ---------- */
  const ACT = {
    go: (el) => { if (el.dataset.v === 'key') S.keyMsg = null; go(el.dataset.v); },
    'pick-theme': (el) => { S.welcomePick = el.dataset.id; applyTheme(el.dataset.id); render(); },
    'theme-next': () => { MA.cfg.set('theme', S.welcomePick); go(hasKey() ? 'home' : 'key'); },
    'set-theme': (el) => { MA.cfg.set('theme', el.dataset.id); applyTheme(el.dataset.id); render(); },
    start: () => startRecording(),
    pause: () => { S.rec.pause(); render(); },
    resume: () => { S.rec.resume(); render(); },
    end: () => endRecording(),
    'rec-cancel': () => cancelRecording(),
    'proc-cancel': () => { if (S.proc && S.proc.ctl) S.proc.ctl.abort(); },
    retry: (el) => processSession(el.dataset.id),
    recover: async (el) => {
      const s = getS(el.dataset.id);
      if (!s) return;
      const chunks = await MA.store.chunksOf(s.id);
      const segIdx = [...new Set(chunks.map((c) => c.seg))].sort((a, b) => a - b);
      if (!segIdx.length) { await MA.store.deleteSession(s.id); await reload(); toast('복구할 녹음이 없어서 정리했어요'); render(); return; }
      s.segments = segIdx.map((i) => {
        const known = (s.segments || []).find((x) => x.idx === i) || {};
        const bytes = chunks.filter((c) => c.seg === i).reduce((a, c) => a + c.blob.size, 0);
        return { idx: i, mime: known.mime || chunks.find((c) => c.seg === i).blob.type || 'audio/webm', bytes, durationSec: known.durationSec || Math.round(bytes / 4000) };
      });
      s.durationSec = s.segments.reduce((a, x) => a + (x.durationSec || 0), 0);
      s.status = 'recorded';
      await save(s);
      processSession(s.id);
    },
    open: (el) => {
      const s = getS(el.dataset.id);
      if (!s) return;
      S.cur = s.id;
      if (s.status === 'done') { go('result'); return; }
      if (s.status === 'failed') {
        S.proc = { sid: s.id, step: 'transcribe', done: 0, total: s.segments.length || 1, msg: '', error: new MA.AppError(s.error || '이전에 정리하지 못했어요.') };
        go('process');
        return;
      }
      processSession(s.id);
    },
    share: (el) => shareSession(getS(el.dataset.id)),
    copy: async (el) => { toast((await copyText(MA.toMarkdown(getS(el.dataset.id), true))) ? '복사했어요' : '복사하지 못했어요'); },
    'save-md': (el) => { const s = getS(el.dataset.id); downloadBlob(new Blob([MA.toMarkdown(s, true)], { type: 'text/markdown' }), MA.fileName(s, 'md')); toast('파일로 저장했어요'); },
    'save-audio': async (el) => {
      const s = getS(el.dataset.id);
      for (const seg of s.segments) {
        const b = await MA.store.segmentBlob(s.id, seg.idx, seg.mime);
        if (b) downloadBlob(b, MA.fileName(s, /mp4|m4a/.test(seg.mime) ? 'm4a' : 'webm').replace(/\.(m4a|webm)$/, `-${seg.idx + 1}.$1`));
      }
    },
    resum: async (el) => { const s = getS(el.dataset.id); s.summary = null; s.status = 'recorded'; await save(s); processSession(s.id); },
    del: async (el) => {
      const ok = await modal('이 기록을 삭제할까요?', '<p>삭제하면 되돌릴 수 없어요. 필요하면 먼저 저장해 두세요.</p>', [{ label: '취소', value: false }, { label: '삭제', kind: 'danger', value: true }]);
      if (!ok) return;
      await MA.store.deleteSession(el.dataset.id);
      await reload();
      toast('삭제했어요');
      go(S.view === 'result' ? 'home' : S.view);
    },
    backup: () => doBackup(),
    wipe: async () => {
      const ok = await modal('모든 기록을 삭제할까요?', '<p>이 기기에 저장된 모든 회의 기록이 지워져요. 되돌릴 수 없어요. 백업을 먼저 해 두셨나요?</p>', [{ label: '취소', value: false }, { label: '모두 삭제', kind: 'danger', value: true }]);
      if (!ok) return;
      await MA.store.clearAll();
      await reload();
      toast('모든 기록을 삭제했어요');
      render();
    },
    'key-save': () => saveKey(false),
    'key-force': () => saveKey(true),
    'key-test': async () => {
      const k = MA.cfg.get('apiKey', '');
      if (!k) { toast('키가 설정되어 있지 않아요'); return; }
      toast('확인하는 중…');
      const r = await E.validateKey(k);
      toast(r.message);
    },
    'key-del': async () => {
      const ok = await modal('키를 삭제할까요?', '<p>이 브라우저에 저장된 API 키가 지워져요. 기록은 그대로 남아요.</p>', [{ label: '취소', value: false }, { label: '삭제', kind: 'danger', value: true }]);
      if (ok) { MA.cfg.del('apiKey'); toast('키를 삭제했어요'); render(); }
    },
    'credit-edit': () => creditEdit(),
    'folder-pick': async () => { try { const n = await FS.choose(); toast(`"${n}" 폴더에 저장할게요`); render(); } catch (e) { /* 취소 */ } },
    'folder-grant': async () => { if (await FS.grant()) { const s = getS(S.cur); await FS.write(s); S.folderPerm = false; toast('폴더에 저장했어요'); render(); } },
  };

  async function saveKey(force) {
    const el = document.getElementById('key-in');
    const k = (el && el.value || '').trim();
    if (!k) { S.keyMsg = { ok: false, invalid: true, text: '키를 붙여넣어 주세요.' }; render(); return; }
    if (!force) {
      S.keyMsg = { ok: true, text: '연결을 확인하는 중…' };
      render();
      const r = await E.validateKey(k);
      if (!r.ok) { S.keyMsg = { ok: false, invalid: !!r.invalid, text: r.message }; render(); return; }
    }
    MA.cfg.set('apiKey', k);
    S.keyMsg = null;
    toast('키를 저장했어요');
    go('home');
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.closest('#modal-root')) return;
    const fn = ACT[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'file-in') { handleFile(t.files[0]); t.value = ''; }
    else if (t.id === 'import-in') { doImport(t.files[0]); t.value = ''; }
    else if (t.dataset && t.dataset.set) { MA.cfg.set(t.dataset.set, t.checked); }
    else if (t.id === 'title-in') {
      const s = getS(S.cur);
      if (s) { s.title = t.value.trim().slice(0, 60); save(s); }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'key-in') saveKey(false);
  });

  window.addEventListener('beforeunload', (e) => {
    if (S.rec) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- 시작 ---------- */
  async function boot() {
    applyTheme(MA.cfg.get('theme', 'bear'));
    if (!MA.store.available()) {
      $app.innerHTML = '<div class="card"><h2>저장소를 쓸 수 없어요</h2><p class="muted">시크릿 모드이거나 브라우저가 저장을 막고 있어요. 일반 창에서 열어 주세요.</p></div>';
      return;
    }
    try { await reload(); } catch (e) { S.sessions = []; }
    S.view = MA.cfg.get('theme', null) ? 'home' : 'welcome';
    render();
  }
  boot();
})();
