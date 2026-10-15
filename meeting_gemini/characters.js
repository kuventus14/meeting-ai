/* 캐릭터(SVG)와 테마별 말투. 외부 이미지·폰트 없이 코드만으로 그린다. */
(function () {
  const MA = (window.MA = window.MA || {});

  function bear(st, size) {
    const ink = '#4a2c17';
    const eyes = {
      idle: `<circle cx="68" cy="92" r="7.5" fill="${ink}"/><circle cx="132" cy="92" r="7.5" fill="${ink}"/><circle cx="70.5" cy="89" r="2.6" fill="#fff"/><circle cx="134.5" cy="89" r="2.6" fill="#fff"/>`,
      think: `<path d="M56 92q12 10 24 0M120 92q12 10 24 0" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`,
      done: `<path d="M56 96q12-14 24 0M120 96q12-14 24 0" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`,
    };
    eyes.rec = eyes.idle;
    const mouth = {
      idle: `<path d="M100 114v6M100 120q-9 9-18 1M100 120q9 9 18 1" fill="none" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/>`,
      rec: `<ellipse cx="100" cy="128" rx="5.5" ry="6.5" fill="${ink}"/>`,
      think: `<path d="M90 124h20" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/>`,
      done: `<path d="M82 120q18 24 36 0z" fill="#7a2e1d"/><ellipse cx="100" cy="134" rx="9" ry="4.5" fill="#ff8a80"/>`,
    };
    const extra = {
      rec: `<path d="M24 98Q24 20 100 20Q176 20 176 98" fill="none" stroke="#ff6b4a" stroke-width="11" stroke-linecap="round"/><rect x="8" y="80" width="28" height="46" rx="13" fill="#ff6b4a"/><rect x="164" y="80" width="28" height="46" rx="13" fill="#ff6b4a"/>`,
      done: `<path d="M172 26l4 11 11 4-11 4-4 11-4-11-11-4 11-4z" fill="#ffc857"/><path d="M26 34l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#ffc857"/>`,
    };
    return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="곰 캐릭터 도토">
      <ellipse cx="100" cy="182" rx="60" ry="36" fill="#d9a066"/>
      <circle cx="42" cy="44" r="26" fill="#d9a066"/><circle cx="42" cy="44" r="13" fill="#f7c9a0"/>
      <circle cx="158" cy="44" r="26" fill="#d9a066"/><circle cx="158" cy="44" r="13" fill="#f7c9a0"/>
      <ellipse cx="100" cy="98" rx="76" ry="66" fill="#e0a76f"/>
      <circle cx="46" cy="114" r="10" fill="#ff9a8b" opacity=".55"/><circle cx="154" cy="114" r="10" fill="#ff9a8b" opacity=".55"/>
      <ellipse cx="100" cy="118" rx="32" ry="24" fill="#ffe9cf"/>
      ${eyes[st]}<ellipse cx="100" cy="108" rx="9" ry="6.5" fill="${ink}"/>${mouth[st]}${extra[st] || ''}
    </svg>`;
  }

  function blob(st, size) {
    const ink = '#141414';
    const open = (cx, cy, px, py) => `<circle cx="${cx}" cy="${cy}" r="17" fill="#fff" stroke="${ink}" stroke-width="4"/><circle cx="${px}" cy="${py}" r="8" fill="${ink}"/><circle cx="${px + 3}" cy="${py - 4}" r="3" fill="#fff"/>`;
    const star = (cx) => `<path d="M${cx} 70l6 14 15 1-12 10 4 15-13-8-13 8 4-15-12-10 15-1z" fill="#FFD93D" stroke="${ink}" stroke-width="3.5" stroke-linejoin="round"/>`;
    const eyes = {
      idle: open(72, 92, 75, 95) + open(128, 92, 131, 95),
      rec: open(72, 92, 74, 86) + open(128, 92, 130, 86),
      think: `<circle cx="72" cy="92" r="17" fill="#fff" stroke="${ink}" stroke-width="4"/><circle cx="128" cy="92" r="17" fill="#fff" stroke="${ink}" stroke-width="4"/><circle cx="72" cy="92" r="9" fill="none" stroke="${ink}" stroke-width="3.5"/><circle cx="72" cy="92" r="3" fill="${ink}"/><circle cx="128" cy="92" r="9" fill="none" stroke="${ink}" stroke-width="3.5"/><circle cx="128" cy="92" r="3" fill="${ink}"/>`,
      done: star(72) + star(128),
    };
    const mouth = {
      idle: `<path d="M82 128Q100 146 118 128" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`,
      rec: `<ellipse cx="100" cy="136" rx="22" ry="16" fill="${ink}"/><ellipse cx="100" cy="144" rx="11" ry="7" fill="#FF6FB5"/>`,
      think: `<path d="M78 134q8-9 15 0t15 0t15 0" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`,
      done: `<path d="M78 124Q100 158 122 124z" fill="${ink}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/><ellipse cx="100" cy="141" rx="11" ry="6" fill="#FF6FB5"/>`,
    };
    return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="캐릭터 몽글이">
      <circle cx="66" cy="34" r="11" fill="#A78BFA" stroke="${ink}" stroke-width="5"/><circle cx="134" cy="34" r="11" fill="#A78BFA" stroke="${ink}" stroke-width="5"/>
      <ellipse cx="72" cy="184" rx="17" ry="9" fill="#8b6cf0" stroke="${ink}" stroke-width="5"/><ellipse cx="128" cy="184" rx="17" ry="9" fill="#8b6cf0" stroke="${ink}" stroke-width="5"/>
      <path d="M100 20C150 20 180 60 178 110C176 160 150 183 100 183C50 183 22 160 22 110C20 60 50 20 100 20Z" fill="#A78BFA" stroke="${ink}" stroke-width="5"/>
      <ellipse cx="100" cy="158" rx="38" ry="18" fill="#DDD0FF" opacity=".85"/>
      <circle cx="46" cy="120" r="9" fill="#FF8FC7"/><circle cx="154" cy="120" r="9" fill="#FF8FC7"/>
      ${eyes[st]}${mouth[st]}
    </svg>`;
  }

  function cat(st, size) {
    const ink = '#1B2A41';
    const eyes = {
      idle: `<circle cx="44" cy="66" r="5.5" fill="${ink}"/><circle cx="76" cy="66" r="5.5" fill="${ink}"/><circle cx="46" cy="64" r="1.8" fill="#fff"/><circle cx="78" cy="64" r="1.8" fill="#fff"/>`,
      think: `<path d="M38 66q6 7 12 0M70 66q6 7 12 0" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/>`,
      done: `<path d="M38 69q6-9 12 0M70 69q6-9 12 0" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/>`,
    };
    eyes.rec = eyes.idle;
    const mouth = st === 'done'
      ? `<path d="M51 82q9 13 18 0z" fill="#7a2e1d"/>`
      : `<path d="M60 81v4M60 85q-6 6-12 0M60 85q6 6 12 0" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="고양이 비서 냥비서">
      <polygon points="20,52 26,10 54,30" fill="#ffb45e"/><polygon points="100,52 94,10 66,30" fill="#ffb45e"/>
      <polygon points="28,44 30,22 44,32" fill="#ffd6a8"/><polygon points="92,44 90,22 76,32" fill="#ffd6a8"/>
      <ellipse cx="60" cy="68" rx="44" ry="38" fill="#ffb45e"/>
      <path d="M60 32v10M48 34l2 9M72 34l-2 9" stroke="#e58e2b" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="60" cy="80" rx="18" ry="13" fill="#ffe3c2"/>
      <circle cx="30" cy="78" r="6" fill="#ff9a8b" opacity=".5"/><circle cx="90" cy="78" r="6" fill="#ff9a8b" opacity=".5"/>
      ${eyes[st]}<path d="M56 76h8l-4 5z" fill="#ff7a8a"/>${mouth}
      <path d="M16 72l-13-3M16 78l-13 3M104 72l13-3M104 78l13 3" stroke="${ink}" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>
      <path d="M14 66Q14 30 60 30Q106 30 106 66" fill="none" stroke="#2EC4B6" stroke-width="7" stroke-linecap="round"/>
      <rect x="6" y="56" width="15" height="28" rx="7" fill="#2EC4B6"/><rect x="99" y="56" width="15" height="28" rx="7" fill="#2EC4B6"/>
      <path d="M106 80Q108 98 86 98" fill="none" stroke="#2EC4B6" stroke-width="4" stroke-linecap="round"/><circle cx="83" cy="98" r="5" fill="#2EC4B6"/>
    </svg>`;
  }

  const DRAW = { bear, blob, cat };

  /** 테마·상태에 맞는 캐릭터 SVG. state: idle | rec | think | done */
  MA.char = function (theme, state, size) {
    const fn = DRAW[theme] || bear;
    return `<div class="${state === 'done' ? '' : 'bob'}" style="width:${size}px;height:${size}px">${fn(state, size)}</div>`;
  };

  /** 테마별 이름과 말투. 기능은 같고 말만 다르다. */
  MA.THEMES = {
    bear: {
      id: 'bear', name: '말랑 곰 도토', tag: '포근하고 둥근 느낌, 부담 없이 쓰기 좋아요', thumbBg: '#FFF3E2',
      hi: '안녕!<br>오늘도 같이 들을게요', start: '녹음 시작', file: '이미 있는 녹음 파일로 요약하기',
      recBubble: '듣고 있어요~', end: '끝났어요!', pause: '잠깐 멈춤', resume: '다시 시작',
      thinkTitle: '핵심만 쏙쏙 고르는 중이에요', done: '다 정리했어요!',
      labels: { topic: '오늘의 핵심', dec: '결정된 것', todo: '할 일', open: '아직 못 정했어요', nums: '숫자·날짜 다시 확인' },
      empty: '아직 기록이 없어요. 첫 회의를 녹음해 볼까요?',
    },
    blob: {
      id: 'blob', name: '몽글이', tag: '진한 색과 굵은 테두리, 대화를 냠냠 먹고 요점만 뱉어요', thumbBg: '#FFE45E',
      hi: '말은 내가 냠냠 먹고<br>요점만 뱉어줄게!', start: 'REC 시작', file: '파일 올려서 먹이기',
      recBubble: '냠냠... 중요한 얘기네!', end: '끝! 뱉어줘', pause: '잠깐 멈춰', resume: '다시 냠냠',
      thinkTitle: '꾸르륵... 소화 중!', done: '꺼억! 정리 끝',
      labels: { topic: 'TOPIC', dec: 'DECIDED', todo: 'TO-DO', open: '? 아직', nums: '숫자 CHECK' },
      empty: '아직 먹은 게 없어! 첫 회의를 먹여 줘!',
    },
    cat: {
      id: 'cat', name: '냥비서', tag: '카톡처럼 익숙한 말투로 정리해 주는 고양이 비서', thumbBg: '#d9f5f1',
      hi: '안녕! 나는 회의 담당<br>냥비서다냥 🐾', start: '회의 시작하기', file: '녹음 파일 올려서 요약하기',
      recBubble: '듣고 있다냥 🎧', end: '끝났어요', pause: '잠깐 멈추기', resume: '다시 듣기',
      thinkTitle: '금방 정리할게냥 ✍️', done: '수고했다냥! 요점만 정리했어 👇',
      labels: { topic: '📌 핵심 주제', dec: '✅ 결정된 것', todo: '📝 할 일', open: '❓ 아직 미정', nums: '🔢 숫자·날짜 확인' },
      empty: '아직 정리한 게 없다냥. 첫 회의를 시작해 보자!',
    },
  };
  MA.THEME_ORDER = ['bear', 'blob', 'cat'];
})();
