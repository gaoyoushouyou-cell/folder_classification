/* 画面 — 受付 / 作業 / 道具屋 / 帳簿。
 * 作業画面は左が「手しごと」（机と棚: つかむ・運ぶ・名づける）、右が「理」（要求書: 読む・照らす・確かめる）。 */
(function () {
  'use strict';
  const { h, hash, pct } = G.util;
  const P = () => G.progress;
  /* id で要素を取る。replaceChildren は h() と同じく配列・null・false を受け付けるようにしておく */
  const $ = (id) => {
    const el = document.getElementById(id);
    if (el && !el.flatFill) {
      const native = el.replaceChildren.bind(el);
      el.replaceChildren = (...kids) => native(...kids.flat(Infinity).filter((k) => k != null && k !== false));
      el.flatFill = true;
    }
    return el;
  };
  let S = null; // 作業中の依頼の状態

  /* ══════════ 共通部品 ══════════ */
  function toast(msg) {
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    $('toasts').append(t);
    setTimeout(() => t.remove(), 2800);
  }
  /* 手・理の重さ（1〜10）。目盛りは 10 個、5 個目のあとに切れ目を入れて数えやすくする */
  const pips = (n, side) =>
    h('span', { class: 'pips ' + side, title: (side === 'hand' ? '手しごと' : '理') + `の重さ ${n} / 10` },
      h('b', {}, side === 'hand' ? '手' : '理'),
      Array.from({ length: 10 }, (_, i) => h('i', { class: (i < n ? 'on' : '') + (i === 5 ? ' gap' : '') })),
      h('em', {}, n));
  const stars = (n) => h('span', { class: 'stars', 'aria-label': `星 ${n} / 3` }, '★'.repeat(n), h('span', { class: 'off' }, '★'.repeat(3 - n)));
  const bar = (v, side) => h('span', { class: 'bar ' + (side || '') }, h('i', { style: `width:${Math.round((v || 0) * 100)}%` }));
  const KIND_CLASS = { 画像: 'k-img', 文書: 'k-doc', 表: 'k-tab', 音声: 'k-snd', 鍵: 'k-key' };
  const KIND_NAME = { w: '飛び込み', c: '稽古', a: '広告' };

  /* ══════════ 手引き ══════════
   * 手ほどきの常設版。基本の操作と、依頼に出てくる要素（生成器の MECHS）を同じ形で並べる。
   * 受付の「手引き」からはすべて、作業中は上部の札からその依頼に出てくるものを引ける */
  const BASICS = [
    { key: 'carry', side: 'hand', label: 'つかむ・運ぶ', text: 'ファイルやフォルダを押したまま動かし、行き先の上で離します。掴んだまま枠の端へ寄せると、その先へ送られます。まちがえたら「ひとつ戻す」。' },
    { key: 'folder', side: 'hand', label: 'フォルダ', text: '「＋ フォルダ」で作り、名前を打ち込みます。見出しの「＋」で中にフォルダを作れます。名前は二度押しで書き直せ、手数には数えません。▾ で畳めます。' },
    { key: 'slip', side: 'logic', label: '札', text: 'ファイルを一度押すと、下に札（属性）が出ます。年・作成者・機密区分・版・サイズなど、名前からは読めないことはここで確かめます。' },
    { key: 'clause', side: 'logic', label: '条項', text: '要求書の条項は「条件 → 行き先」の形です。〈 〉は札の属性のこと。番号つきの条項は上から順に当てはめ、最初に合ったものだけが効きます。' },
    { key: 'deliver', side: 'logic', label: '納品と検収', text: '「納品する」で検収を受けます。充足が 90% 以上で合格。報酬は、充足・手際（目安の手数との比）・納品回数で決まります。差し戻されたら、要求書に書き込まれた手がかりを見て直します。' },
  ];
  const guideEntries = () => BASICS.concat(Object.keys(G.gen.MECHS).map((k) => {
    const m = G.gen.MECHS[k];
    return { key: k, side: m.side, label: m.label, text: m.teach, min: m.min };
  }));
  /* keys を渡すと、その項目を「この依頼に出てくる」として先頭に集める */
  function guideList(keys, focus) {
    const all = guideEntries();
    const card = (g, here) => h('article', { class: 'guide-item ' + g.side + (g.key === focus ? ' focus' : ''), id: 'g-' + g.key },
      h('h3', {}, h('span', { class: 'tag ' + g.side }, g.side === 'hand' ? '手' : '理'), g.label,
        g.min ? h('small', {}, `格 ${g.min} から`) : h('small', {}, '基本'),
        here ? h('i', { class: 'here' }, 'この依頼に出てくる') : null),
      h('p', {}, g.text));
    if (!keys) {
      return h('div', {},
        h('section', { class: 'chapter' }, h('h2', {}, '基本の操作'),
          h('p', { class: 'chapter-note' }, h('span', { class: 'tag hand' }, '手'), 'は机と棚での手しごと、', h('span', { class: 'tag logic' }, '理'), 'は要求書の読み解きです。'),
          h('div', { class: 'guide-grid' }, all.filter((g) => !g.min).map((g) => card(g)))),
        h('section', { class: 'chapter' }, h('h2', {}, '依頼に出てくる要素'),
          h('p', { class: 'chapter-note' }, '飛び込み・広告・稽古の依頼では、格が上がるごとに決まりごとが加わります。依頼の札に書かれた名前と、ここの見出しは同じです。'),
          h('div', { class: 'guide-grid' }, all.filter((g) => g.min).map((g) => card(g)))));
    }
    const mine = all.filter((g) => keys.includes(g.key));
    const rest = all.filter((g) => !keys.includes(g.key));
    return h('div', { class: 'guide-grid one' }, mine.map((g) => card(g, true)), rest.map((g) => card(g)));
  }

  function header(active) {
    const nav = (id, label) => h('button', { class: 'nav' + (active === id ? ' on' : ''), onclick: () => go(id) }, label);
    return h('header', { class: 'masthead' },
      h('div', { class: 'sign' },
        h('span', { class: 'seal', 'aria-hidden': 'true' }, '堂'),
        h('div', {}, h('h1', {}, 'ひきだし堂'), h('p', {}, '書類整理 うけたまわります'))),
      h('nav', {}, nav('home', '受付'), nav('guide', '手引き'), nav('shop', '道具屋'), nav('ledger', '帳簿')),
      h('div', { class: 'purse', title: '手持ちの報酬' }, h('small', {}, '手持ち'), h('strong', {}, P().state.coins), ' 文'));
  }

  function go(screen, arg) {
    endLevel();
    if (screen === 'play') return startLevel(arg);
    const body = screen === 'shop' ? shopBody() : screen === 'ledger' ? ledgerBody()
      : screen === 'guide' ? h('main', { class: 'page' }, guideList()) : homeBody();
    $('app').replaceChildren(header(screen), body);
    window.scrollTo(0, 0);
  }

  /* ══════════ 受付 ══════════ */
  function homeBody() {
    const first = !Object.keys(P().state.levels).length;
    return h('main', { class: 'page' },
      first && h('p', { class: 'welcome' },
        'いらっしゃい。ここは、散らかったフォルダを預かって整える店です。',
        '依頼主の', h('em', {}, '要求書'), 'を読み、棚を組み、納品して報酬をもらいます。',
        h('span', { class: 'tag hand' }, '手'), 'は机と棚での手しごと、',
        h('span', { class: 'tag logic' }, '理'), 'は要求書の読み解き。依頼ごとに、どちらがどれだけ要るかを示してあります。'),
      modeTabs(),
      { walkin: walkinSection, train: trainSection, ad: adSection, keiko: customSection }[homeMode]());
  }

  /* 受付はまず「どの種類の依頼か」を選び、選んだものの詳細だけを下に出す */
  let homeMode = null;
  function modeTabs() {
    const st = P().state;
    const open = P().walkinsOpen();
    const done = G.levels.filter((l) => P().passed(l.id)).length;
    if (!homeMode) homeMode = open ? 'walkin' : 'train';
    const modes = [
      { id: 'walkin', name: '飛び込みの依頼', note: '店の格に合わせて届く。納めると格が上がる', stat: open ? `店の格 ${st.rank}・3 件待ち` : '最初の修業を納めると届く' },
      { id: 'train', name: '修業の依頼', note: '手ほどきつき。基本を順に身につける', stat: `${done} / ${G.levels.length} 件を納めた` },
      { id: 'ad', name: '広告を打つ', note: 'お金を払い、好きな格の依頼を呼び込む。報酬は満額', stat: st.ads.length ? `${st.ads.length} 件を受注中` : '受注なし' },
      { id: 'keiko', name: '稽古をつくる', note: '好きな格をまとめて作って試す。報酬は三割', stat: st.custom.length ? `${st.custom.length} 件` : 'まだ作っていない' },
    ];
    return h('div', { class: 'modes', role: 'tablist', 'aria-label': '依頼の種類' }, modes.map((m) =>
      h('button', {
        class: 'mode' + (m.id === homeMode ? ' on' : ''), role: 'tab', 'aria-selected': String(m.id === homeMode),
        onclick: () => { homeMode = m.id; go('home'); },
      }, h('strong', {}, m.name), h('span', {}, m.note), h('small', {}, m.stat))));
  }

  function trainSection() {
    return h('div', {}, G.chapters.map((ch) => h('section', { class: 'chapter' },
      h('h2', {}, ch.title), h('p', { class: 'chapter-note' }, ch.note),
      h('div', { class: 'jobs' }, G.levels.filter((l) => l.chapter === ch.id).map((l) => jobCard(l))))));
  }

  function adSection() {
    const coins = P().state.coins;
    const lv = h('input', { type: 'number', min: 1, max: G.gen.MAX_LEVEL, value: Math.min(G.gen.MAX_LEVEL, P().state.rank), 'aria-label': '広告を打つ格' });
    const quote = h('p', { class: 'quote', 'aria-live': 'polite' });
    const buy = h('button', { class: 'btn primary', type: 'submit' }, '広告を打つ');
    const level = () => Math.max(1, Math.min(G.gen.MAX_LEVEL, Number(lv.value) || 1));
    const show = () => {
      const L = level(), cost = G.gen.adCost(L);
      quote.replaceChildren(`格 ${L} の広告費は `, h('b', {}, `${cost} 文`),
        `。合格すれば、報酬は少なくとも ${G.gen.adFloor(L)} 文（広告費を必ず上回ります）。`,
        coins < cost ? h('span', { class: 'short' }, ` あと ${cost - coins} 文足りません。`) : '',
        G.gen.freshAt(L).length ? ` この格で加わる要素: 「${G.gen.freshAt(L).join('」「')}」` : '');
      buy.disabled = coins < cost;
    };
    lv.addEventListener('input', show);
    show();
    const list = P().ads();
    return h('section', { class: 'chapter' }, h('h2', {}, '広告を打つ'),
      h('p', { class: 'chapter-note' },
        '手持ちのお金で広告を出すと、指定した格の依頼が 1 件届きます。店の格より上でも下でも選べます。格が高いほど広告費も高くなります。',
        '報酬は飛び込みと同じ満額で、納めるまで何度でもやり直せます。広告の依頼では店の格は上がりません。'),
      h('form', {
        class: 'maker',
        onsubmit: (e) => {
          e.preventDefault();
          const L = level();
          if (P().buyAd(L)) { toast(`格 ${L} の広告を打ちました。依頼が 1 件届いています`); go('home'); }
        },
      }, h('label', {}, '格', lv), buy, quote),
      h('table', { class: 'ledger rates' },
        h('caption', {}, '広告費の一覧'),
        h('tbody', {},
          h('tr', {}, h('th', {}, '格'), Array.from({ length: G.gen.MAX_LEVEL }, (_, i) => h('td', {}, i + 1))),
          h('tr', {}, h('th', {}, '広告費'), Array.from({ length: G.gen.MAX_LEVEL }, (_, i) => h('td', {}, G.gen.adCost(i + 1)))),
          h('tr', {}, h('th', {}, '報酬の下限'), Array.from({ length: G.gen.MAX_LEVEL }, (_, i) => h('td', {}, G.gen.adFloor(i + 1)))))),
      list.length ? h('div', { class: 'jobs' }, list.map((l) => jobCard(l)))
        : h('p', { class: 'empty' }, '受注中の依頼はありません。'));
  }

  /* 要素の札（例外・クラウド…）。その格で初めて出る要素には印をつける */
  const mechChips = (L) => h('span', { class: 'chips' },
    L.mechs.length ? L.mechs.map((k) => h('i', { class: G.gen.MECHS[k].min === L.level ? 'new' : '' }, G.gen.MECHS[k].label))
      : h('i', {}, '基本の分類のみ'));

  function walkinSection() {
    if (!P().walkinsOpen()) {
      return h('section', { class: 'chapter' }, h('h2', {}, '飛び込みの依頼'),
        h('p', { class: 'chapter-note' }, '最初の依頼を納めると、店に飛び込みの依頼が届きはじめます。'));
    }
    const rank = P().state.rank;
    const fresh = G.gen.freshAt(rank);
    return h('section', { class: 'chapter' },
      h('h2', {}, '飛び込みの依頼', h('span', { class: 'rank' }, `店の格 ${rank}`, h('small', {}, ` / ${G.gen.MAX_LEVEL}`))),
      h('p', { class: 'chapter-note' },
        'いつも 3 件が待っています。いまの格の依頼を納めると、店の格が上がります。格が上がると増えるのはファイルの数ではなく、決まりごとの数と、その掛け合わせです。',
        fresh.length ? ` この格から「${fresh.join('」「')}」が加わります。` : ''),
      h('div', { class: 'jobs' }, P().walkins().map((l) => jobCard(l))));
  }

  function customSection() {
    const lv = h('input', { type: 'number', min: 1, max: G.gen.MAX_LEVEL, value: Math.min(G.gen.MAX_LEVEL, P().state.rank), id: 'mk-level' });
    const n = h('input', { type: 'number', min: 1, max: 10, value: 3, id: 'mk-count' });
    const list = P().customs();
    return h('section', { class: 'chapter' }, h('h2', {}, '稽古をつくる'),
      h('p', { class: 'chapter-note' }, `格（1〜${G.gen.MAX_LEVEL}）と件数を決めて、依頼をまとめて作れます。店の格に関係なく、どの格でも試せます。稽古の報酬は三割です。`),
      h('form', {
        class: 'maker',
        onsubmit: (e) => {
          e.preventDefault();
          const level = Math.max(1, Math.min(G.gen.MAX_LEVEL, Number(lv.value) || 1));
          const count = Math.max(1, Math.min(10, Number(n.value) || 1));
          P().createCustom(level, count);
          toast(`格 ${level} の稽古を ${count} 件つくりました`);
          go('home');
        },
      },
        h('label', {}, '格', lv), h('label', {}, '件数', n),
        h('button', { class: 'btn primary', type: 'submit' }, 'まとめて作る'),
        list.length ? h('button', {
          class: 'btn ghost', type: 'button',
          onclick: () => { if (confirm(`稽古 ${list.length} 件をすべて片づけますか？（成績の記録は残ります）`)) { list.forEach((l) => P().removeCustom(l.id)); go('home'); } },
        }, 'すべて片づける') : null),
      list.length ? h('div', { class: 'jobs' }, list.map((l) => jobCard(l, () => { P().removeCustom(l.id); go('home'); }))) : null);
  }

  function jobCard(L, onRemove) {
    const open = P().unlocked(L);
    const e = P().entry(L.id);
    const card = h('button', { class: 'job-card' + (open ? '' : ' locked') + (e && e.passed ? ' done' : '') + (L.generated ? ' gen' : ''), disabled: !open, onclick: () => go('play', L.id) },
      h('span', { class: 'job-client' }, L.generated ? h('b', { class: 'grade' }, `格 ${L.level}`) : null, L.client,
        L.generated === 'a' ? h('i', { class: 'paid' }, `広告費 ${G.gen.adCost(L.level)} 文 支払い済み`) : null),
      h('span', { class: 'job-title' }, L.title),
      L.generated ? mechChips(L) : null,
      L.generated ? h('span', { class: 'job-scale' }, `${L.trade}・${L.sceneLabel}　決まりごと ${L.mechs.length}　掛け合わせ ${L.combos}　ファイル ${L.files.length}`) : null,
      h('span', { class: 'job-mix' }, pips(L.hand, 'hand'), pips(L.logic, 'logic')),
      h('span', { class: 'job-foot' },
        open ? h('span', {}, `報酬 ${L.reward} 文`) : h('span', {}, '前の依頼を納めると届きます'),
        e && e.passed ? stars(e.stars) : null),
      e && e.passed ? h('span', { class: 'job-stamp', 'aria-hidden': 'true' }, '済') : null);
    if (!onRemove) return card;
    return h('div', { class: 'job-wrap' }, card,
      h('button', { class: 'mini job-remove', title: 'この稽古を片づける', 'aria-label': `稽古「${L.title}」を片づける`, onclick: onRemove }, '×'));
  }

  /* ══════════ 道具屋 ══════════ */
  function shopBody() {
    const group = (side, title, note) => h('section', { class: 'chapter' },
      h('h2', {}, title), h('p', { class: 'chapter-note' }, note),
      h('div', { class: 'wares' }, G.tools.list.filter((t) => t.side === side).map((t) => {
        const own = P().owns(t.id), short = P().state.coins < t.price;
        const lacking = (t.requires || []).filter((r) => !P().owns(r)).map((r) => G.tools.get(r).name);
        return h('article', { class: 'ware ' + side + (own ? ' own' : '') },
          h('h3', {}, t.name, t.requires ? h('small', {}, `「${t.requires.map((r) => G.tools.get(r).name).join('」「')}」の強化`) : null),
          h('p', {}, t.blurb),
          h('div', { class: 'ware-foot' },
            h('span', { class: 'price' }, `${t.price} 文`),
            own ? h('span', { class: 'owned' }, '所持')
              : h('button', { class: 'btn primary', disabled: short || lacking.length > 0, onclick: () => { if (P().buy(t)) { toast(`「${t.name}」を手に入れました`); go('shop'); } } },
                lacking.length ? `先に「${lacking[0]}」が要ります` : short ? `あと ${t.price - P().state.coins} 文` : '買う')));
      })));
    return h('main', { class: 'page' },
      group('hand', '手の道具', 'つかむ・運ぶ・見渡す。手しごとを速くします。'),
      group('logic', '理の道具', '確かめる・条件で動かす。読み解きを助け、理屈で束を動かします。'));
  }

  /* ══════════ 帳簿 ══════════ */
  function ledgerBody() {
    const sum = P().skillSummary();
    const skillCol = (side, title) => h('div', { class: 'skill-col ' + side }, h('h3', {}, title),
      Object.keys(G.skills).filter((k) => G.skills[k].side === side).map((k) => h('div', { class: 'skill' },
        h('div', { class: 'skill-head' }, h('strong', {}, G.skills[k].label), h('span', {}, G.skills[k].desc),
          h('b', {}, sum[k].value == null ? '—' : pct(sum[k].value))),
        bar(sum[k].value, side))));
    const st = P().state;
    const totalStars = Object.values(st.levels).reduce((a, e) => a + e.stars, 0);
    return h('main', { class: 'page' },
      h('section', { class: 'chapter' }, h('h2', {}, '技能'),
        h('p', { class: 'chapter-note' }, 'それぞれの技能が問われた依頼での、最高成績の平均です。'),
        h('div', { class: 'skills' }, skillCol('hand', '手 — 手しごと'), skillCol('logic', '理 — 読み解き'))),
      h('section', { class: 'chapter' }, h('h2', {}, '依頼の記録'),
        h('p', { class: 'chapter-note' }, `納品 ${st.stats.submissions} 回 ／ 星 ${totalStars} / ${G.levels.length * 3} ／ 手持ち ${st.coins} 文 ／ 合格した依頼にかけた時間の合計 ${clock(st.stats.time || 0)}`),
        h('div', { class: 'table-wrap' }, h('table', { class: 'ledger' },
          h('thead', {}, h('tr', {}, ['依頼', '星', '充足度', '手数 / 目安', '最短の時間', '受け取った報酬', '納品回数'].map((x) => h('th', {}, x)))),
          h('tbody', {}, G.levels.map((L) => {
            const e = P().entry(L.id);
            return h('tr', { class: e ? '' : 'none' },
              h('td', {}, L.title, h('small', {}, L.client)),
              h('td', {}, e ? stars(e.stars) : '—'),
              h('td', {}, e ? pct(e.quality) : '—'),
              h('td', {}, e && e.ops != null ? `${e.ops} / ${G.computePar(L)}` : '—'),
              h('td', {}, e && e.time != null ? clock(e.time) : '—'),
              h('td', {}, e ? `${e.earned} / ${L.reward} 文` : '—'),
              h('td', {}, e ? e.plays : '—'));
          }))))),
      genLedger(),
      h('p', { class: 'reset' }, h('button', { class: 'btn ghost', onclick: () => {
        if (confirm('帳簿をすべて白紙に戻します。よろしいですか？')) { P().reset(); go('home'); }
      } }, '帳簿を白紙に戻す')));
  }

  function genLedger() {
    const rows = Object.entries(P().state.levels).filter(([, e]) => e.kind).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    if (!rows.length) return null;
    const by = {};
    rows.forEach(([, e]) => { if (e.passed) by[e.level] = (by[e.level] || 0) + 1; });
    return h('section', { class: 'chapter' }, h('h2', {}, '飛び込み・稽古の記録'),
      h('p', { class: 'chapter-note' }, `店の格 ${P().state.rank} ／ 納めた件数: ` +
        (Object.keys(by).length ? Object.keys(by).map((k) => `格${k} ×${by[k]}`).join('、') : 'まだありません')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'ledger' },
        h('thead', {}, h('tr', {}, ['依頼', '格', '星', '充足度', '手数', '時間', '受け取った報酬'].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.slice(0, 12).map(([, e]) => h('tr', {},
          h('td', {}, e.title, h('small', {}, KIND_NAME[e.kind])),
          h('td', {}, e.level), h('td', {}, stars(e.stars)), h('td', {}, pct(e.quality)),
          h('td', {}, e.ops == null ? '—' : e.ops), h('td', {}, e.time != null ? clock(e.time) : '—'), h('td', {}, `${e.earned} 文`)))))));
  }

  /* ══════════ 作業 ══════════ */
  function endLevel() {
    if (!S) return;
    S.off.forEach((f) => f && f());
    S = null;
    document.body.classList.remove('playing');
  }

  function startLevel(id) {
    const level = G.levelById(id);
    if (!level) return go('home');
    /* 手ほどき: 手づくりの依頼は決まった筋書き、生成した依頼は「初めて出会う要素」だけを説明する */
    const steps = level.tutorial || (level.teach
      ? P().unseen(level.teach.map((t) => t.mech)).map((m) => level.teach.find((t) => t.mech === m)) : []);
    S = {
      steps, filter: '',
      level, ws: new G.Workspace(level), par: G.computePar(level), attempts: 0, lastEval: null,
      selected: new Set(), inspected: null, renaming: null, deskSort: null,
      folded: new Set(), caps: new Set(level.grants || []), controls: [], panel: null, tut: 0, off: [],
    };
    const ctx = {
      ws: S.ws, level, caps: S.caps, bus: G.bus,
      ui: {
        addControl: (el) => S.controls.push(el),
        openPanel: (p) => { S.panel = p; drawPanel(); },
        closePanel: () => { S.panel = null; drawPanel(); },
        toast, refresh, selection: () => [...S.selected],
        setDeskSort: (a) => { S.deskSort = a; drawDesk(); },
        setDeskFilter: (q) => { S.filter = q.trim(); drawDesk(); },
        visibleDesk: () => deskFiles().map((f) => f.id),
        select: (ids) => { S.selected = new Set(ids); S.inspected = ids.length === 1 ? ids[0] : null; refresh(); },
      },
    };
    G.tools.list.filter((t) => P().owns(t.id)).forEach((t) => S.off.push(t.setup(ctx)));
    S.half = Math.ceil(S.ws.children('desk').length / 2);
    S.off.push(G.bus.on('ws:change', (d) => {
      /* 砂時計は、最初に手を動かしたときから進む */
      if (!S.t0 && d.cmd !== 'release') S.t0 = Date.now();
      /* 机の上が半分片づいたら、追加のファイルが届く */
      if (S.ws.pending().length && S.ws.children('desk').length <= S.half) return arrive();
      S.stale = true; prune(); tutEvent('ws:change', d); refresh(); }));
    S.off.push(G.bus.on('ui:inspect', (d) => tutEvent('ui:inspect', d)));
    S.off.push(G.bus.on('ui:submit', (d) => tutEvent('ui:submit', d)));
    /* 経過時間は、納期のあるなしに関わらず毎秒描き直す */
    const tick = setInterval(() => S && S.t0 && !S.done && drawMeter(), 1000);
    S.off.push(() => clearInterval(tick));
    document.body.classList.add('playing');

    const hints = new Set();
    S.ws.files().forEach((f) => [f.attrs.kind, f.attrs.year + '年', f.attrs.proj, f.attrs.doc, f.attrs.author].forEach((v) => v && hints.add(String(v))));
    level.constraints.forEach((c) => {
      const paths = (c.rules || []).map((r) => r.path).concat(c.paths || [], c.path ? [c.path] : []);
      paths.forEach((p) => p.forEach((seg) => !seg.includes('{') && hints.add(seg)));
    });

    $('app').replaceChildren(
      h('div', { class: 'play' },
        h('div', { class: 'topbar' },
          h('button', { class: 'btn ghost', onclick: () => go('home') }, '← 受付へ'),
          h('div', { class: 'job' },
            h('small', {}, level.generated ? `${KIND_NAME[level.generated]}・格 ${level.level}　` : '', level.client),
            h('strong', {}, level.title)),
          h('div', { class: 'meter', id: 'meter' }),
          h('button', { class: 'btn', id: 'undo', onclick: () => S.ws.undo() }, 'ひとつ戻す'),
          h('button', { class: 'btn', onclick: () => { if (!S.ws.ops || confirm('この依頼を最初からやり直しますか？')) go('play', level.id); } }, '最初から'),
          h('button', { class: 'btn primary', id: 'submit', onclick: submit }, '納品する')),
        /* 手引きの札: この依頼に出てくる要素を、いつでも引ける */
        h('div', { class: 'keys', role: 'toolbar', 'aria-label': '手引き' },
          h('span', { class: 'keys-label' }, '手引き'),
          BASICS.map((b) => h('button', { class: 'key ' + b.side, onclick: () => showGuide(b.key) }, b.label)),
          (level.mechs || []).length ? h('span', { class: 'keys-sep' }, 'この依頼の要素') : null,
          (level.mechs || []).map((k) => h('button', { class: 'key elem ' + G.gen.MECHS[k].side, onclick: () => showGuide(k) }, G.gen.MECHS[k].label))),
        h('div', { id: 'tut' }),
        h('div', { class: 'grid' },
          h('section', { class: 'side hand' },
            h('div', { class: 'side-head' },
              h('h2', { class: 'side-label' }, h('span', { class: 'tag hand' }, '手'), '手しごと', h('small', {}, 'つかむ・運ぶ・名づける')),
              h('div', { class: 'belt', id: 'belt' })),
            h('div', { class: 'hand-cols' },
              h('div', { class: 'desk', 'data-drop-id': 'desk' }, h('h3', { id: 'desk-head' }), h('div', { class: 'pile', id: 'pile' })),
              h('div', { class: 'shelf', 'data-drop-id': 'root' },
                h('h3', {}, '納品棚',
                  h('button', { class: 'btn small ghost fold-all', id: 'fold-all', onclick: foldAll }, 'すべて畳む'),
                  h('button', { class: 'btn small shelf-add', onclick: () => addFolder('root') }, '＋ フォルダ')),
                h('div', { class: 'shelf-body', id: 'shelf' }))),
            h('div', { class: 'slip', id: 'slip' })),
          h('section', { class: 'side logic' },
            h('h2', { class: 'side-label' }, h('span', { class: 'tag logic' }, '理'), '要求書', h('small', {}, '読む・照らす・確かめる')),
            h('div', { class: 'spec', id: 'spec' }))),
        h('div', { id: 'panel' }),
        h('div', { id: 'overlay' }),
        h('datalist', { id: 'namehints' }, [...hints].map((v) => h('option', { value: v })))));
    refresh();
    window.scrollTo(0, 0);
    G.bus.emit('level:start', { level, ctx });
  }

  function prune() {
    S.selected.forEach((id) => S.ws.node(id) || S.selected.delete(id));
    if (S.inspected && !S.ws.node(S.inspected)) S.inspected = null;
  }

  function refresh() {
    if (!S) return;
    drawMeter(); drawBelt(); drawDesk(); drawShelf(); drawSlip(); drawSpec(); drawTut(); drawPanel();
  }

  /* 追加のファイルが届く */
  function arrive() {
    const n = S.ws.pending().length;
    if (!n) return;
    S.arrived = true; // 先に印をつける（届いた拍子の描き直しで、要求書に追伸を出すため）
    S.ws.release();
    toast(`追加のファイルが ${n} 個届きました。要求書に追伸があります`);
  }
  const elapsed = () => (S.t0 ? ((S.tEnd || Date.now()) - S.t0) / 1000 : 0);
  const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  function drawMeter() {
    const cap = G.opsLimit(S.level);
    const limit = G.timeLimit(S.level);
    const left = limit ? limit - elapsed() : 0;
    $('meter').replaceChildren(
      limit ? h('span', { class: 'timer' + (left < 0 ? ' late' : left < 60 ? ' soon' : ''), title: '手を動かしはじめてから計ります。遅れても差し戻しにはなりません' },
        h('small', {}, left < 0 ? '遅れ' : S.t0 ? '納期まで' : '納期'), h('strong', {}, clock(Math.abs(left)))) : null,
      h('span', { class: 'timer', title: '最初に手を動かしたときから計ります。読んで考える時間は含みません' },
        h('small', {}, '経過'), h('strong', {}, clock(elapsed()))),
      h('small', {}, '手数'), h('strong', { class: cap && S.ws.ops > cap ? 'over' : '' }, S.ws.ops),
      h('span', {}, ` / 目安 ${S.par}`, cap ? `・上限 ${cap}` : ''));
    $('undo').disabled = !S.ws.history.length;
  }
  function drawBelt() {
    $('belt').replaceChildren(h('span', { class: 'belt-label' }, '道具'),
      S.controls.length ? S.controls : h('span', { class: 'belt-note' }, 'まだ持っていません（報酬で道具屋から買えます）'));
  }

  function fileChip(f, messy) {
    const tilt = messy ? `transform: rotate(${(hash(f.id + f.name) % 9) - 4}deg) translateY(${(hash(f.name) % 7) - 3}px)` : '';
    return h('div', {
      class: `file ${KIND_CLASS[f.attrs.kind] || ''}` + (S.selected.has(f.id) ? ' sel' : '') + (f.role ? ' ref-' + f.role : '') + (f.broken ? ' broken' : ''),
      'data-drag-id': f.id, 'data-file': true, style: tilt,
      title: f.role === 'copy' ? '写し: ' + f.name : f.role === 'link' ? '近道: ' + f.name : f.name,
    }, h('span', { class: 'kind' }, f.broken ? '切' : f.role === 'copy' ? '写' : f.role === 'link' ? '近' : f.attrs.kind[0]),
    h('span', { class: 'fname' }, f.name));
  }

  /* 机の上に見えているファイル（虫めがねの絞り込みと、並べ札の順を反映） */
  function deskFiles() {
    let files = S.ws.children('desk');
    const q = S.filter.normalize('NFKC').toLowerCase();
    if (q) {
      files = files.filter((f) => [f.name].concat(Object.keys(G.attrs).filter((k) => !G.attrs[k].hidden).map((k) => G.fmtAttr(k, G.attr(f, k))))
        .some((v) => String(v).normalize('NFKC').toLowerCase().includes(q)));
    }
    const a = S.deskSort;
    if (a) {
      files = files.slice().sort((x, y) =>
        String(G.attr(x, a)).localeCompare(String(G.attr(y, a)), 'ja', { numeric: true }) || x.name.localeCompare(y.name, 'ja'));
    }
    return files;
  }
  function drawDesk() {
    const all = S.ws.children('desk').length;
    const files = deskFiles();
    const a = S.deskSort;
    $('desk-head').replaceChildren('机の上', h('small', {},
      !all ? '片づきました' : S.filter ? `${all} 個のうち ${files.length} 個` : `未整理 ${all} 個`));
    $('pile').className = 'pile' + (a ? ' tidy' : '');
    /* 並べ札を使っているときは、値の変わり目に小見出しを入れる */
    const out = [];
    let last;
    files.forEach((f) => {
      if (a && G.attr(f, a) !== last) { last = G.attr(f, a); out.push(h('p', { class: 'pile-head' }, G.fmtAttr(a, last))); }
      out.push(fileChip(f, !a));
    });
    $('pile').replaceChildren(files.length ? out : h('p', { class: 'empty' }, all ? '当てはまるファイルはありません' : '机の上は空です'));
  }

  function folderEl(d) {
    const kids = S.ws.children(d.id);
    const renaming = S.renaming === d.id;
    let name;
    if (renaming) {
      name = h('input', {
        class: 'rename', id: 'rename', value: d.name, list: 'namehints', 'aria-label': 'フォルダ名', maxlength: 30,
        onkeydown: (e) => {
          if (e.isComposing) return;
          if (e.key === 'Enter') commitRename(d.id, e.target.value);
          if (e.key === 'Escape') commitRename(d.id, null);
        },
        onblur: (e) => commitRename(d.id, e.target.value),
      });
    } else {
      name = d.locked ? h('span', { class: 'folder-name' }, d.name)
        : h('span', { class: 'folder-name', title: '二度押しで名前を変える', ondblclick: () => beginRename(d.id) }, d.name);
    }
    const folded = S.folded.has(d.id) && !renaming;
    const inside = S.ws.subtreeFiles(d.id).length;
    const mk = d.mark && G.marks[d.mark];
    return h('div', { class: 'folder' + (folded ? ' folded' : '') + (mk ? ' marked mark-' + d.mark : ''), 'data-drop-id': d.id, 'data-drag-id': d.id },
      h('div', { class: 'folder-tab', title: mk ? `備えつけ: ${mk.note}` : null },
        mk ? h('span', { class: 'mark-sign', 'aria-hidden': 'true' }, d.mark === 'vault' && !S.ws.lockedVault(d.id) ? '開' : mk.sign) : null,
        h('button', {
          class: 'mini fold', title: folded ? '開く' : '畳む', 'aria-expanded': String(!folded),
          'aria-label': `「${d.name}」を${folded ? '開く' : '畳む'}`,
          onclick: () => { folded ? S.folded.delete(d.id) : S.folded.add(d.id); drawShelf(); },
        }, folded ? '▸' : '▾'),
        name, h('small', { class: 'folder-count', title: 'この中のファイルの数' }, inside),
        d.locked ? null : h('button', { class: 'mini', title: '名前を変える', 'aria-label': `「${d.name}」の名前を変える`, onclick: () => beginRename(d.id) }, '名'),
        h('button', { class: 'mini', title: 'この中にフォルダを作る', 'aria-label': `「${d.name}」の中にフォルダを作る`, onclick: () => addFolder(d.id) }, '＋'),
        d.locked ? null : h('button', { class: 'mini', title: '片づける（中のファイルは机へ戻る）', 'aria-label': `「${d.name}」を片づける`, onclick: () => S.ws.removeFolder(d.id) }, '×')),
      folded ? null : h('div', { class: 'folder-body' },
        kids.filter((k) => k.type === 'folder').map(folderEl),
        kids.filter((k) => k.type === 'file').map((f) => fileChip(f, false)),
        kids.length ? null : h('span', { class: 'empty' }, '空')));
  }

  function drawShelf() {
    const kids = S.ws.children('root');
    $('shelf').replaceChildren(
      kids.filter((k) => k.type === 'folder').map(folderEl),
      h('div', { class: 'loose' }, kids.filter((k) => k.type === 'file').map((f) => fileChip(f, false))),
      kids.length ? null : h('p', { class: 'empty' }, '「＋ フォルダ」で引き出しを作り、机からファイルを運び入れます'));
    const all = S.ws.folders();
    $('fold-all').hidden = !all.length;
    $('fold-all').textContent = all.length && all.every((d) => S.folded.has(d.id)) ? 'すべて開く' : 'すべて畳む';
    const input = $('rename');
    if (input) { input.focus(); input.select(); }
  }
  function foldAll() {
    const all = S.ws.folders();
    if (all.every((d) => S.folded.has(d.id))) S.folded.clear();
    else all.forEach((d) => S.folded.add(d.id));
    drawShelf();
  }

  function addFolder(parentId) {
    S.folded.delete(parentId);
    const id = S.ws.createFolder(parentId);
    beginRename(id);
  }
  function beginRename(id) { S.renaming = id; drawShelf(); }
  function commitRename(id, value) {
    if (!S || S.renaming !== id) return;
    S.renaming = null;
    const node = S.ws.node(id);
    const v = value == null ? '' : value.trim();
    if (node && v && v !== node.name) {
      if (S.ws.rename(id, v)) return; // ws:change で描き直される
      toast('同じ名前のフォルダがすでにあります');
    }
    drawShelf();
  }

  function drawSlip() {
    const f = S.inspected && S.ws.node(S.inspected);
    if (!f) {
      $('slip').replaceChildren(h('p', { class: 'slip-empty' },
        S.selected.size > 1 ? `${S.selected.size} 個のファイルを掴んでいます` : 'ファイルを押すと、ここに「札」（属性）が出ます'));
      return;
    }
    const a = f.attrs;
    const cell = (label, v) => h('div', {}, h('dt', {}, label), h('dd', {}, v));
    const shown = Object.keys(G.attrs).filter((k) => G.attrs[k].slip && a[k] != null);
    const feat = S.level.features || {};
    const src = f.role && S.ws.node(f.src);
    $('slip').replaceChildren(h('div', { class: 'slip-card' + (f.role ? ' is-ref' : '') },
      h('div', { class: 'slip-top' },
        h('strong', { class: 'slip-name' }, f.name),
        f.broken ? h('span', { class: 'slip-role broken' }, '切れています（本体を動かしたため）。捨てて作り直します') : null,
        f.role ? h('span', { class: 'slip-role' }, f.role === 'copy' ? `「${src ? src.name : '原本'}」の写し` : `「${src ? src.name : '本体'}」への近道`) : null,
        h('span', { class: 'slip-actions' },
          !f.role && feat.copy ? h('button', { class: 'btn small', title: '写しを机の上につくる', onclick: () => refOf(f, 'copy') }, '写しをとる') : null,
          !f.role && feat.link ? h('button', { class: 'btn small', title: '近道を机の上につくる', onclick: () => refOf(f, 'link') }, '近道をつくる') : null,
          f.role ? h('button', { class: 'btn small', onclick: () => S.ws.removeRef(f.id) }, f.role === 'copy' ? 'この写しを捨てる' : 'この近道を捨てる') : null)),
      h('dl', {}, cell('日付', `${a.year}年${a.month}月`), shown.map((k) => cell(G.attrs[k].label, G.fmtAttr(k, a[k]))))));
  }
  function refOf(f, role) {
    const id = S.ws.makeRef(f.id, role);
    if (!id) return;
    S.selected = new Set([id]);
    S.inspected = id;
    refresh();
    toast(role === 'copy' ? '写しを机の上に置きました。「バックアップ」へ運びます' : '近道を机の上に置きました。「よく使う」へ運びます');
  }

  function drawSpec() {
    const L = S.level;
    const live = S.caps.has('liveCheck');
    const ev = live ? G.evaluate(L, S.ws) : S.lastEval;
    const items = ev ? ev.items : G.evaluate(L, S.ws).items;
    /* 納品のあとで棚を動かしたら、前回の印はもう当てにならない。薄くして、古い手がかりは出さない */
    const stale = !live && !!ev && S.stale;
    const old = stale ? ' stale' : '';
    const was = stale ? '前回の納品では' : '';
    const mark = (i) => !ev ? h('span', { class: 'mark none', title: '納品すると印がつきます' }, '・')
      : i.score >= 0.999 ? h('span', { class: 'mark ok' + old, title: was + '満たしています' }, '○')
        : i.score >= 0.5 ? h('span', { class: 'mark part' + old, title: was + '一部だけ満たしています' }, '△')
          : h('span', { class: 'mark ng' + old, title: was + '満たしていません' }, '×');
    $('spec').replaceChildren(
      /* 手紙は畳める。長い依頼では、読み終えたら畳んで条項を広く見られる */
      h('details', { class: 'letter', open: !S.letterShut, ontoggle: (e) => { S.letterShut = !e.target.open; } },
        h('summary', {}, '依頼の手紙'),
        L.letter.split('\n').map((para) => h('p', {}, para)),
        S.arrived && L.lateNote ? h('p', { class: 'postscript' }, L.lateNote) : null,
        h('p', { class: 'from' }, L.client)),
      h('h3', {}, '条項', h('small', {}, live ? '印はいまの棚の状態です'
        : stale ? '薄い印は前回の納品のものです。そのあと棚を動かしたので、納品すると付け直されます'
          : ev ? '印は今回の納品の結果です' : '印は納品するとつきます')),
      h('ol', { class: 'clauses' }, items.map((i) => h('li', { class: 'clause' },
        mark(i),
        h('div', {},
          h('span', { class: 'clause-kind' }, i.title),
          i.lines.map((l) => h('p', {}, l)),
          /* その場の検印では件数だけ。どこが違うかの手がかりは、納品して検収を受けたときに書き込まれる */
          live && i.violations.length ? h('p', { class: 'viol-count' }, `あと ${i.violations.length} 件`) : null,
          !live && ev && !stale && i.violations.length ? h('ul', { class: 'viol' },
            i.violations.slice(0, 3).map((v) => h('li', {}, v)),
            i.violations.length > 3 ? h('li', {}, `ほか ${i.violations.length - 3} 件`) : null) : null)))),
      h('p', { class: 'spec-note' }, '〈 〉は、ファイルの札に書かれた属性です。'));
  }

  /* ── 手ほどき ── */
  function tutEvent(ev, data) {
    if (!S) return;
    const steps = S.steps;
    let moved = false;
    while (steps[S.tut] && steps[S.tut].on === ev && (!steps[S.tut].test || steps[S.tut].test(S.ws, data))) { S.tut++; moved = true; }
    if (moved) drawTut();
  }
  function drawTut() {
    const steps = S.steps;
    const st = steps[S.tut];
    document.querySelectorAll('.tut-focus').forEach((el) => el.classList.remove('tut-focus'));
    if (!st) return $('tut').replaceChildren();
    if (st.focus) document.querySelectorAll(st.focus).forEach((el) => el.classList.add('tut-focus'));
    $('tut').replaceChildren(h('div', { class: 'coach ' + st.side },
      h('span', { class: 'tag ' + st.side }, st.side === 'hand' ? '手' : '理'),
      h('p', {}, h('b', {}, st.side === 'hand' ? '手ほどき（手しごと）' : '手ほどき（理）'), st.text),
      h('span', { class: 'coach-step' }, `${S.tut + 1} / ${steps.length}`),
      st.on ? null : h('button', { class: 'btn small', onclick: () => { S.tut++; drawTut(); } }, 'わかった')));
  }

  function drawPanel() {
    if (!S.panel) return $('panel').replaceChildren();
    $('panel').replaceChildren(h('aside', { class: 'panel' },
      h('h3', {}, h('span', { class: 'tag logic' }, '理'), S.panel.title,
        h('button', { class: 'mini', 'aria-label': '閉じる', onclick: () => { S.panel = null; drawPanel(); } }, '×')),
      S.panel.render()));
  }

  /* 作業中に手引きを引く。押した札の項目を先頭の近くに出し、この依頼の要素を上に集める */
  function showGuide(focus) {
    const keys = BASICS.map((b) => b.key).concat(S.level.mechs || []);
    const close = () => $('overlay').replaceChildren();
    $('overlay').replaceChildren(h('div', { class: 'veil', onclick: (e) => { if (e.target.classList.contains('veil')) close(); } },
      h('div', { class: 'report guide-sheet', role: 'dialog', 'aria-label': '手引き' },
        h('div', { class: 'report-head' }, h('div', {}, h('h2', {}, '手引き'), h('p', {}, S.level.title)),
          h('button', { class: 'btn', onclick: close }, '閉じる')),
        guideList(keys, focus))));
    const el = document.getElementById('g-' + focus);
    if (el) el.scrollIntoView({ block: 'center' });
    $('overlay').querySelector('.btn').focus({ preventScroll: true });
  }

  /* ── 納品と検収 ── */
  function submit() {
    /* まだ届いていない追加分があるうちは納品できない。先に届けて、納品は取りやめる */
    if (S.ws.pending().length) return arrive();
    S.attempts++;
    const res = G.score(S.level, S.ws, S.attempts, elapsed());
    S.lastEval = res.ev;
    S.stale = false;
    if (res.pass) { S.done = true; S.tEnd = Date.now(); }
    const before = P().entry(S.level.id);
    const best = before && before.time != null ? before.time : null; // 記帳する前の最短
    const { gain, rankUp } = P().record(S.level, res);
    G.bus.emit('ui:submit', { result: res });
    drawSpec();
    showReport(res, gain, rankUp, best);
  }

  function showReport(res, gain, rankUp, best) {
    const L = S.level;
    const i = G.levels.indexOf(L);
    const next = i >= 0 ? G.levels[i + 1] : null;
    const close = () => $('overlay').replaceChildren();
    const f2 = (v) => v.toFixed(2);
    $('overlay').replaceChildren(h('div', { class: 'veil' }, h('div', { class: 'report', role: 'dialog', 'aria-label': '検収書' },
      h('div', { class: 'report-head' },
        h('div', {}, h('small', {}, L.client), h('h2', {}, '検収書'), h('p', {}, L.title)),
        h('div', { class: 'stamp ' + (res.pass ? 'pass' : 'fail') }, res.pass ? '合格' : '差戻')),
      h('section', { class: 'report-sec logic' },
        h('h3', {}, h('span', { class: 'tag logic' }, '理'), '要求の充足', h('b', {}, pct(res.quality))),
        h('ul', { class: 'report-items' }, res.items.map((it) => h('li', {},
          h('span', { class: 'ri-text' }, h('em', {}, it.title), it.lines[0] || ''),
          bar(it.score, 'logic'), h('span', { class: 'ri-pct' }, pct(it.score))))),
        res.pass ? null : h('p', { class: 'report-note' },
          res.gated.length ? `「${res.gated[0].title}」の条項は、ひとつでも破ると差し戻しです。${res.gated[0].violations[0] || ''}。「ひとつ戻す」か「最初から」でやり直せます。`
            : `合格の目安は充足 ${pct(L.passAt || 0.9)} 以上です。要求書に、満たせていない条項の手がかりを書き込みました。`)),
      h('section', { class: 'report-sec hand' },
        h('h3', {}, h('span', { class: 'tag hand' }, '手'), '手際', h('b', {}, pct(res.tempo))),
        h('p', {}, `手数 ${res.ops}（目安 ${res.par}）／ 納品 ${res.attempts} 回目`,
          res.eff > 1 ? '　目安より少ない手数で仕上げました。' : ''),
        h('p', {}, `かかった時間 ${clock(res.elapsed)}`, res.ops ? `（1 手あたり ${res.pace.toFixed(1)} 秒）` : '',
          res.timeLimit ? `／ 納期 ${clock(res.timeLimit)}` : '',
          !res.timeLimit ? '' : res.timeFactor < 1 ? `　遅れのぶん、報酬が ${Math.round((1 - res.timeFactor) * 100)}% 減ります。` : '　納期に間に合いました。',
          best != null && res.pass ? (res.elapsed < best ? `　これまでの最短 ${clock(best)} を更新しました。` : `　これまでの最短は ${clock(best)}。`) : '')),
      res.pass ? h('section', { class: 'report-sec pay' },
        h('h3', {}, '報酬', stars(res.stars)),
        h('p', { class: 'formula' },
          `基本 ${L.reward} × 充足 ${f2(res.quality)} × 手際 ${f2(0.7 + 0.3 * res.tempo)} × 回数 ${f2(res.attemptFactor)}`,
          res.timeLimit ? ` × 納期 ${f2(res.timeFactor)}` : '', ' ＝ ', h('b', {}, `${res.reward} 文`)),
        h('p', {}, gain > 0 ? `受け取り ＋${gain} 文` : 'この依頼では、すでに同額以上を受け取っています（受け取り 0 文）',
          L.generated === 'c' ? '　稽古なので、基本の報酬は三割です。' : ''),
        rankUp ? h('p', { class: 'rank-up' }, `店の格が ${P().state.rank} に上がりました。`,
          G.gen.freshAt(P().state.rank).length ? `次からは「${G.gen.freshAt(P().state.rank).join('」「')}」のある依頼が届きます。` : '') : null) : null,
      h('div', { class: 'report-actions' },
        res.pass && next ? h('button', { class: 'btn primary', onclick: () => go('play', next.id) }, '次の依頼へ') : null,
        res.pass ? h('button', { class: 'btn', onclick: () => go('home') }, '受付へ戻る')
          : h('button', { class: 'btn primary', onclick: close }, '直して納品しなおす'),
        res.pass ? h('button', { class: 'btn ghost', onclick: () => go('play', L.id) }, 'もう一度') : null))));
    const btn = $('overlay').querySelector('.btn');
    if (btn) btn.focus();
  }

  /* ══════════ つかむ・運ぶ（ポインタ操作） ══════════ */
  let drag = null;
  function clearDropMarks() {
    document.querySelectorAll('.drop-ok').forEach((el) => el.classList.remove('drop-ok'));
  }
  function dropTargetAt(x, y, ids) {
    const el = document.elementFromPoint(x, y);
    const t = el && el.closest('[data-drop-id]');
    if (!t) return null;
    const id = t.dataset.dropId;
    return S.ws.movable(ids, id).ok.length ? { id, el: t } : null;
  }

  document.addEventListener('pointerdown', (e) => {
    if (!S || e.button !== 0 || e.target.closest('button, input, select, .veil, .panel')) return;
    const t = e.target.closest('[data-drag-id]');
    if (!t) {
      if (!S.renaming && (S.selected.size || S.inspected) && e.target.closest('.desk, .shelf')) {
        S.selected.clear(); S.inspected = null; refresh();
      }
      return;
    }
    if (S.renaming) return;
    e.preventDefault();
    drag = { id: t.dataset.dragId, x: e.clientX, y: e.clientY, on: false, mod: e.ctrlKey || e.metaKey || e.shiftKey };
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag || !S) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.on = true;
      const multi = S.caps.has('multiSelect') && S.selected.has(drag.id) && S.selected.size > 1;
      drag.ids = multi ? [...S.selected] : [drag.id];
      const n = S.ws.node(drag.id);
      drag.ghost = h('div', { class: 'drag-ghost' }, drag.ids.length > 1 ? `${drag.ids.length} 個のファイル` : n.name);
      document.body.append(drag.ghost);
      document.body.classList.add('dragging');
    }
    drag.ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 10}px)`;
    drag.pt = { x: e.clientX, y: e.clientY };
    markDrop();
    if (!drag.raf) drag.raf = requestAnimationFrame(autoScroll);
  });

  function markDrop() {
    clearDropMarks();
    const t = dropTargetAt(drag.pt.x, drag.pt.y, drag.ids);
    if (t) t.el.classList.add('drop-ok');
  }

  /* 掴んだまま端へ寄せると、その先へ送る。画面の外にあるフォルダへも運べるようにするため。
     棚・机・要求書はそれぞれの枠の上下の端、ページ全体は画面の上下の端が「送り」の帯になる */
  const EDGE = 56;
  function autoScroll() {
    if (!drag || !drag.on) return;
    const { x, y } = drag.pt;
    const pull = (top, bottom) =>
      y < top + EDGE ? -Math.min(22, (top + EDGE - y) / 3 + 2) : y > bottom - EDGE ? Math.min(22, (y - (bottom - EDGE)) / 3 + 2) : 0;
    let moved = false;
    for (const id of ['shelf', 'pile', 'spec']) {
      const el = document.getElementById(id);
      if (!el || el.scrollHeight <= el.clientHeight + 1) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top - EDGE || y > r.bottom + EDGE) continue;
      const before = el.scrollTop;
      el.scrollTop += pull(r.top, r.bottom);
      moved = moved || el.scrollTop !== before;
    }
    if (!moved) {
      const page = document.scrollingElement;
      const bar = document.querySelector('.topbar');
      const before = page.scrollTop;
      page.scrollTop += pull(bar ? bar.getBoundingClientRect().bottom : 0, window.innerHeight);
      moved = page.scrollTop !== before;
    }
    if (moved) markDrop();
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function endDrag(e, cancelled) {
    if (!drag) return;
    const d = drag;
    drag = null;
    clearDropMarks();
    document.body.classList.remove('dragging');
    if (d.ghost) d.ghost.remove();
    if (!S || cancelled) return;
    if (d.on) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const t = el && el.closest('[data-drop-id]');
      if (!t) return;
      const r = S.ws.move(d.ids, t.dataset.dropId);
      if (!r.moved && r.reason) toast(r.reason);
      else if (r.moved) { S.selected.clear(); refresh(); }
      return;
    }
    /* 動かさずに離した = 押しただけ。ファイルなら選んで札を見る */
    const n = S.ws.node(d.id);
    if (!n || n.type !== 'file') return;
    if (d.mod && S.caps.has('multiSelect')) {
      S.selected.has(n.id) ? S.selected.delete(n.id) : S.selected.add(n.id);
    } else {
      S.selected = new Set([n.id]);
    }
    S.inspected = S.selected.size === 1 ? [...S.selected][0] : null;
    refresh();
    if (S.inspected) G.bus.emit('ui:inspect', { id: n.id });
  }
  document.addEventListener('pointerup', (e) => endDrag(e, false));
  document.addEventListener('pointercancel', (e) => endDrag(e, true));
  document.addEventListener('keydown', (e) => {
    if (!S || e.target.closest('input, select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); S.ws.undo(); }
    if (e.key === 'Escape') $('overlay').replaceChildren();
  });

  G.ui = { go, toast, refresh, get session() { return S; } };
})();
