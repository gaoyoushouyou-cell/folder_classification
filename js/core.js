/* ひきだし堂 — 土台: 名前空間・イベントバス・小道具
 * すべてのモジュールは window.G にぶら下がる（file:// で直接開けるよう ES Modules は使わない）。 */
(function () {
  'use strict';
  const G = (window.G = {});

  /* イベントバス。主なイベント:
   *   ws:change  { cmd, ws }   作業棚が変化した
   *   ui:inspect { id }        ファイルの札を見た
   *   ui:submit  { result }    納品した
   *   level:start / level:end  依頼の開始・終了 */
  const handlers = {};
  G.bus = {
    on(ev, fn) {
      (handlers[ev] = handlers[ev] || []).push(fn);
      return () => G.bus.off(ev, fn);
    },
    off(ev, fn) {
      handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn);
    },
    emit(ev, data) {
      (handlers[ev] || []).slice().forEach((fn) => fn(data));
    },
  };

  /* DOM を組み立てる小さなヘルパー */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  G.util = {
    h,
    /* フォルダ名の照合用: 全角半角・前後や途中の空白の違いを吸収する */
    norm: (s) => String(s).normalize('NFKC').replace(/\s+/g, '').toLowerCase(),
    hash(s) {
      let x = 0;
      for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0;
      return Math.abs(x);
    },
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    pct: (v) => Math.round(v * 100) + '%',
  };
})();
