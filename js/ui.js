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
  const KIND_CLASS = { 画像: 'k-img', 文書: 'k-doc', 表: 'k-tab', 音声: 'k-snd', 鍵: 'k-key', 控え: 'k-memo' };
  const KIND_NAME = { w: '飛び込み', c: '稽古', a: '広告', s: '事情' };

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
  /* 項目は見出しだけを並べ、押したものだけ本文を開く。
     keys を渡すと、その項目を「この依頼」として先頭に集める。focus は最初から開いておく */
  function guideList(keys, focus) {
    const all = guideEntries();
    const card = (g) => h('details', { class: 'guide-item ' + g.side, id: 'g-' + g.key, open: g.key === focus },
      h('summary', {}, h('span', { class: 'tag ' + g.side }, g.side === 'hand' ? '手' : '理'), h('b', {}, g.label),
        g.min ? h('small', {}, g.min > G.gen.MAX_LEVEL ? '事情のある依頼で' : `格 ${g.min}〜`) : null),
      h('p', {}, g.text));
    if (!keys) {
      return h('div', {},
        h('section', { class: 'chapter' }, h('h2', {}, '基本の操作'),
          h('p', { class: 'chapter-note' }, h('span', { class: 'tag hand' }, '手'), '机と棚の手しごと', h('span', { class: 'tag logic' }, '理'), '要求書の読み解き'),
          h('div', { class: 'guide-grid' }, all.filter((g) => !g.min).map((g) => card(g)))),
        h('section', { class: 'chapter' }, h('h2', {}, '依頼に出てくる要素'),
          h('p', { class: 'chapter-note' }, '格が上がるごとに加わる決まりごとです。'),
          h('div', { class: 'guide-grid' }, all.filter((g) => g.min).map((g) => card(g)))));
    }
    const mine = all.filter((g) => keys.includes(g.key));
    const rest = all.filter((g) => !keys.includes(g.key));
    return h('div', { class: 'guide-grid one' }, h('p', { class: 'guide-rest' }, 'この依頼'), mine.map((g) => card(g)),
      rest.length ? h('p', { class: 'guide-rest' }, 'そのほか') : null, rest.map((g) => card(g)));
  }

  function header(active) {
    const nav = (id, label) => h('button', { class: 'nav' + (active === id ? ' on' : ''), onclick: () => go(id) }, label);
    return h('header', { class: 'masthead' },
      h('div', { class: 'sign' },
        h('span', { class: 'seal' + (P().state.crowned ? ' crowned' : ''), 'aria-hidden': 'true' }, '堂'),
        h('div', {}, h('h1', {}, 'ひきだし堂'),
          h('p', {}, P().state.crowned ? '免許皆伝　書類整理 うけたまわります' : '書類整理 うけたまわります'))),
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
        'いらっしゃい。', h('em', {}, '要求書'), 'を読み、棚を組み、納品する店です。まずは修業 1 からどうぞ。'),
      modeTabs(),
      { walkin: walkinSection, sit: sitSection, train: trainSection, ad: adSection, keiko: customSection }[homeMode]());
  }

  /* 受付はまず「どの種類の依頼か」を選び、選んだものの詳細だけを下に出す */
  let homeMode = null;
  function modeTabs() {
    const st = P().state;
    const open = P().walkinsOpen();
    const done = G.levels.filter((l) => P().passed(l.id)).length;
    /* 修業が終わるまでは、修業を最初に開く */
    if (!homeMode) homeMode = done < G.levels.length ? 'train' : 'walkin';
    /* 札には名前と数だけを出す。説明は選んだあとの見出しの下と、札の title に置く */
    const modes = [
      { id: 'walkin', name: '飛び込み', note: '店の格に合わせて届く。納めると格が上がる', stat: open ? `格 ${st.rank}・3 件` : '修業 1 のあと' },
      { id: 'sit', name: '事情あり', note: '依頼主の事情から決まりが生まれる。格は中身のきつさで決まる', stat: open ? '3 件' : '修業 1 のあと' },
      { id: 'train', name: '修業', note: 'はじめての方はここから。8 つの修業で基本を順に身につける', stat: `${done} / ${G.levels.length}` },
      { id: 'ad', name: '広告', note: 'お金を払い、好きな格の依頼を呼び込む。報酬は満額', stat: st.ads.length ? `${st.ads.length} 件` : '—' },
      { id: 'keiko', name: '稽古', note: '好きな格をまとめて作って試す。報酬は三割', stat: st.custom.length ? `${st.custom.length} 件` : '—' },
    ];
    /* 修業が終わるまでは、修業を先頭に置く */
    if (done < G.levels.length) modes.unshift(modes.splice(modes.findIndex((m) => m.id === 'train'), 1)[0]);
    return h('div', { class: 'modes', role: 'tablist', 'aria-label': '依頼の種類' }, modes.map((m) =>
      h('button', {
        class: 'mode' + (m.id === homeMode ? ' on' : ''), role: 'tab', 'aria-selected': String(m.id === homeMode), title: m.note,
        onclick: () => { homeMode = m.id; go('home'); },
      }, h('strong', {}, m.name), h('small', {}, m.stat))));
  }

  function sitSection() {
    if (!P().walkinsOpen()) {
      return h('section', { class: 'chapter' }, h('h2', {}, '事情のある依頼'),
        h('p', { class: 'chapter-note' }, '修業 1 を納めると届きます。'));
    }
    const T = G.gen.TENDS;
    return h('section', { class: 'chapter' }, h('h2', {}, '事情のある依頼'),
      h('p', { class: 'chapter-note' }, '依頼主の事情から決まりが生まれます。格は、決まりどうしの取り合いの多さで決まります。'),
      /* 傾向は札だけを並べ、中身は札に触れると出る */
      h('p', { class: 'tends' }, h('small', {}, '傾向'),
        Object.keys(T).map((k) => h('b', { class: 'tend tend-' + k, title: T[k].desc, tabindex: 0 }, T[k].label))),
      h('div', { class: 'jobs' }, P().situated().map((l) => jobCard(l))));
  }

  /* 修業（チュートリアル）: 8 つの修業を、上から順にたどる一本の道のりとして見せる。
     どこまで進んだか、次はどれか、それぞれで何が身につくかが、ひと目で分かるようにする */
  function trainSection() {
    const total = G.levels.length;
    const done = G.levels.filter((l) => P().passed(l.id)).length;
    const next = G.levels.find((l) => !P().passed(l.id));
    const row = (L) => {
      const no = G.levels.indexOf(L) + 1;
      const e = P().entry(L.id);
      const passed = !!(e && e.passed);
      const state = passed ? 'done' : L === next ? 'next' : 'locked';
      /* 身につけることは「次の修業」にだけ書き出す。ほかの行は札に触れると出る */
      return h('li', { class: 'lesson ' + state },
        h('button', { class: 'lesson-btn', disabled: state === 'locked', title: L.learn.join(' ／ '), onclick: () => go('play', L.id) },
          h('span', { class: 'lesson-no', 'aria-hidden': 'true' }, passed ? '済' : no),
          h('span', { class: 'lesson-main' },
            h('span', { class: 'lesson-title' }, L.title),
            state === 'next' ? h('span', { class: 'lesson-learn' }, L.learn.map((t) => h('i', {}, t))) : null),
          h('span', { class: 'lesson-side' },
            state === 'locked' ? null : h('span', { class: 'job-mix' }, pips(L.hand, 'hand'), pips(L.logic, 'logic')),
            passed ? h('span', { class: 'lesson-state' }, stars(e.stars), e.time != null ? ` ${clock(e.time)}` : '')
              : state === 'next' ? h('span', { class: 'lesson-state' }, h('b', {}, 'はじめる →')) : null)),
        /* 修業 1 のあとに、ほかの依頼が開くことを道のりの上に示す */
        no === 1 && !passed ? h('p', { class: 'milestone' }, '納めると、飛び込み・事情あり・広告が開きます') : null);
    };
    return h('div', {},
      h('section', { class: 'chapter train-head' },
        h('h2', {}, '修業'),
        h('div', { class: 'train-bar' },
          h('span', { class: 'bar hand', role: 'img', 'aria-label': `修業 ${total} のうち ${done} を納めた` }, h('i', { style: `width:${(done / total) * 100}%` })),
          h('b', {}, `${done} / ${total}`),
          next ? h('button', { class: 'btn primary', onclick: () => go('play', next.id) },
            `${done ? '続き' : 'はじめる'}: 修業 ${G.levels.indexOf(next) + 1}`)
            : h('span', { class: 'owned' }, '修了'))),
      G.chapters.map((ch) => h('section', { class: 'chapter train-part' },
        h('h3', { class: 'train-chapter', title: ch.note }, ch.title),
        h('ol', { class: 'lessons' }, G.levels.filter((l) => l.chapter === ch.id).map(row)))),
      h('p', { class: 'train-foot' },
        'この先の決まりごとは、出会ったときに手ほどきが出ます。',
        h('button', { class: 'btn small', onclick: () => go('guide') }, '手引きを見る')));
  }

  function adSection() {
    const coins = P().state.coins;
    const lv = h('input', { type: 'number', min: 1, max: G.gen.MAX_LEVEL, value: Math.min(G.gen.MAX_LEVEL, P().state.rank), 'aria-label': '広告を打つ格' });
    const quote = h('p', { class: 'quote', 'aria-live': 'polite' });
    const buy = h('button', { class: 'btn primary', type: 'submit' }, '広告を打つ');
    const level = () => Math.max(1, Math.min(G.gen.MAX_LEVEL, Number(lv.value) || 1));
    const show = () => {
      const L = level(), cost = G.gen.adCost(L);
      quote.replaceChildren('広告費 ', h('b', {}, `${cost} 文`), ` → 報酬 ${G.gen.adFloor(L)} 文〜`,
        coins < cost ? h('span', { class: 'short' }, `　あと ${cost - coins} 文` ) : '',
        G.gen.freshAt(L).length ? h('span', { class: 'chips' }, G.gen.freshAt(L).map((t) => h('i', { class: 'new' }, t))) : '');
      buy.disabled = coins < cost;
    };
    lv.addEventListener('input', show);
    show();
    const list = P().ads();
    return h('section', { class: 'chapter' }, h('h2', {}, '広告を打つ'),
      h('p', { class: 'chapter-note' }, '広告費を払うと、選んだ格の依頼が 1 件届きます。報酬は満額、店の格は上がりません。'),
      h('form', {
        class: 'maker',
        onsubmit: (e) => {
          e.preventDefault();
          const L = level();
          if (P().buyAd(L)) { toast(`格 ${L} の広告を打ちました。依頼が 1 件届いています`); go('home'); }
        },
      }, h('label', {}, '格', lv), buy, quote),
      /* 一覧表は畳んでおく */
      h('details', { class: 'fold-sec rates-fold' }, h('summary', {}, '広告費の一覧'),
        h('table', { class: 'ledger rates' },
          h('tbody', {},
            h('tr', {}, h('th', {}, '格'), Array.from({ length: G.gen.MAX_LEVEL }, (_, i) => h('td', {}, i + 1))),
            h('tr', {}, h('th', {}, '広告費'), Array.from({ length: G.gen.MAX_LEVEL }, (_, i) => h('td', {}, G.gen.adCost(i + 1)))),
            h('tr', {}, h('th', {}, '報酬の下限'), Array.from({ length: G.gen.MAX_LEVEL }, (_, i) => h('td', {}, G.gen.adFloor(i + 1))))))),
      list.length ? h('div', { class: 'jobs' }, list.map((l) => jobCard(l))) : null);
  }

  /* 要素の札（例外・クラウド…）。その格で初めて出る要素には印をつける */
  const mechChips = (L) => h('span', { class: 'chips' },
    L.mechs.length ? L.mechs.map((k) => h('i', { class: G.gen.MECHS[k].min === L.level ? 'new' : '' }, G.gen.MECHS[k].label))
      : h('i', {}, '基本の分類のみ'));

  function walkinSection() {
    if (!P().walkinsOpen()) {
      return h('section', { class: 'chapter' }, h('h2', {}, '飛び込みの依頼'),
        h('p', { class: 'chapter-note' }, '修業 1 を納めると届きます。'));
    }
    const rank = P().state.rank;
    const fresh = G.gen.freshAt(rank);
    return h('section', { class: 'chapter' },
      h('h2', {}, '飛び込みの依頼', h('span', { class: 'rank' }, `店の格 ${rank}`, h('small', {}, ` / ${G.gen.MAX_LEVEL}`))),
      h('p', { class: 'chapter-note' }, 'いまの格の依頼を納めると、店の格が上がります。',
        fresh.length ? h('span', { class: 'chips' }, h('small', {}, 'この格から'), fresh.map((t) => h('i', { class: 'new' }, t))) : null),
      h('div', { class: 'jobs' }, P().walkins().map((l) => jobCard(l))));
  }

  function customSection() {
    const lv = h('input', { type: 'number', min: 1, max: G.gen.MAX_LEVEL, value: Math.min(G.gen.MAX_LEVEL, P().state.rank), id: 'mk-level' });
    const n = h('input', { type: 'number', min: 1, max: 10, value: 3, id: 'mk-count' });
    const list = P().customs();
    return h('section', { class: 'chapter' }, h('h2', {}, '稽古をつくる'),
      h('p', { class: 'chapter-note' }, '好きな格の依頼をまとめて作って試せます。報酬は三割です。'),
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
      h('span', { class: 'job-client' },
        L.generated ? h('b', { class: 'grade' }, `格 ${L.level}${L.situation ? ' 相当' : ''}`) : null,
        L.generated ? h('b', { class: 'tend tend-' + L.tend, title: `傾向: ${G.gen.TENDS[L.tend].desc}（${L.tendTally}）` }, L.tendLabel) : null,
        L.client,
        L.generated === 'a' ? h('i', { class: 'paid' }, '広告') : null),
      h('span', { class: 'job-title' }, L.title),
      L.generated ? mechChips(L) : null,
      h('span', { class: 'job-mix' }, pips(L.hand, 'hand'), pips(L.logic, 'logic')),
      h('span', { class: 'job-foot' },
        open ? h('span', {}, h('b', {}, L.reward), ' 文') : h('span', {}, '—'),
        L.generated ? h('span', { class: 'job-scale', title: `${L.trade}・${L.sceneLabel}／決まりごと ${L.mechs.length}・取り合い ${L.contested}・ファイル ${L.files.length}` },
          `ファイル ${L.files.length}`, L.contested ? `・取り合い ${L.contested}` : '',
          /* 手数の上限が「1 つずつ運ぶ目安」より低い依頼は、道具がないと納められない */
          G.needsTools(L) ? h('b', { class: 'need-tools', title: `手数の上限 ${G.opsLimit(L)} 手（1 つずつ運ぶと ${G.computePar(L)} 手、道具をすべて使うと ${G.computeIdeal(L)} 手）。設計図・まとめ掴みか仕分け札・複写機などが要ります` }, '道具必須') : null,
          L.alarm === 'warn' ? h('b', { class: 'need-tools', title: '機密をクラウドに置くと警告が出ます。すぐ直さないか、二度目で、その場で失敗になります' }, '通報あり') : null) : null,
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
          h('h3', {}, t.name, t.requires ? h('small', {}, `${t.requires.map((r) => G.tools.get(r).name).join('・')}の強化`) : null),
          h('p', {}, t.blurb),
          h('div', { class: 'ware-foot' },
            h('span', { class: 'price' }, `${t.price} 文`),
            own ? h('span', { class: 'owned' }, '所持')
              : h('button', { class: 'btn primary', disabled: short || lacking.length > 0, onclick: () => { if (P().buy(t)) { toast(`「${t.name}」を手に入れました`); go('shop'); } } },
                lacking.length ? `要「${lacking[0]}」` : short ? `あと ${t.price - P().state.coins} 文` : '買う')));
      })));
    return h('main', { class: 'page' },
      group('hand', '手の道具', '手しごとを速くします。'),
      group('logic', '理の道具', '読み解きを助け、条件で束を動かします。'));
  }

  /* ══════════ 帳簿 ══════════ */
  function ledgerBody() {
    const sum = P().skillSummary();
    const skillCol = (side, title) => h('div', { class: 'skill-col ' + side }, h('h3', {}, title),
      Object.keys(G.skills).filter((k) => G.skills[k].side === side).map((k) => h('div', { class: 'skill', title: G.skills[k].desc },
        h('div', { class: 'skill-head' }, h('strong', {}, G.skills[k].label),
          h('b', {}, sum[k].value == null ? '—' : pct(sum[k].value))),
        bar(sum[k].value, side))));
    const st = P().state;
    const totalStars = Object.values(st.levels).reduce((a, e) => a + e.stars, 0);
    const tile = (label, value, unit) => h('div', {}, h('dt', {}, label), h('dd', {}, value, unit ? h('small', {}, unit) : null));
    return h('main', { class: 'page' },
      h('dl', { class: 'tiles' },
        tile('店の格', st.rank, ` / ${G.gen.MAX_LEVEL}`), tile('手持ち', st.coins, ' 文'), tile('納品', st.stats.submissions, ' 回'),
        tile('修業の星', totalStars, ` / ${G.levels.length * 3}`), tile('かけた時間', clock(st.stats.time || 0))),
      h('section', { class: 'chapter' }, h('h2', { title: 'それぞれの技能が問われた依頼での、最高成績の平均です' }, '技能'),
        h('div', { class: 'skills' }, skillCol('hand', '手しごと'), skillCol('logic', '読み解き'))),
      h('section', { class: 'chapter' }, h('h2', {}, '修業の記録'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'ledger' },
          h('thead', {}, h('tr', {}, ['依頼', '星', '充足', '手数 / 目安', '最短', '報酬', '納品'].map((x) => h('th', {}, x)))),
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
    const tends = {};
    rows.forEach(([, e]) => {
      if (!e.passed) return;
      by[e.level] = (by[e.level] || 0) + 1;
      if (e.tend) tends[e.tend] = (tends[e.tend] || 0) + 1;
    });
    const tally = Object.keys(by).map((k) => `格 ${k} ×${by[k]}`).concat(Object.keys(tends).map((k) => `${k} ×${tends[k]}`));
    return h('section', { class: 'chapter' }, h('h2', {}, '依頼の記録'),
      tally.length ? h('p', { class: 'chapter-note chips' }, tally.map((t) => h('i', {}, t))) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'ledger' },
        h('thead', {}, h('tr', {}, ['依頼', '格', '星', '充足', '手数', '時間', '報酬'].map((x) => h('th', {}, x)))),
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
      notes: [],      // 控え帳に写した合言葉 { word, memoFor }
      warned: false,  // 機密をクラウドに置いて、すでに一度警告を受けた
      alert: null,    // いま出ている警告（直すまで消えない）
    };
    const ctx = {
      ws: S.ws, level, caps: S.caps, bus: G.bus,
      ui: {
        addControl: (el) => S.controls.push(el),
        openPanel: (p) => { S.panel = p; drawPanel(); },
        closePanel: () => { S.panel = null; drawPanel(); },
        toast, refresh, selection: () => [...S.selected],
        setDeskSort: (a) => { S.deskSort = a; drawDesk(); },
        setDeskFilter: (q) => { S.filter = q.trim(); drawDesk(); if (S.caps.has('locate')) drawShelf(); },
        visibleDesk: () => deskFiles().map((f) => f.id),
        select: (ids) => { S.selected = new Set(ids); S.inspected = ids.length === 1 ? ids[0] : null; refresh(); },
        reveal,
      },
    };
    G.tools.list.filter((t) => P().owns(t.id)).forEach((t) => S.off.push(t.setup(ctx)));
    S.half = Math.ceil(S.ws.children('desk').length / 2);
    S.off.push(G.bus.on('ws:change', (d) => {
      /* 目安や理論値の計算は、別の棚（模範解用）を動かす。いまの依頼の棚の変化だけを見る */
      if (d.ws !== S.ws) return;
      /* 砂時計は、最初に手を動かしたときから進む */
      if (!S.t0 && d.cmd !== 'release') S.t0 = Date.now();
      /* 机の上が半分片づいたら、追加のファイルが届く */
      if (S.ws.pending().length && S.ws.children('desk').length <= S.half) return arrive();
      S.stale = true; prune();
      if (checkAlarm()) return; // 通報されて、その場で失敗
      tutEvent('ws:change', d); refresh(); }));
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
      /* 番号づけのある依頼では、番号つきの名前も候補に出す */
      (c.names || []).forEach((n, i) => hints.add(`${String(i + 1).padStart(2, '0')}_${n}`));
    });

    $('app').replaceChildren(
      h('div', { class: 'play' },
        h('div', { class: 'topbar' },
          h('button', { class: 'btn ghost', onclick: () => go('home') }, '← 受付へ'),
          h('div', { class: 'job' },
            h('small', { title: level.generated ? `${level.client}／傾向 ${level.tendLabel}` : level.client },
              level.generated ? `${KIND_NAME[level.generated]}・格 ${level.level}${level.situation ? ' 相当' : ''}` : `修業 ${G.levels.indexOf(level) + 1} / ${G.levels.length}`),
            h('strong', {}, level.title)),
          h('div', { class: 'meter', id: 'meter' }),
          h('button', { class: 'btn ghost', title: '操作と、この依頼の決まりごとの説明', onclick: () => showGuide() }, '手引き'),
          h('button', { class: 'btn', id: 'undo', onclick: () => S.ws.undo() }, 'ひとつ戻す'),
          h('button', { class: 'btn', onclick: () => { if (!S.ws.ops || confirm('この依頼を最初からやり直しますか？')) go('play', level.id); } }, '最初から'),
          h('button', { class: 'btn primary', id: 'submit', onclick: submit }, '納品する')),
        /* この依頼に出てくる要素の札。押すと手引きのその項目が開く（基本の操作は上の「手引き」から） */
        (level.mechs || []).length ? h('div', { class: 'keys', role: 'toolbar', 'aria-label': 'この依頼の要素' },
          level.mechs.map((k) => h('button', { class: 'key ' + G.gen.MECHS[k].side, onclick: () => showGuide(k) }, G.gen.MECHS[k].label))) : null,
        h('div', { id: 'tut' }),
        h('div', { id: 'alarm', role: 'alert' }),
        h('div', { class: 'grid' },
          h('section', { class: 'side hand' },
            h('div', { class: 'side-head' },
              h('h2', { class: 'side-label' }, h('span', { class: 'tag hand' }, '手'), '手しごと'),
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
            h('h2', { class: 'side-label' }, h('span', { class: 'tag logic' }, '理'), '要求書'),
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
    drawMeter(); drawBelt(); drawDesk(); drawShelf(); drawSlip(); drawSpec(); drawTut(); drawAlarm(); drawPanel();
  }

  /* ── 通報: 機密をクラウドに置いたとき ──
   * 低い格（alarm='deadline'）では納品のときに差し戻されるだけ。
   * 高い格（alarm='warn'）では、置いた時点で警告が出る。次の操作で直っていなければ失敗。二度目は警告なしで失敗。
   * 戻り値: その場で失敗にしたら true */
  function leaked() {
    return G.withRaw(() => S.level.constraints.filter((c) => c.type === 'forbid').reduce((out, c) => {
      const zone = S.ws.findFolder(c.under);
      return out.concat(zone ? S.ws.files().filter((f) => f.role !== 'link' && G.match(c.when, f) && S.ws.isInside(f.id, zone)) : []);
    }, []));
  }
  function checkAlarm() {
    if (S.level.alarm !== 'warn' || S.failed) return false;
    const bad = leaked();
    if (!bad.length) { S.alert = null; return false; }
    if (S.alert) return failNow(`警告のあとも、機密のファイル「${bad[0].name}」がクラウドに残っていました。`);
    if (S.warned) return failNow(`機密のファイル「${bad[0].name}」を、もう一度クラウドに置きました。`);
    S.warned = true;
    S.alert = bad[0].name;
    return false;
  }
  function drawAlarm() {
    $('alarm').replaceChildren(S.alert ? h('div', { class: 'alarm' },
      h('b', {}, '警告'),
      h('p', {}, `機密のファイル「${S.alert}」がクラウドにあります。次の操作で必ず外へ出してください（「ひとつ戻す」でも構いません）。ほかの操作をするか、もう一度同じことが起きると、通報されてこの依頼は失敗になります。`)) : null);
  }
  function failNow(reason) {
    S.failed = true;
    S.done = true;
    S.tEnd = Date.now();
    refresh();
    $('overlay').replaceChildren(h('div', { class: 'veil' }, h('div', { class: 'report', role: 'alertdialog', 'aria-label': '通報' },
      h('div', { class: 'report-head' },
        h('div', {}, h('small', {}, S.level.client), h('h2', {}, '通報'), h('p', {}, S.level.title)),
        h('div', { class: 'stamp fail' }, '失敗')),
      h('section', { class: 'report-sec' },
        h('p', {}, reason),
        h('p', {}, '外から見える場所に機密が置かれたことが依頼主に伝わり、この依頼は打ち切られました。報酬はありません。最初からやり直せます。')),
      h('div', { class: 'report-actions' },
        h('button', { class: 'btn primary', onclick: () => go('play', S.level.id) }, '最初からやり直す'),
        h('button', { class: 'btn', onclick: () => go('home') }, '受付へ戻る')))));
    $('overlay').querySelector('.btn').focus();
    return true;
  }

  /* ── 控え帳と合言葉 ── */
  function noteDown(f) {
    if (S.notes.some((n) => n.word === f.attrs.word)) return toast('もう控え帳に写してあります');
    S.notes.push({ word: f.attrs.word, memoFor: f.attrs.memoFor });
    toast(`合言葉「${f.attrs.word}」を控え帳に写しました`);
    refresh();
  }
  /* 合言葉を控え帳から選ぶ小窓。選ぶと onPick(word) が呼ばれる */
  function pickWord(title, onPick) {
    S.panel = {
      title,
      render: () => h('div', { class: 'rule-form' },
        S.notes.length ? h('p', {}, '控え帳から選びます。') : h('p', { class: 'empty' }, '控え帳はまだ空です。「控え」の中のメモを押して、合言葉を写します。'),
        S.notes.map((n) => h('button', { class: 'btn word', onclick: () => { S.panel = null; onPick(n.word); refresh(); } },
          h('b', {}, n.word), h('small', {}, n.memoFor + '用')))),
    };
    drawPanel();
  }

  /* 所在札: そのファイルのある場所まで棚を開き、送り、しばらく光らせる */
  function reveal(id) {
    const f = S.ws.node(id);
    if (!f) return;
    for (let n = S.ws.node(f.parent); n; n = S.ws.node(n.parent)) S.folded.delete(n.id);
    S.selected = new Set([id]);
    S.inspected = id;
    refresh();
    const el = document.querySelector(`[data-drag-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1600);
  }
  const whereIs = (f) => (f.parent === 'desk' ? '机の上' : ['納品棚'].concat(S.ws.folderPath(f.parent)).join(' ▸ '));

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
      h('span', { title: cap ? `1 つずつ運ぶ目安 ${S.par} 手・道具をすべて使った理論値 ${G.computeIdeal(S.level)} 手・上限 ${cap} 手` : `1 つずつ運ぶ目安 ${S.par} 手・道具をすべて使った理論値 ${G.computeIdeal(S.level)} 手` }, ` / ${S.par}`, cap ? `・上限 ${cap}` : ''));
    $('undo').disabled = !S.ws.history.length;
  }
  /* 道具を持っていないあいだは、帯そのものを出さない */
  function drawBelt() {
    const book = S.notes.length ? h('span', { class: 'notebook', title: '控え帳に写した合言葉' },
      h('b', {}, '控え帳'), S.notes.map((n) => h('i', { title: n.memoFor + '用' }, n.word))) : null;
    $('belt').hidden = !S.controls.length && !book;
    $('belt').replaceChildren(S.controls, book);
  }

  function fileChip(f, messy) {
    const tilt = messy ? `transform: rotate(${(hash(f.id + f.name) % 9) - 4}deg) translateY(${(hash(f.name) % 7) - 3}px)` : '';
    return h('div', {
      class: `file ${KIND_CLASS[f.attrs.kind] || ''}` + (S.selected.has(f.id) ? ' sel' : '') + (f.role ? ' ref-' + f.role : '') + (f.broken ? ' broken' : '') +
        (f.sealed ? ' sealed' : '') + (!messy && S.filter && S.caps.has('locate') && !found(f) ? ' dim' : ''),
      'data-drag-id': f.id, 'data-file': true, style: tilt,
      title: (f.sealed ? '封がかかっています: ' : f.role === 'copy' ? '写し: ' : f.role === 'link' ? '近道: ' : '') + f.name + (f.orig ? `（元の名前: ${f.orig}）` : ''),
    }, h('span', { class: 'kind' }, f.broken ? '切' : f.sealed ? '封' : f.role === 'copy' ? '写' : f.role === 'link' ? '近' : f.attrs.kind[0]),
    h('span', { class: 'fname' }, f.name));
  }

  /* 虫めがねの言葉に当てはまるか。名前（元の名前も）と、札に出ている中身を見る。封の中は見えない */
  function found(f) {
    const q = S.filter.normalize('NFKC').toLowerCase();
    return !q || [f.name, f.orig || ''].concat(Object.keys(G.attrs).filter((k) => !G.attrs[k].hidden).map((k) => G.fmtAttr(k, G.attr(f, k))))
      .some((v) => String(v).normalize('NFKC').toLowerCase().includes(q));
  }
  /* 名前順（番号づけのある依頼では、頭の番号がそのまま並びを決める） */
  const byName = (list) => list.slice().sort((p, q) => p.name.localeCompare(q.name, 'ja', { numeric: true }));

  /* 机の上に見えているファイル（虫めがねの絞り込みと、並べ札の順を反映） */
  function deskFiles() {
    let files = S.ws.children('desk');
    if (S.filter) files = files.filter(found);
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
      !all ? '' : S.filter ? `${files.length} / ${all}` : `${all} 個`));
    $('pile').className = 'pile' + (a ? ' tidy' : '');
    /* 並べ札を使っているときは、値の変わり目に小見出しを入れる */
    const out = [];
    let last;
    files.forEach((f) => {
      if (a && G.attr(f, a) !== last) { last = G.attr(f, a); out.push(h('p', { class: 'pile-head' }, G.fmtAttr(a, last))); }
      out.push(fileChip(f, !a));
    });
    $('pile').replaceChildren(files.length ? out : h('p', { class: 'empty' }, all ? '当てはまるものなし' : '片づきました'));
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
    /* 施錠: 施錠の要る依頼では、見出しに錠のボタンを出す。施錠中は出し入れできない */
    const lockBtn = d.shut
      ? h('button', { class: 'mini shut', title: '施錠中。押すと開ける（1 手）', 'aria-label': `「${d.name}」を開ける`, onclick: () => S.ws.unlock(d.id) }, '錠')
      : (S.level.features || {}).lock && !mk
        ? h('button', {
          class: 'mini', title: '合言葉を選んで施錠する（1 手）', 'aria-label': `「${d.name}」を施錠する`,
          onclick: () => pickWord(`「${d.name}」を施錠する`, (word) => S.ws.lock(d.id, word)),
        }, '錠') : null;
    return h('div', { class: 'folder' + (folded ? ' folded' : '') + (mk ? ' marked mark-' + d.mark : '') + (d.shut ? ' is-shut' : ''), 'data-drop-id': d.id, 'data-drag-id': d.id },
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
        lockBtn,
        d.locked || d.shut ? null : h('button', { class: 'mini', title: '片づける（中のファイルは机へ戻る）', 'aria-label': `「${d.name}」を片づける`, onclick: () => S.ws.removeFolder(d.id) }, '×')),
      folded ? null : h('div', { class: 'folder-body' },
        byName(kids.filter((k) => k.type === 'folder')).map(folderEl),
        kids.filter((k) => k.type === 'file').map((f) => fileChip(f, false)),
        kids.length ? null : h('span', { class: 'empty' }, '空')));
  }

  function drawShelf() {
    const kids = S.ws.children('root');
    $('shelf').replaceChildren(
      byName(kids.filter((k) => k.type === 'folder')).map(folderEl), // 棚は名前順に並ぶ
      h('div', { class: 'loose' }, kids.filter((k) => k.type === 'file').map((f) => fileChip(f, false))),
      kids.length ? null : h('p', { class: 'empty' }, '「＋ フォルダ」で引き出しを作ります'));
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
        S.selected.size > 1 ? `${S.selected.size} 個を掴んでいます` : 'ファイルを押すと札が出ます'));
      return;
    }
    const a = f.attrs;
    const cell = (label, v) => h('div', {}, h('dt', {}, label), h('dd', {}, v));
    /* 封のかかったファイルは、読める属性（種類・サイズ）だけが出る */
    const shown = Object.keys(G.attrs).filter((k) => G.attrs[k].slip && G.attr(f, k) != null);
    const feat = S.level.features || {};
    const src = f.role && S.ws.node(f.src);
    const isMemo = a.kind === '控え';
    const dot = f.name.lastIndexOf('.');
    /* 名前を付け直しているあいだは、名前のところが入力欄になる（拡張子は変えない） */
    const nameEl = S.naming === f.id
      ? h('span', { class: 'slip-rename' },
        h('input', {
          class: 'rename', id: 'file-rename', value: f.name.slice(0, dot), 'aria-label': 'ファイル名（拡張子を除く）', maxlength: 40,
          onkeydown: (e) => {
            if (e.isComposing) return;
            if (e.key === 'Enter') commitFileName(f, e.target.value);
            if (e.key === 'Escape') { S.naming = null; drawSlip(); }
          },
        }), f.name.slice(dot),
        h('button', { class: 'btn small', onclick: (e) => commitFileName(f, e.target.parentNode.querySelector('input').value) }, '決める'))
      : h('strong', { class: 'slip-name' }, f.name);
    const more = [
      /* 元の名前と、たどってきた名前。いつでも元に戻せる */
      f.orig ? h('p', { class: 'slip-trail' }, h('b', {}, '名前の履歴'), (f.names || [f.orig, f.name]).join(' → '),
        f.name !== f.orig ? h('button', { class: 'btn small ghost', onclick: () => S.ws.rename(f.id, f.orig) }, '元の名前に戻す') : null) : null,
      S.caps.has('locate') ? h('p', { class: 'slip-trail' }, h('b', {}, 'いまの場所'), whereIs(f),
        f.parent !== 'desk' ? h('button', { class: 'btn small ghost', onclick: () => reveal(f.id) }, 'そこを開く') : null,
        src ? [h('b', {}, f.role === 'copy' ? '　原本の場所' : '　本体の場所'), whereIs(src), h('button', { class: 'btn small ghost', onclick: () => reveal(src.id) }, 'そこを開く')] : null) : null,
    ];
    if (isMemo) {
      $('slip').replaceChildren(h('div', { class: 'slip-card is-memo' },
        h('div', { class: 'slip-top' }, h('strong', { class: 'slip-name' }, f.name),
          h('span', { class: 'slip-actions' }, h('button', { class: 'btn small logic', onclick: () => noteDown(f) }, '控え帳に写す'))),
        h('p', { class: 'memo-body' }, `${a.memoFor}の合言葉は「`, h('b', {}, a.word), '」')));
      return;
    }
    $('slip').replaceChildren(h('div', { class: 'slip-card' + (f.role ? ' is-ref' : '') + (f.sealed ? ' is-sealed' : '') },
      h('div', { class: 'slip-top' },
        nameEl,
        f.sealed ? h('span', { class: 'slip-role broken' }, '封がかかっています') : null,
        f.broken ? h('span', { class: 'slip-role broken', title: '本体を動かしたため切れました。捨てて作り直します' }, '切れています') : null,
        f.role ? h('span', { class: 'slip-role' }, f.role === 'copy' ? `「${src ? src.name : '原本'}」の写し` : `「${src ? src.name : '本体'}」への近道`) : null,
        h('span', { class: 'slip-actions' },
          !f.role && feat.copy ? h('button', { class: 'btn small', title: '写しを机の上につくる', onclick: () => refOf(f, 'copy') }, '写しをとる') : null,
          !f.role && feat.link ? h('button', { class: 'btn small', title: '近道を机の上につくる', onclick: () => refOf(f, 'link') }, '近道をつくる') : null,
          f.sealed ? h('button', {
            class: 'btn small logic', title: '合言葉を選んで封を解く（1 手）',
            onclick: () => pickWord('封を解く', (word) => { if (!S.ws.unseal(f.id, word)) toast('その合言葉では開きませんでした'); }),
          }, '封を解く') : null,
          !f.role && (feat.rename || f.orig) && S.naming !== f.id
            ? h('button', { class: 'btn small', title: 'ファイルの名前を付け直す（1 手）', onclick: () => { S.naming = f.id; drawSlip(); } }, '名前を変える') : null,
          f.role ? h('button', { class: 'btn small', onclick: () => S.ws.removeRef(f.id) }, '捨てる') : null)),
      h('dl', {}, f.sealed ? null : cell('日付', `${a.year}年${a.month}月`), shown.map((k) => cell(G.attrs[k].label, G.fmtAttr(k, a[k]))),
        f.sealed ? cell('そのほか', '封を解くまで読めません') : null),
      more));
    const input = $('file-rename');
    if (input) { input.focus(); input.select(); }
  }
  function commitFileName(f, value) {
    S.naming = null;
    const stem = String(value || '').trim();
    const dot = f.name.lastIndexOf('.');
    if (stem && stem + f.name.slice(dot) !== f.name) { S.ws.rename(f.id, stem + f.name.slice(dot)); return; } // ws:change で描き直される
    drawSlip();
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
        h('summary', {}, '手紙'),
        L.letter.split('\n').map((para) => h('p', {}, para)),
        S.arrived && L.lateNote ? h('p', { class: 'postscript' }, L.lateNote) : null,
        h('p', { class: 'from' }, L.client)),
      /* 印の意味は見出しに触れると出る。前回の印が古くなったときだけ、ひとこと添える */
      h('h3', { title: live ? '印はいまの棚の状態です' : ev ? '印は納品したときの結果です' : '印は納品するとつきます。〈 〉はファイルの札の属性です' },
        '条項', stale ? h('small', {}, '印は前回の納品のもの') : null),
      h('ol', { class: 'clauses' }, items.map((i) => h('li', { class: 'clause' },
        mark(i),
        h('div', {},
          /* 「分類 — 上から順に…」の但し書きは、札に畳んで見出しだけにする */
          h('span', { class: 'clause-kind', title: i.title.includes(' — ') ? i.title.split(' — ')[1] : null },
            i.title.split(' — ')[0], i.title.includes(' — ') ? h('i', {}, '上から順') : null),
          i.lines.map((l) => h('p', {}, l)),
          /* その場の検印では件数だけ。どこが違うかの手がかりは、納品して検収を受けたときに書き込まれる */
          live && i.violations.length ? h('p', { class: 'viol-count' }, `あと ${i.violations.length} 件`) : null,
          !live && ev && !stale && i.violations.length ? h('ul', { class: 'viol' },
            i.violations.slice(0, 3).map((v) => h('li', {}, v)),
            i.violations.length > 3 ? h('li', {}, `ほか ${i.violations.length - 3} 件`) : null) : null)))));
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
      h('p', {}, st.text),
      steps.length > 1 ? h('span', { class: 'coach-step' }, `${S.tut + 1} / ${steps.length}`) : null,
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
    const el = focus && document.getElementById('g-' + focus);
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
    S.firstPass = !(before && before.passed);
    const { gain, rankUp } = P().record(S.level, res);
    G.bus.emit('ui:submit', { result: res });
    drawSpec();
    showReport(res, gain, rankUp, best);
    /* 最上位の格を納めたら、免許皆伝（稽古は数えない）。検収書の上にかぶせて出す */
    if (res.pass && S.level.generated && S.level.generated !== 'c' && S.level.level >= G.gen.MAX_LEVEL) {
      const st = P().state;
      st.crowned = true;
      P().save();
      const all = Object.values(st.levels);
      G.fx.finale({
        grade: S.level.level, title: S.level.title,
        jobs: all.filter((e) => e.passed).length, stars: all.reduce((a, e) => a + e.stars, 0),
        time: clock(st.stats.time || 0), thisTime: clock(res.elapsed),
      });
    }
  }

  function showReport(res, gain, rankUp, best) {
    const L = S.level;
    const i = G.levels.indexOf(L);
    const next = i >= 0 ? G.levels[i + 1] : null;
    const firstPass = S.firstPass;
    const close = () => $('overlay').replaceChildren();
    const f2 = (v) => v.toFixed(2);
    const fact = (label, value, unit) => h('div', {}, h('dt', {}, label), h('dd', {}, value, unit ? h('small', {}, unit) : null));
    $('overlay').replaceChildren(h('div', { class: 'veil' }, h('div', { class: 'report', role: 'dialog', 'aria-label': '検収書' },
      h('div', { class: 'report-head' },
        h('div', {}, h('small', {}, L.client), h('h2', {}, '検収書'), h('p', {}, L.title)),
        h('div', { class: 'stamp ' + (res.pass ? 'pass' : 'fail') }, res.pass ? '合格' : '差戻')),
      h('section', { class: 'report-sec logic' },
        h('h3', {}, h('span', { class: 'tag logic' }, '理'), '要求の充足', h('b', {}, pct(res.quality))),
        h('ul', { class: 'report-items' }, res.items.map((it) => h('li', {},
          h('span', { class: 'ri-text' }, h('em', {}, it.title.split(' — ')[0]), it.lines[0] || ''),
          bar(it.score, 'logic'), h('span', { class: 'ri-pct' }, pct(it.score))))),
        res.pass ? null : h('p', { class: 'report-note' },
          res.gated.length ? `「${res.gated[0].title}」は、ひとつでも破ると差し戻しです。${res.gated[0].violations[0] || ''}`
            : `合格は充足 ${pct(L.passAt || 0.9)} から。手がかりを要求書に書き込みました。`)),
      /* 手際は数字の札で見せ、但し書きは短い印にする */
      h('section', { class: 'report-sec hand' },
        h('h3', {}, h('span', { class: 'tag hand' }, '手'), '手際', h('b', {}, pct(res.tempo))),
        h('dl', { class: 'facts' },
          fact('手数', res.ops, ` / ${res.par}`),
          fact('納品', res.attempts, ' 回目'),
          fact('時間', clock(res.elapsed), res.timeLimit ? ` / ${clock(res.timeLimit)}` : '')),
        h('p', { class: 'notes' },
          res.eff > 1 ? h('i', {}, '目安より少ない手数') : null,
          !res.timeLimit ? null : res.timeFactor < 1 ? h('i', { class: 'bad' }, `遅れ −${Math.round((1 - res.timeFactor) * 100)}%`) : h('i', {}, '納期内'),
          best != null && res.pass ? (res.elapsed < best ? h('i', {}, '最短を更新') : h('i', { class: 'plain' }, `最短 ${clock(best)}`)) : null)),
      res.pass ? h('section', { class: 'report-sec pay' },
        h('h3', {}, '報酬', stars(res.stars), h('b', { class: 'pay-total' }, `${res.reward} 文`)),
        h('p', { class: 'formula' },
          `基本 ${L.reward} × 充足 ${f2(res.quality)} × 手際 ${f2(0.7 + 0.3 * res.tempo)} × 回数 ${f2(res.attemptFactor)}`,
          res.timeLimit ? ` × 納期 ${f2(res.timeFactor)}` : ''),
        h('p', { class: 'notes' },
          h('i', { class: gain > 0 ? '' : 'plain', title: gain > 0 ? null : 'この依頼では、すでに同額以上を受け取っています' }, gain > 0 ? `受け取り ＋${gain} 文` : '受け取り済み'),
          L.generated === 'c' ? h('i', { class: 'plain' }, '稽古は三割') : null),
        rankUp ? h('p', { class: 'rank-up' }, `店の格 ${P().state.rank} へ`,
          G.gen.freshAt(P().state.rank).length ? h('span', { class: 'chips' }, G.gen.freshAt(P().state.rank).map((t) => h('i', { class: 'new' }, t))) : null) : null) : null,
      /* 修業を納めたら、身につけたことを振り返り、次に何が開いたかを知らせる */
      res.pass && L.learn ? h('section', { class: 'report-sec learned' },
        h('h3', {}, '身につけたこと'),
        h('ul', {}, L.learn.map((t) => h('li', {}, t))),
        i === 0 && firstPass ? h('p', { class: 'rank-up' }, '飛び込み・事情あり・広告が開きました。') : null,
        !next ? h('p', { class: 'rank-up' }, '修業はこれで修了です。') : null) : null,
      h('div', { class: 'report-actions' },
        res.pass && next ? h('button', { class: 'btn primary', onclick: () => go('play', next.id) }, `次の修業へ`) : null,
        res.pass ? h('button', { class: 'btn', onclick: () => go('home') }, '受付へ')
          : h('button', { class: 'btn primary', onclick: close }, '直す'),
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
