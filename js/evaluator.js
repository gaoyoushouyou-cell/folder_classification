/* 評価の枠組み — 要求書を「条項（constraint）」の並びとして宣言的に書き、
 * 作業棚の状態から各条項の充足度 0〜1 を機械的に求める。
 *
 *   条件式  : { attr, eq } / { attr, in:[..] } / { attr, includes } / { all:[..] } / { any:[..] } / { not } / true
 *   行き先  : ['素材', '{year}年'] のような雛形（{属性} は各ファイルの値に置き換わる）
 *   条項    : { type, ...引数, weight?, text? }   type は G.constraints に登録されたもの
 *
 * 総合評価:
 *   充足度 quality = Σ(重み×条項の充足度) / Σ重み          … 理（読み解き）の評価
 *   手際   eff     = 目安の手数 par / 実際の手数             … 手（操作）の評価
 *   報酬   reward  = 基本報酬 × quality × (0.7 + 0.3×eff) × 納品回数の係数
 */
(function () {
  'use strict';
  const { norm, clamp } = G.util;

  /* 技能の軸。帳簿（進捗）はこの軸で集計する。side: hand=手 / logic=理 */
  G.skills = {
    tempo: { label: '手際', side: 'hand', desc: '少ない手数で仕上げる' },
    care: { label: '丁寧さ', side: 'hand', desc: '残さない・散らかさない・備える' },
    ops: { label: '運用', side: 'logic', desc: '写し・近道・置き場の決まりを守る' },
    classify: { label: '分類', side: 'logic', desc: '条件を読み、行き先を決める' },
    structure: { label: '階層', side: 'logic', desc: '深さと量の制約を守る' },
    rule: { label: '規約', side: 'logic', desc: '名づけの取り決めに従う' },
  };

  /* ---------- 条件式 ---------- */
  G.match = function match(pred, file) {
    if (pred === true || pred == null) return true;
    if (pred.all) return pred.all.every((p) => match(p, file));
    if (pred.any) return pred.any.some((p) => match(p, file));
    if (pred.not) return !match(pred.not, file);
    const v = pred.attr === 'name' ? file.name : G.attr(file, pred.attr);
    if ('eq' in pred) return norm(v) === norm(pred.eq);
    if (pred.in) return pred.in.some((x) => norm(x) === norm(v));
    if (pred.includes) return String(v).includes(pred.includes);
    if ('gt' in pred) return Number(v) > pred.gt;
    if ('lt' in pred) return Number(v) < pred.lt;
    if ('lte' in pred) return Number(v) <= pred.lte;
    if ('gte' in pred) return Number(v) >= pred.gte;
    return false;
  };
  G.describePred = function describePred(pred, isFallback) {
    if (pred === true || pred == null) return isFallback ? 'それ以外のファイル' : 'すべてのファイル';
    if (pred.all) return pred.all.map((p) => describePred(p)).join(' かつ ');
    if (pred.any) return pred.any.map((p) => describePred(p)).join(' または ');
    if (pred.not) return describePred(pred.not) + 'ではない';
    const label = pred.attr === 'name' ? '名前' : G.attrs[pred.attr].label;
    if ('eq' in pred) return `〈${label}〉が「${pred.eq}」`;
    if (pred.in) return `〈${label}〉が${pred.in.map((x) => `「${x}」`).join('か')}`;
    if (pred.includes) return `〈${label}〉に「${pred.includes}」を含む`;
    const d = G.attrs[pred.attr] || {};
    const n = (v) => v + (d.unit || '');
    if ('gt' in pred) return `〈${label}〉が ${n(pred.gt)} ${d.more || 'より大きい'}`;
    if ('lt' in pred) return `〈${label}〉が ${n(pred.lt)} ${d.less || 'より小さい'}`;
    if ('lte' in pred) return `〈${label}〉が ${n(pred.lte)} ${d.atMost || '以下'}`;
    if ('gte' in pred) return `〈${label}〉が ${n(pred.gte)} ${d.atLeast || '以上'}`;
    return '';
  };

  /* ---------- 行き先の雛形 ---------- */
  G.renderPath = (tpl, file) => tpl.map((seg) => seg.replace(/\{(\w+)\}/g, (_, a) => G.attr(file, a)));
  G.describePath = (tpl) =>
    tpl.map((seg) => '「' + seg.replace(/\{(\w+)\}/g, (_, a) => `〈${G.attrs[a].label}〉`) + '」').join(' の中の ');
  const samePath = (a, b) => a && b && a.length === b.length && a.every((s, i) => norm(s) === norm(b[i]));
  const where = (p) => (p == null ? '机の上' : p.length ? p.join(' ▸ ') : '納品棚の直下');

  /* ---------- 条項の型の登録簿 ----------
   * register(type, { skill, weight, describe(c, ws) -> {title, lines?}, evaluate(c, ws) -> {score, violations[]},
   *                  plan?(c, file) -> 行き先（模範解と目安手数の算出に使う） }) */
  const types = {};
  G.constraints = {
    types,
    register(type, def) { types[type] = Object.assign({ weight: 2 }, def); },
  };
  const reg = G.constraints.register;

  /* 分類: 上から順に当て、最初に合った条項の行き先へ */
  reg('classify', {
    skill: 'classify', weight: 5,
    expected(c, file) {
      const r = c.rules.find((rule) => G.match(rule.when, file));
      return r ? G.renderPath(r.path, file) : null;
    },
    plan(c, file) { return this.expected(c, file); },
    describe(c, ws) {
      const many = c.rules.length > 1;
      const lines = c.rules.map((r, i) => {
        /* r.say: 条件を言葉で言い直したいとき（ファイル同士を見比べて決まる条件など） */
        let s = `${many ? i + 1 + '. ' : ''}${r.say || G.describePred(r.when, i > 0)} → ${G.describePath(r.path)}`;
        if (r.path.some((seg) => seg.includes('{')) && ws) {
          const sample = ws.originals().find((f) => this.expected(c, f) && G.match(r.when, f) &&
            c.rules.find((x) => G.match(x.when, f)) === r);
          if (sample) s += `（例: ${G.renderPath(r.path, sample).join(' ▸ ')}）`;
        }
        return s;
      });
      return {
        title: many ? '分類 — 上から順に当てはめ、最初に合った条項だけが効く' : '分類',
        lines,
      };
    },
    evaluate(c, ws) {
      let n = 0, ok = 0;
      const violations = [];
      ws.originals().forEach((f) => {
        const exp = this.expected(c, f);
        if (!exp) return;
        n++;
        const p = ws.pathOf(f.id);
        if (samePath(p, exp)) ok++;
        else violations.push(`「${f.name}」の置き場所が条項と合いません（いま: ${where(p)}）`);
      });
      return { score: n ? ok / n : 1, violations };
    },
  });

  /* 仕分け: フォルダ名は自由。同じ値は同じフォルダ、違う値は別のフォルダ */
  reg('partition', {
    skill: 'classify', weight: 5,
    plan(c, file) { return [String(G.attr(file, c.by))]; },
    describe(c) {
      const l = G.attrs[c.by].label;
      return {
        title: '仕分け',
        lines: [`〈${l}〉が同じファイルは同じ${c.top ? 'いちばん上の' : ''}フォルダへ、違うファイルは別のフォルダへ（フォルダ名は自由）`],
      };
    },
    evaluate(c, ws) {
      const files = ws.originals();
      const box = (f) => (c.top ? ws.topFolder(f.id) : ws.inShelf(f.parent) && f.parent !== 'root' ? f.parent : null);
      const tally = (keyOf, valOf) => {
        const m = new Map();
        files.forEach((f) => {
          const k = keyOf(f), v = valOf(f);
          if (k == null || v == null) return;
          if (!m.has(k)) m.set(k, new Map());
          m.get(k).set(v, (m.get(k).get(v) || 0) + 1);
        });
        const top = new Map();
        m.forEach((counts, k) => top.set(k, [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]));
        return top;
      };
      const key = (f) => String(G.attr(f, c.by));
      const homeOfKey = tally(key, box);
      const keyOfBox = tally(box, key);
      const violations = [];
      let ok = 0;
      files.forEach((f) => {
        const b = box(f);
        if (b != null && homeOfKey.get(key(f)) === b && keyOfBox.get(b) === key(f)) ok++;
        else violations.push(`「${f.name}」が、同じ〈${G.attrs[c.by].label}〉の仲間と分かれているか、別の仲間に混ざっています`);
      });
      return { score: files.length ? ok / files.length : 1, violations };
    },
  });

  reg('maxDepth', {
    skill: 'structure',
    describe: (c) => ({ title: '制約', lines: [`フォルダの入れ子は ${c.n} 段まで`] }),
    evaluate(c, ws) {
      const all = ws.folders();
      const bad = all.filter((d) => ws.folderPath(d.id).length > c.n);
      return {
        score: all.length ? 1 - bad.length / all.length : 1,
        violations: bad.map((d) => `「${ws.folderPath(d.id).join(' ▸ ')}」が ${c.n} 段より深い`),
      };
    },
  });

  reg('maxItems', {
    skill: 'structure',
    describe: (c) => ({ title: '制約', lines: [`ひとつのフォルダに直接入れるファイルは ${c.n} 個まで`] }),
    evaluate(c, ws) {
      const all = ws.folders();
      const bad = all.filter((d) => ws.children(d.id).filter((x) => x.type === 'file').length > c.n);
      return {
        score: all.length ? 1 - bad.length / all.length : 1,
        violations: bad.map((d) => `「${ws.folderPath(d.id).join(' ▸ ')}」にファイルが ${c.n} 個より多い`),
      };
    },
  });

  reg('noEmpty', {
    skill: 'care',
    describe: (c, ws, level) => ({
      title: '制約',
      lines: ['空のフォルダを残さない' + (level && level.constraints.some((x) => x.type === 'reserve') ? '（用意を頼まれた空フォルダと、備えつけのフォルダは別）' : '')],
    }),
    evaluate(c, ws, level) {
      const spared = G.sparedFolders(level, ws);
      const all = ws.folders().filter((d) => !spared.has(d.id));
      const bad = all.filter((d) => ws.subtreeFiles(d.id).length === 0);
      return {
        score: all.length ? 1 - bad.length / all.length : 1,
        violations: bad.map((d) => `「${ws.folderPath(d.id).join(' ▸ ')}」が空です`),
      };
    },
  });

  reg('rootClean', {
    skill: 'care',
    describe: () => ({ title: '制約', lines: ['納品棚の直下にファイルをじかに置かない'] }),
    evaluate(c, ws) {
      const loose = ws.children('root').filter((x) => x.type === 'file');
      const n = ws.files().length;
      return {
        score: n ? 1 - loose.length / n : 1,
        violations: loose.map((f) => `「${f.name}」が棚の直下にあります`),
      };
    },
  });

  reg('allShelved', {
    skill: 'care',
    describe: () => ({ title: '制約', lines: ['机の上にファイルを残さない'] }),
    evaluate(c, ws) {
      const left = ws.children('desk');
      const n = ws.files().length;
      return {
        score: n ? 1 - left.length / n : 1,
        violations: left.map((f) => `「${f.name}」が机の上に残っています`),
      };
    },
  });

  reg('folderName', {
    skill: 'rule',
    describe: (c) => ({ title: '規約', lines: [c.hint] }),
    evaluate(c, ws) {
      const re = new RegExp(c.pattern);
      const all = ws.folders().filter((d) => c.depth == null || ws.folderPath(d.id).length === c.depth);
      const bad = all.filter((d) => !re.test(d.name.normalize('NFKC')));
      return {
        score: all.length ? 1 - bad.length / all.length : 1,
        violations: bad.map((d) => `「${d.name}」が名づけの取り決めに合いません`),
      };
    },
  });

  /* 「空でもよい」フォルダ: 備えつけのもの、用意を頼まれたもの、その親 */
  G.sparedFolders = function (level, ws) {
    const out = new Set(ws.folders().filter((d) => d.mark).map((d) => d.id));
    ((level && level.constraints) || []).filter((c) => c.type === 'reserve').forEach((c) =>
      c.paths.forEach((p) => {
        for (let i = 1; i <= p.length; i++) {
          const id = ws.findFolder(p.slice(0, i));
          if (id) out.add(id);
        }
      }));
    return out;
  };
  const pathText = (p) => p.map((s, i) => (i ? 'の中の' : '') + `「${s}」`).join('');

  /* 予約: このあとの作業のために、名前を指定した空のフォルダを用意する */
  reg('reserve', {
    skill: 'care', weight: 3,
    describe: (c) => ({ title: '用意', lines: ['このあとの作業のために、空のフォルダを用意する: ' + c.paths.map(pathText).join('、')] }),
    evaluate(c, ws) {
      const violations = [];
      c.paths.forEach((p) => {
        const id = ws.findFolder(p);
        if (!id) violations.push(`${pathText(p)}がまだありません`);
        else if (ws.subtreeFiles(id).length) violations.push(`${pathText(p)}は空のまま用意します（いまは中身があります）`);
      });
      return { score: 1 - violations.length / c.paths.length, violations };
    },
    extra(c, ws) { c.paths.forEach((p) => ws.ensurePath(p, true)); },
  });

  /* 写し（バックアップ）と近道（ショートカット）: 原本は分類どおり、もうひとつを決まった置き場へ */
  /* 置き場 c.path は雛形でもよい（['鏡', '{year}年', '{proj}'] のように、ファイルごとに決まる置き場） */
  const refType = (role, noun, verb) => ({
    skill: 'ops', weight: 3,
    describe: (c) => ({
      title: c.title || (role === 'copy' ? 'バックアップ' : '近道'),
      lines: [`${c.say || G.describePred(c.when)} → ${verb}${G.describePath(c.path)}にも置く（原本は分類どおりの場所に）`],
    }),
    evaluate(c, ws, level) {
      const homeOf = (k, f) => ws.findFolder(G.renderPath(k.path, f));
      /* 同じ種類の条項のどれかに合っていれば「要るもの」。どれにも合わないものが余り */
      const mine = (k, r) => {
        const src = ws.node(r.src);
        return !!src && !r.broken && G.match(k.when, src) && r.parent === homeOf(k, src);
      };
      const kin = ((level && level.constraints) || [c]).filter((k) => k.type === c.type);
      const refs = ws.refs(role);
      const need = ws.originals().filter((f) => G.match(c.when, f));
      const violations = [];
      let missing = 0;
      need.forEach((f) => {
        if (refs.some((r) => r.src === f.id && mine(c, r))) return;
        missing++;
        const broken = refs.some((r) => r.src === f.id && r.broken);
        violations.push(broken ? `「${f.name}」の近道が切れています（本体を動かしたため。作り直します）`
          : `「${f.name}」の${noun}が、決まった置き場にありません`);
      });
      const stray = refs.filter((r) => !kin.some((k) => mine(k, r)) && !(r.broken && need.some((f) => f.id === r.src)));
      stray.forEach((r) => violations.push(`「${r.name}」は要らない${noun}です`));
      const total = need.length + stray.length;
      return { score: total ? (need.length - missing) / total : 1, violations };
    },
    extra(c, ws) {
      ws.originals().filter((f) => G.match(c.when, f)).forEach((f) =>
        ws.move(ws.makeRef(f.id, role), ws.ensurePath(G.renderPath(c.path, f), true)));
    },
  });
  reg('backup', refType('copy', '写し', '写しをとって'));
  reg('shortcut', refType('link', '近道', '近道をつくって'));

  /* 禁止: ある置き場の中に、条件に合うファイルを置かない */
  reg('forbid', {
    skill: 'ops', weight: 3,
    describe: (c) => ({ title: '禁止', lines: [`${G.describePred(c.when)} → ${pathText(c.under)}の中には置かない（写しも同じ）`] }),
    evaluate(c, ws) {
      const zone = ws.findFolder(c.under);
      const risky = ws.files().filter((f) => f.role !== 'link' && G.match(c.when, f));
      const bad = zone ? risky.filter((f) => ws.isInside(f.id, zone)) : [];
      return {
        score: risky.length ? 1 - bad.length / risky.length : 1,
        violations: bad.map((f) => `「${f.name}」が${pathText(c.under)}の中にあります`),
      };
    },
  });

  /* 手数の上限: 目安の手数の factor 倍まで。gate=true の条項は、満たさないと充足度に関係なく差し戻し */
  G.opsLimit = (level) => {
    const c = level.constraints.find((k) => k.type === 'opsLimit');
    return c ? Math.ceil(G.computePar(level) * c.factor) : null;
  };
  reg('opsLimit', {
    skill: 'care', weight: 2, gate: true,
    describe: (c, ws, level) => ({ title: '上限', lines: [`手数は ${G.opsLimit(level)} 手まで（目安の ${c.factor} 倍。超えたら差し戻し。「ひとつ戻す」で手数も戻ります）`] }),
    evaluate(c, ws, level) {
      const limit = G.opsLimit(level);
      return { score: ws.ops <= limit ? 1 : 0, violations: ws.ops <= limit ? [] : [`手数が ${ws.ops} 手で、上限の ${limit} 手を超えています`] };
    },
  });
  /* 時間の目安（秒）。手を動かしはじめてから計る。超えても差し戻しにはならず、報酬が最大 15% 減る */
  G.timeLimit = (level) => (level.timed ? 90 + G.computePar(level) * 6 : null);

  /* ---------- 条項の評価 ---------- */
  G.clausesOf = (level) => level.constraints.concat([{ type: 'allShelved' }]);

  G.evaluate = function (level, ws) {
    const items = G.clausesOf(level).map((c) => {
      const t = types[c.type];
      const r = t.evaluate(c, ws, level);
      const d = t.describe(c, ws, level);
      return {
        type: c.type, skill: t.skill, gate: !!t.gate, weight: c.weight != null ? c.weight : t.weight,
        title: d.title, lines: c.text ? [c.text] : d.lines || [],
        score: clamp(r.score, 0, 1), violations: r.violations,
      };
    });
    const wsum = items.reduce((a, i) => a + i.weight, 0);
    const quality = items.reduce((a, i) => a + i.weight * i.score, 0) / wsum;
    const gated = items.filter((i) => i.gate && i.score < 1);
    return { items, quality, gated, pass: !gated.length && quality >= (level.passAt != null ? level.passAt : 0.9) };
  };

  /* ---------- 模範解・目安の手数 ---------- */
  G.planFor = function (level, ws) {
    const plan = new Map();
    ws.originals().forEach((f) => {
      let path = null;
      if (level.solve) path = level.solve(f.attrs, f);
      else {
        for (const c of level.constraints) {
          const t = types[c.type];
          if (t.plan && (path = t.plan(c, f))) break;
        }
      }
      if (path) plan.set(f.id, path);
    });
    return plan;
  };
  /* 模範解どおりに 1 つずつ運んだときの手数（道具なしの基準） */
  G.applyPlan = function (ws, plan, level) {
    /* 鍵つきの置き場などで弾かれたものは、ほかを運び終えてからもう一度試す */
    let todo = [...plan.entries()];
    for (let round = 0; round < 3 && todo.length; round++) {
      todo = todo.filter(([id, path]) => !ws.move(id, ws.ensurePath(path, true)).moved && ws.node(id).parent !== ws.findFolder(path));
    }
    /* 分類のほかに手を動かす条項（空フォルダの用意、写し、近道） */
    ((level && level.constraints) || []).forEach((c) => types[c.type].extra && types[c.type].extra(c, ws));
    /* 「空のフォルダを残さない」依頼では、空になった余計なフォルダ（前任者の棚など）を外側から片づける */
    if (level && level.constraints.some((c) => c.type === 'noEmpty')) {
      const spared = G.sparedFolders(level, ws);
      ws.folders().sort((p, q) => ws.folderPath(p.id).length - ws.folderPath(q.id).length).forEach((d) => {
        if (ws.node(d.id) && !spared.has(d.id) && !ws.subtreeFiles(d.id).length) ws.removeFolder(d.id);
      });
    }
  };

  /* 「手」と「理」の重さを 1〜10 で表す。手づくりの依頼は levels.js に書いた値、生成した依頼は中身から測る。
     手: 目安の手数と、手を動かす要素の数。 理: 分類の条項の数、読み解く要素の数、条項どうしの掛け合わせ */
  G.rate = function (level, sides) {
    const par = G.computePar(level);
    const rules = (level.constraints.find((c) => c.type === 'classify') || { rules: [] }).rules.length;
    return {
      hand: clamp(Math.round(par / 9 + sides.hand * 0.5 + (level.scene && level.scene !== 'desk' ? 0.5 : 0)), 1, 10),
      /* 0.6 と 0.85 は、格 1 が 1、格 20 が 10 になるよう合わせた目盛りの係数 */
      logic: clamp(Math.round(0.6 + 0.85 * (rules * 0.5 + sides.logic * 0.3 + (level.combos || 0) / 15)), 1, 10),
    };
  };
  /* 条項が求める棚の骨組み（フォルダのパスの一覧）。道具「設計図」と模範解が使う */
  G.skeleton = function (level, ws) {
    const seen = new Map();
    const add = (p) => { for (let i = 1; i <= p.length; i++) seen.set(p.slice(0, i).map(norm).join('/'), p.slice(0, i)); };
    G.planFor(level, ws).forEach((p) => add(p));
    level.constraints.forEach((c) => {
      if (c.type === 'reserve') c.paths.forEach(add);
      if (c.type === 'backup' || c.type === 'shortcut') {
        ws.originals().filter((f) => G.match(c.when, f)).forEach((f) => add(G.renderPath(c.path, f)));
      }
    });
    return [...seen.values()].sort((a, b) => a.length - b.length);
  };
  G.computePar = function (level) {
    if (level._par == null) {
      const ws = new G.Workspace(level);
      ws.release();
      G.applyPlan(ws, G.planFor(level, ws), level);
      level._par = ws.ops + (level.parAdjust || 0);
    }
    return level._par;
  };

  /* ---------- 納品の採点 ---------- */
  G.score = function (level, ws, attempts, elapsed) {
    const ev = G.evaluate(level, ws);
    const par = G.computePar(level);
    const ops = ws.ops;
    const eff = ops ? clamp(par / ops, 0, 1.25) : 1;
    const attemptFactor = Math.max(0.6, 1 - 0.1 * (attempts - 1));
    const tempo = Math.min(eff, 1);
    /* 時間: 目安を超えた分だけ報酬が減り、目安の 1.5 倍で下げ止まる（最大 15% 減） */
    const timeLimit = G.timeLimit(level);
    const over = timeLimit ? Math.max(0, (elapsed || 0) - timeLimit) : 0;
    const timeFactor = timeLimit ? Math.max(0.85, 1 - 0.15 * (over / (timeLimit * 0.5))) : 1;
    const reward = ev.pass ? Math.round(level.reward * ev.quality * (0.7 + 0.3 * tempo) * attemptFactor * timeFactor) : 0;
    const perfect = ev.quality >= 0.999;
    const stars = !ev.pass ? 0 : perfect && eff >= 0.9 && attempts === 1 ? 3 : perfect && eff >= 0.7 ? 2 : 1;

    const acc = {};
    ev.items.forEach((i) => {
      const a = (acc[i.skill] = acc[i.skill] || { w: 0, s: 0 });
      a.w += i.weight;
      a.s += i.weight * i.score;
    });
    const skills = { tempo };
    Object.keys(acc).forEach((k) => (skills[k] = acc[k].s / acc[k].w));

    return {
      ev, items: ev.items, quality: ev.quality, pass: ev.pass, gated: ev.gated, par, ops, eff, tempo, attempts, attemptFactor,
      timeLimit, elapsed: elapsed || 0, timeFactor, reward, stars, skills,
      pace: ops ? (elapsed || 0) / ops : 0, // 1 手あたりの秒数
    };
  };
})();
