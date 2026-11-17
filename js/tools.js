/* 道具 — 報酬で買い足す拡張。道具はすべてこの登録簿に登録する。
 *
 *   G.tools.register({
 *     id, name, side: 'hand' | 'logic', price, blurb,
 *     requires: [前提の道具の id]（任意。強化版はここで元の道具を指す）,
 *     setup(ctx) { ...; return 後片づけの関数(任意) }   // 依頼を始めるたびに、持っている道具について呼ばれる
 *   })
 *
 *   ctx.ws        作業棚。move / createFolder / batch などの命令を呼べる（batch で包むと 1 手）
 *   ctx.level     いまの依頼
 *   ctx.caps      能力の集合（Set）。画面側が見る旗: 'multiSelect' 'liveCheck'
 *   ctx.bus       イベントバス（ws:change などを購読できる）
 *   ctx.ui        addControl(要素) 道具帯に部品を置く / openPanel({title, render}) / closePanel()
 *                 toast(文) / refresh() / setDeskSort(属性|null) / setDeskFilter(文字)
 *                 selection() -> 選択中の id / select(ids) 掴む
 */
(function () {
  'use strict';
  const { h } = G.util;

  const list = [];
  G.tools = {
    list,
    register(tool) { list.push(tool); },
    get: (id) => list.find((t) => t.id === id),
  };
  const owns = (id) => G.progress.owns(id);
  /* その依頼のファイルが実際に持っている属性だけを選択肢にする */
  const attrsIn = (ws) => Object.keys(G.attrs).filter((a) => !G.attrs[a].hidden && ws.files().some((f) => G.attr(f, a) != null));

  /* ══ 手の道具 ══ */
  G.tools.register({
    id: 'narabe', name: '並べ札', side: 'hand', price: 25,
    blurb: '机の上を、種類・年・案件などの順に並べる。',
    setup(ctx) {
      const sel = h('select', { 'aria-label': '机の並べ方', onchange: () => ctx.ui.setDeskSort(sel.value || null) },
        h('option', { value: '' }, '並べない'),
        attrsIn(ctx.ws).filter((a) => a !== 'ext' && a !== 'month').map((a) => h('option', { value: a }, `${G.attrs[a].label}順`)));
      ctx.ui.addControl(h('label', { class: 'belt-item' }, '並べ札', sel));
    },
  });

  G.tools.register({
    id: 'mushi', name: '虫めがね', side: 'hand', price: 45,
    blurb: '机の上を言葉で絞り込む。札の中身でも探せる。',
    setup(ctx) {
      const box = h('input', {
        type: 'search', class: 'belt-search', placeholder: '机の上を探す', 'aria-label': '机の上を絞り込む',
        oninput: () => ctx.ui.setDeskFilter(box.value),
      });
      ctx.ui.addControl(h('label', { class: 'belt-item' }, '虫めがね', box));
      if (owns('matome')) {
        ctx.ui.addControl(h('button', { class: 'btn small', onclick: () => ctx.ui.select(ctx.ui.visibleDesk()) }, '見えているものを掴む'));
      }
    },
  });

  G.tools.register({
    id: 'matome', name: 'まとめ掴み', side: 'hand', price: 60,
    blurb: 'Ctrl か Shift を押しながら選び、束を 1 手で運ぶ。',
    setup(ctx) {
      ctx.caps.add('multiSelect');
      ctx.ui.addControl(h('span', { class: 'belt-note' }, 'まとめ掴み: Ctrl＋押す'));
    },
  });

  /* ══ 理の道具 ══ */
  G.tools.register({
    id: 'kenin', name: '検印', side: 'logic', price: 90,
    blurb: '納品の前から、条項に ○ △ × の印が出る。',
    setup(ctx) { ctx.caps.add('liveCheck'); },
  });

  /* 仕分け札の中身: { conds: [{attr, op: 'eq'|'gt'|'lt', value}], join: 'all'|'any', path: [フォルダ名…] } */
  const condPred = (c) => (c.op === 'eq' ? { attr: c.attr, eq: c.value } : { attr: c.attr, [c.op]: Number(c.value) });
  const rulePred = (r) => (r.conds.length === 1 ? condPred(r.conds[0]) : { [r.join]: r.conds.map(condPred) });
  const ruleText = (r) => `${G.describePred(rulePred(r))} → ${r.path.length ? r.path.join(' ▸ ') : '納品棚の直下'}`;
  G.rules = { pred: rulePred, text: ruleText };

  /* 札を 1 枚流す。行き先のフォルダが無ければ作る。全体で 1 手 */
  function runRule(ctx, rule, deskOnly) {
    const pred = rulePred(rule);
    let n = 0;
    ctx.ws.batch(() => {
      const target = ctx.ws.ensurePath(rule.path, true);
      const hits = ctx.ws.originals().filter((f) => G.match(pred, f) && f.parent !== target && (!deskOnly || f.parent === 'desk'));
      n = hits.length;
      if (n) ctx.ws.move(hits.map((f) => f.id), target);
    }, 'rule');
    return n;
  }

  G.tools.register({
    id: 'shiwake', name: '仕分け札', side: 'logic', price: 160,
    blurb: '条件を書くと、当てはまるファイルを 1 手で運ぶ。',
    setup(ctx) {
      const st = { conds: [{ attr: 'kind', op: 'eq', value: null }], join: 'all', path: [], deskOnly: false };
      const again = () => ctx.ui.refresh();
      const valuesOf = (a) => [...new Set(ctx.ws.originals().map((f) => G.attr(f, a)).filter((v) => v != null).map(String))]
        .sort((p, q) => p.localeCompare(q, 'ja', { numeric: true }));

      function condRow(c, i) {
        const def = G.attrs[c.attr];
        const numeric = owns('kasane') && def.num;
        if (!numeric) c.op = 'eq';
        const vals = valuesOf(c.attr);
        if (c.op === 'eq' && !vals.includes(String(c.value))) c.value = vals[0];
        return h('span', { class: 'row' },
          h('select', { 'aria-label': '属性', onchange: (e) => { c.attr = e.target.value; c.value = null; c.op = 'eq'; again(); } },
            attrsIn(ctx.ws).map((a) => h('option', { value: a, selected: a === c.attr }, G.attrs[a].label))),
          numeric ? h('select', { 'aria-label': '比べ方', onchange: (e) => { c.op = e.target.value; again(); } },
            h('option', { value: 'eq', selected: c.op === 'eq' }, 'が'),
            h('option', { value: 'gt', selected: c.op === 'gt' }, def.more),
            h('option', { value: 'lt', selected: c.op === 'lt' }, def.less)) : 'が',
          c.op === 'eq'
            ? h('select', { 'aria-label': '値', onchange: (e) => { c.value = e.target.value; again(); } },
              vals.map((v) => h('option', { value: v, selected: v === String(c.value) }, G.fmtAttr(c.attr, v))))
            : h('input', { type: 'number', class: 'num', 'aria-label': '値', value: c.value, onchange: (e) => { c.value = e.target.value; again(); } }),
          i > 0 ? h('button', { class: 'mini', 'aria-label': 'この条件を外す', onclick: () => { st.conds.splice(i, 1); again(); } }, '×') : null);
      }

      function render() {
        const folders = ctx.ws.folders();
        const key = JSON.stringify(st.path);
        const rows = st.conds.map(condRow); // 先に作って、値の初期化を済ませる
        const rule = { conds: st.conds, join: st.join, path: st.path };
        const pred = rulePred(rule);
        const target = ctx.ws.findFolder(st.path);
        const hits = ctx.ws.originals().filter((f) => G.match(pred, f) && f.parent !== target && (!st.deskOnly || f.parent === 'desk'));
        const saved = G.progress.state.rules;
        return h('div', { class: 'rule-form' },
          h('div', { class: 'rule-field' }, h('b', {}, '条件'), rows,
            owns('kasane') && st.conds.length > 1 ? h('label', { class: 'check' }, 'つなぎ方',
              h('select', { onchange: (e) => { st.join = e.target.value; again(); } },
                h('option', { value: 'all', selected: st.join === 'all' }, 'どちらにも合う（かつ）'),
                h('option', { value: 'any', selected: st.join === 'any' }, 'どちらかに合う（または）'))) : null,
            owns('kasane') && st.conds.length < 2
              ? h('button', { class: 'btn small ghost', onclick: () => { st.conds.push({ attr: st.conds[0].attr, op: 'eq', value: null }); again(); } }, '＋ 条件を重ねる') : null),
          h('label', { class: 'rule-field' }, h('b', {}, '行き先'),
            h('select', { onchange: (e) => { st.path = JSON.parse(e.target.value); again(); } },
              h('option', { value: '[]', selected: key === '[]' }, '納品棚の直下'),
              folders.map((d) => {
                const p = ctx.ws.folderPath(d.id);
                return h('option', { value: JSON.stringify(p), selected: JSON.stringify(p) === key }, p.join(' ▸ '));
              }))),
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: st.deskOnly, onchange: (e) => { st.deskOnly = e.target.checked; again(); } }),
            '机の上のものだけ'),
          h('p', { class: 'rule-count' }, `当てはまるファイル: ${hits.length} 個`),
          h('div', { class: 'rule-actions' },
            h('button', {
              class: 'btn logic', disabled: !hits.length,
              onclick: () => ctx.ui.toast(`${runRule(ctx, rule, st.deskOnly)} 個を 1 手で運びました`),
            }, 'この条件で運ぶ'),
            owns('fudaire') ? h('button', {
              class: 'btn',
              onclick: () => {
                G.progress.saveRule(JSON.parse(JSON.stringify(rule)));
                ctx.ui.toast('札入れにしまいました');
                again();
              },
            }, '札入れにしまう') : null),
          owns('fudaire') ? h('div', { class: 'wallet' },
            h('b', {}, `札入れ（${saved.length} 枚）`),
            saved.length ? null : h('p', { class: 'empty' }, 'しまった札は、ほかの依頼でも使えます。行き先のフォルダが無ければ、流すときに作ります。'),
            h('ol', {}, saved.map((r, i) => h('li', {},
              h('span', {}, ruleText(r)),
              h('button', { class: 'btn small logic', onclick: () => ctx.ui.toast(`${runRule(ctx, r, false)} 個を運びました`) }, '流す'),
              h('button', { class: 'mini', 'aria-label': 'この札を捨てる', onclick: () => { G.progress.removeRule(i); again(); } }, '×')))),
            saved.length > 1 ? h('button', {
              class: 'btn small logic',
              onclick: () => {
                /* 下の札から流すと、同じファイルに合う札が複数あっても、いちばん上の札の行き先が最後に勝つ */
                let n = 0;
                saved.slice().reverse().forEach((r) => (n += runRule(ctx, r, false)));
                ctx.ui.toast(`札 ${saved.length} 枚を流しました（上の札が優先）`);
              },
            }, 'すべて流す（上の札が優先）') : null) : null);
      }
      ctx.ui.addControl(h('button', { class: 'btn logic small', onclick: () => ctx.ui.openPanel({ title: '仕分け札', render }) }, '仕分け札を書く'));
    },
  });

  G.tools.register({
    id: 'fudaire', name: '札入れ', side: 'logic', price: 120, requires: ['shiwake'],
    blurb: '仕分け札をしまい、ほかの依頼でも使い回す。',
    setup() {},
  });

  G.tools.register({
    id: 'kasane', name: '重ね札', side: 'logic', price: 140, requires: ['shiwake'],
    blurb: '条件をふたつ重ねる。年やサイズの大小でも書ける。',
    setup() {},
  });

  G.tools.register({
    id: 'sekkeizu', name: '設計図', side: 'logic', price: 220,
    blurb: '条項から、必要なフォルダの骨組みを 1 手で起こす。',
    setup(ctx) {
      ctx.ui.addControl(h('button', {
        class: 'btn logic small',
        onclick: () => {
          const paths = G.skeleton(ctx.level, ctx.ws).filter((p) => !ctx.ws.findFolder(p));
          if (!paths.length) return ctx.ui.toast('骨組みはもう揃っています');
          ctx.ws.batch(() => paths.forEach((p) => ctx.ws.ensurePath(p, true)), 'blueprint');
          ctx.ui.toast(`フォルダ ${paths.length} 個の骨組みを起こしました`);
        },
      }, '設計図から骨組みを起こす'));
    },
  });
})();
