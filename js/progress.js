/* 帳簿 — 所持金・道具・依頼ごとの成績・飛び込みの依頼・稽古・札入れを保存し、技能の軸で集計する。 */
(function () {
  'use strict';
  const KEY = 'hikidashido.save.v1';
  const WALKIN_SLOTS = 3;
  const blank = () => ({
    coins: 0, owned: [], levels: {}, stats: { submissions: 0, ops: 0 },
    rank: 1,        // 店の格。飛び込みの依頼はこの格で届く
    walkins: [],    // 届いている飛び込みの依頼の id
    custom: [],     // 自分で作った稽古の id
    ads: [],        // 広告で呼び込んだ依頼の id
    sits: [],       // 届いている「事情のある依頼」の id
    crowned: false, // 最上位の格を納めたことがある（免許皆伝）
    seen: [],       // すでに手ほどきを受けた要素
    rules: [],      // 札入れにしまった仕分け札
  });
  let state = blank();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  const changed = () => { save(); G.bus.emit('progress:change'); };

  G.progress = {
    get state() { return state; },
    save,
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) state = Object.assign(blank(), JSON.parse(raw));
      } catch (e) { state = blank(); }
    },
    reset() { state = blank(); save(); },

    entry(id) { return state.levels[id]; },
    passed(id) { return !!(state.levels[id] && state.levels[id].passed); },
    unlocked(level) {
      if (level.generated) return true;
      const i = G.levels.indexOf(level);
      return i === 0 || this.passed(G.levels[i - 1].id);
    },
    owns(toolId) { return state.owned.includes(toolId); },
    buy(tool) {
      if (this.owns(tool.id) || state.coins < tool.price) return false;
      if ((tool.requires || []).some((r) => !this.owns(r))) return false;
      state.coins -= tool.price;
      state.owned.push(tool.id);
      changed();
      return true;
    },

    /* ── 飛び込みの依頼: 最初の依頼を納めると届きはじめ、いつも 3 件が待っている ── */
    walkinsOpen() { return this.passed(G.levels[0].id); },
    walkins() {
      if (!this.walkinsOpen()) return [];
      const before = state.walkins.length;
      for (let i = state.walkins.length; i < WALKIN_SLOTS; i++) {
        /* 3 件のうち 1 件は、ひとつ下の格（腕ならし） */
        const lv = i === WALKIN_SLOTS - 1 ? Math.max(1, state.rank - 1) : state.rank;
        state.walkins.push(G.gen.newId('w', lv));
      }
      /* いまの格（受けられる最上位）の依頼が、必ず 1 件は待っているようにする。
         格が上がった直後は古い格の依頼だけが残るので、いちばん低い格のものを入れ替える */
      const levelOf = (id) => Number(id.split('-')[1]);
      let swapped = false;
      if (!state.walkins.some((id) => levelOf(id) === state.rank)) {
        const low = state.walkins.reduce((a, b) => (levelOf(b) < levelOf(a) ? b : a));
        state.walkins[state.walkins.indexOf(low)] = G.gen.newId('w', state.rank);
        swapped = true;
      }
      if (swapped || state.walkins.length !== before) save();
      return state.walkins.map(G.levelById).sort((a, b) => b.level - a.level);
    },
    /* ── 事情のある依頼: いつも 3 件。事情は重ならないようにし、格は店の格に近いものを選ぶ ── */
    situated() {
      if (!this.walkinsOpen()) return [];
      const pick = (n) => Math.floor(Math.random() * n);
      let added = false;
      for (let guard = 0; state.sits.length < 3 && guard < 20; guard++) {
        const have = state.sits.map((id) => G.levelById(id).situation);
        /* 込み入り具合を広くばらつかせた候補から、店の格に近いものを選ぶ（格 20 まで届く） */
        const cands = Array.from({ length: 12 }, () => {
          const i = pick(G.gen.SITS.length);
          return G.levelById(G.gen.newSituatedId(i, pick(G.gen.maxDepth(i) + 1)));
        }).filter((l) => !have.includes(l.situation));
        if (!cands.length) continue;
        cands.sort((p, q) => Math.abs(p.level - state.rank) - Math.abs(q.level - state.rank));
        state.sits.push(cands[pick(Math.min(2, cands.length))].id);
        added = true;
      }
      if (added) save();
      return state.sits.map(G.levelById);
    },
    /* ── 広告: お金を払って、好きな格の依頼を呼び込む。報酬は満額 ── */
    ads() { return state.ads.map(G.levelById); },
    buyAd(level) {
      const cost = G.gen.adCost(level);
      if (state.coins < cost) return false;
      state.coins -= cost;
      state.stats.adSpend = (state.stats.adSpend || 0) + cost;
      state.ads.push(G.gen.newId('a', level));
      changed();
      return true;
    },
    /* ── 稽古: 格と件数を指定してまとめて作る ── */
    customs() { return state.custom.map(G.levelById); },
    createCustom(level, count) {
      for (let i = 0; i < count; i++) state.custom.push(G.gen.newId('c', level));
      changed();
    },
    removeCustom(id) {
      state.custom = state.custom.filter((x) => x !== id);
      changed();
    },

    /* ── 手ほどき: まだ出会っていない要素だけを返し、出会ったことにする ── */
    unseen(mechs) {
      const fresh = mechs.filter((m) => !state.seen.includes(m));
      if (fresh.length) { state.seen.push(...fresh); save(); }
      return fresh;
    },

    /* ── 札入れ ── */
    saveRule(rule) { state.rules.push(rule); changed(); },
    removeRule(i) { state.rules.splice(i, 1); changed(); },

    /* 納品結果を記帳する。報酬は「これまでの最高額との差額」だけ支払う（同じ依頼での稼ぎ直しを防ぐ） */
    record(level, res) {
      const e = state.levels[level.id] ||
        (state.levels[level.id] = { plays: 0, passed: false, quality: 0, eff: 0, stars: 0, earned: 0, ops: null, skills: {} });
      e.plays++;
      state.stats.submissions++;
      state.stats.ops += res.ops;
      /* 経過時間（手を動かしはじめてから納品まで）。合格したときの最短と、直近の値を残す */
      e.lastTime = Math.round(res.elapsed);
      if (res.pass) {
        e.time = e.time == null ? e.lastTime : Math.min(e.time, e.lastTime);
        state.stats.time = (state.stats.time || 0) + e.lastTime;
      }
      let gain = 0;
      let rankUp = false;
      if (res.pass) {
        e.passed = true;
        gain = Math.max(0, res.reward - e.earned);
        e.earned = Math.max(e.earned, res.reward);
        e.stars = Math.max(e.stars, res.stars);
        e.ops = e.ops == null ? res.ops : Math.min(e.ops, res.ops);
        e.eff = Math.max(e.eff, res.eff);
        state.coins += gain;
        if (level.generated === 'w' && state.walkins.includes(level.id)) {
          /* 納めた飛び込みは棚から下げる。いまの格の依頼を納めたら、店の格が上がる */
          state.walkins = state.walkins.filter((x) => x !== level.id);
          if (level.level >= state.rank && state.rank < G.gen.MAX_LEVEL) { state.rank++; rankUp = true; }
        }
        /* 広告の依頼は、納めたら受注の一覧から下げる */
        if (level.generated === 'a') state.ads = state.ads.filter((x) => x !== level.id);
        if (level.generated === 's') state.sits = state.sits.filter((x) => x !== level.id);
      }
      if (res.quality >= e.quality) {
        e.quality = res.quality;
        e.skills = res.skills;
      }
      if (level.generated) { e.title = level.title; e.level = level.level; e.kind = level.generated; e.tend = level.tendLabel; e.at = Date.now(); }
      changed();
      return { gain, rankUp };
    },

    /* 技能ごとの習熟（その技能が問われた依頼での最高成績の平均） */
    skillSummary() {
      const out = {};
      Object.keys(G.skills).forEach((k) => {
        const vals = Object.values(state.levels).map((e) => e.skills && e.skills[k]).filter((v) => v != null);
        out[k] = { n: vals.length, value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
      });
      return out;
    },
  };
})();
