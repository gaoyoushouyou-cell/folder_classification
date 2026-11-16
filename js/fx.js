/* 演出 — 開店（立ち上げたとき）と、免許皆伝（最上位の格を納めたとき）。
 * どちらも画面の上に 1 枚かぶせるだけで、下の画面には触らない。押すかキーを打てばすぐ閉じる。
 * 動きを減らす設定の環境では、動かさずに出す（CSS 側で止めている）。 */
(function () {
  'use strict';
  const { h } = G.util;
  const KINDS = [['画', 'k-img'], ['文', 'k-doc'], ['表', 'k-tab'], ['音', 'k-snd']];
  const NAMES = ['見積書.xlsx', '契約書.pdf', '図面.png', '議事録.docx', '現場写真.jpg', '録音.mp3', '名簿.xlsx', '企画書.pdf', '挿絵.png', '原稿.txt'];

  /* 画面にかぶせる 1 枚。close() で畳む。押す・Enter・Esc・Space でも閉じる */
  function stage(cls, onClosed) {
    const el = h('div', { class: 'fx ' + cls, role: 'dialog', 'aria-modal': 'true' });
    let shut = false;
    const close = () => {
      if (shut) return;
      shut = true;
      document.removeEventListener('keydown', onKey, true);
      el.classList.add('leaving');
      setTimeout(() => { el.remove(); if (onClosed) onClosed(); }, 700);
    };
    const onKey = (e) => {
      if (['Enter', 'Escape', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); close(); }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.append(el);
    return { el, close };
  }

  /* ── 開店: 暖簾が掛かり、朱印が捺され、散らかった書類が引き出しに収まる ── */
  function opening() {
    const s = stage('fx-open');
    const noren = h('div', { class: 'noren', 'aria-hidden': 'true' },
      ['ひ', 'き', 'だ', 'し', '堂'].map((c, i) => h('span', { style: `--i:${i}` }, h('b', {}, c))));
    /* 四方から飛んできて、引き出しに吸い込まれる書類 */
    const slips = h('div', { class: 'fly', 'aria-hidden': 'true' }, NAMES.map((name, i) => {
      const [mark, cls] = KINDS[i % KINDS.length];
      const ang = (i / NAMES.length) * Math.PI * 2 + 0.4;
      return h('div', {
        class: 'file ' + cls,
        style: `--x:${Math.round(Math.cos(ang) * 46)}vw; --y:${Math.round(Math.sin(ang) * 40)}vh; --r:${(i * 37) % 50 - 25}deg; --d:${1.5 + i * 0.09}s`,
      }, h('span', { class: 'kind' }, mark), h('span', { class: 'fname' }, name));
    }));
    const enter = h('button', { class: 'btn primary fx-enter', onclick: s.close }, '暖簾をくぐる');
    s.el.append(
      noren,
      h('div', { class: 'fx-center' },
        h('div', { class: 'big-seal', 'aria-hidden': 'true' }, '堂', h('i', {})),
        h('h1', {}, 'ひきだし堂'),
        h('p', { class: 'fx-sub' }, '書類整理 うけたまわります'),
        /* 書類は引き出しの位置を基準に飛んでくる（画面の大きさが変わっても、必ず引き出しに収まる） */
        h('div', { class: 'drawer', 'aria-hidden': 'true' }, slips, h('i', {}), h('b', {})),
        enter));
    s.el.addEventListener('click', (e) => { if (e.target === s.el) s.close(); });
    setTimeout(() => enter.focus({ preventScroll: true }), 50);
    return s;
  }

  /* ── 免許皆伝: 紙吹雪のなか巻物がひらき、大きな朱印が捺される ── */
  function finale(info) {
    const s = stage('fx-final');
    const colors = ['var(--shu)', 'var(--gold)', 'var(--ai)', 'var(--moss)', '#fbf7ec', 'var(--k-snd)'];
    const confetti = h('div', { class: 'confetti', 'aria-hidden': 'true' }, Array.from({ length: 90 }, (_, i) => h('i', {
      style: `left:${(i * 37) % 100}%; background:${colors[i % colors.length]}; --d:${3.2 + ((i * 13) % 30) / 10}s; --w:${(i * 7) % 40 - 20}vw;` +
        ` --t:${((i * 29) % 45) / 10}s; --s:${0.7 + ((i * 11) % 8) / 10}; --r:${(i * 53) % 360}deg`,
    })));
    const row = (k, v) => h('div', {}, h('dt', {}, k), h('dd', {}, v));
    const close = h('button', { class: 'btn primary', onclick: s.close }, '店に戻る');
    s.el.append(
      h('div', { class: 'rays', 'aria-hidden': 'true' }),
      confetti,
      h('div', { class: 'scroll' },
        h('div', { class: 'scroll-rod', 'aria-hidden': 'true' }),
        h('div', { class: 'scroll-body' },
          h('p', { class: 'scroll-kicker' }, 'ひきだし堂'),
          h('h1', {}, '免許皆伝'),
          h('p', { class: 'scroll-text' }, `最上位、格 ${info.grade} の依頼「${info.title}」を納めました。`,
            h('br', {}), 'どんな事情の棚も、あなたの手にかかれば片づきます。'),
          h('dl', {}, row('納めた依頼', `${info.jobs} 件`), row('集めた星', `${info.stars}`), row('かけた時間', info.time), row('この依頼', info.thisTime)),
          h('div', { class: 'big-seal final', 'aria-hidden': 'true' }, '皆', h('br', {}), '伝', h('i', {})),
          close),
        h('div', { class: 'scroll-rod', 'aria-hidden': 'true' })));
    setTimeout(() => close.focus({ preventScroll: true }), 50);
    return s;
  }

  G.fx = { opening, finale };
})();
