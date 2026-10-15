/* 저장소: 설정(localStorage) + 기록·녹음 조각(IndexedDB) + 백업 내보내기/가져오기.
 * 모든 데이터는 이 기기의 브라우저 안에만 있다. 서버로 보내지 않는다. */
(function () {
  const MA = (window.MA = window.MA || {});
  // 두 버전(Gemini·OpenAI)이 같은 도메인에서 열려도 키와 기록이 섞이지 않도록 버전별로 저장 공간을 나눈다.
  const NS = document.documentElement.dataset.engine || 'app';
  const PREFIX = `meeting_ai.${NS}.`;

  /* ---------- 설정 ---------- */
  MA.cfg = {
    get(key, def) {
      try {
        const v = localStorage.getItem(PREFIX + key);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
    del(key) { try { localStorage.removeItem(PREFIX + key); } catch (e) { /* 무시 */ } },
  };

  /* ---------- IndexedDB ---------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(`meeting_ai_${NS}`, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('sessions', { keyPath: 'id' });
        d.createObjectStore('chunks', { keyPath: 'k' }).createIndex('sid', 'sid');
        d.createObjectStore('meta');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function run(store, mode, make) {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const r = make(t.objectStore(store));
      t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
      t.onerror = t.onabort = () => rej(t.error || new Error('저장소 오류'));
    }));
  }

  const pad = (n) => String(n).padStart(6, '0');

  MA.store = {
    available() { return typeof indexedDB !== 'undefined'; },
    putSession: (s) => run('sessions', 'readwrite', (o) => o.put(s)),
    getSession: (id) => run('sessions', 'readonly', (o) => o.get(id)),
    async allSessions() {
      const all = await run('sessions', 'readonly', (o) => o.getAll());
      return (all || []).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },
    async deleteSession(id) {
      await this.deleteChunks(id);
      await run('sessions', 'readwrite', (o) => o.delete(id));
    },
    async clearAll() {
      await run('sessions', 'readwrite', (o) => o.clear());
      await run('chunks', 'readwrite', (o) => o.clear());
    },
    putChunk: (sid, seg, n, blob) => run('chunks', 'readwrite', (o) => o.put({ k: `${sid}|${seg}|${pad(n)}`, sid, seg, n, blob })),
    async chunksOf(sid) {
      const all = await run('chunks', 'readonly', (o) => o.index('sid').getAll(sid));
      return (all || []).sort((a, b) => a.seg - b.seg || a.n - b.n);
    },
    async segmentBlob(sid, seg, mime) {
      const parts = (await this.chunksOf(sid)).filter((c) => c.seg === seg).map((c) => c.blob);
      return parts.length ? new Blob(parts, { type: mime || parts[0].type || 'audio/webm' }) : null;
    },
    async deleteChunks(sid) {
      const d = await db();
      await new Promise((res, rej) => {
        const t = d.transaction('chunks', 'readwrite');
        const cur = t.objectStore('chunks').index('sid').openKeyCursor(IDBKeyRange.only(sid));
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) { t.objectStore('chunks').delete(c.primaryKey); c.continue(); }
        };
        t.oncomplete = res;
        t.onerror = t.onabort = () => rej(t.error);
      });
    },
    metaGet: (k) => run('meta', 'readonly', (o) => o.get(k)),
    metaSet: (k, v) => run('meta', 'readwrite', (o) => o.put(v, k)),
    metaDel: (k) => run('meta', 'readwrite', (o) => o.delete(k)),
    /** 브라우저가 공간이 부족할 때 임의로 지우지 않도록 요청 */
    async persist() {
      try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; }
    },
  };

  /* ---------- 백업 ---------- */
  /** 녹음 원본과 API 키는 넣지 않는다. */
  MA.backup = {
    async build(engineId) {
      const sessions = (await MA.store.allSessions())
        .filter((s) => s.status === 'done')
        .map((s) => ({ ...s, segments: (s.segments || []).map(({ idx, mime, durationSec }) => ({ idx, mime, durationSec })) }));
      return {
        app: 'meeting-ai', version: 1, engine: engineId, exportedAt: new Date().toISOString(),
        theme: MA.cfg.get('theme', null), sessions,
      };
    },
    /** @returns {{added:number, skipped:number}} */
    async restore(obj) {
      if (!obj || obj.app !== 'meeting-ai' || !Array.isArray(obj.sessions)) throw new Error('이 앱에서 만든 백업 파일이 아니에요.');
      const have = new Set((await MA.store.allSessions()).map((s) => s.id));
      let added = 0, skipped = 0;
      for (const s of obj.sessions) {
        if (!s || typeof s.id !== 'string' || !s.summary) { skipped++; continue; }
        if (have.has(s.id)) { skipped++; continue; }
        await MA.store.putSession({ ...s, status: 'done', keepAudio: false });
        added++;
      }
      return { added, skipped };
    },
  };
})();
