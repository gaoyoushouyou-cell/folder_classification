/* 作業棚（Workspace）— フォルダとファイルの木構造と、それを変える「命令」。
 * 画面も道具も自動化も、必ずここの命令（createFolder / move / rename / removeFolder / batch）を通す。
 * そうしておくと、手数の計上・ひとつ戻す・評価がどの経路でも同じように働く。 */
(function () {
  'use strict';
  const { norm } = G.util;

  G.KINDS = {
    jpg: '画像', png: '画像',
    pdf: '文書', docx: '文書', txt: '文書',
    xlsx: '表', csv: '表',
    mp3: '音声', wav: '音声',
    key: '鍵', memo: '控え',
  };

  /* ファイルの属性の一覧。条項・仕分け札・札表示が共通で使う。
   * 属性を足したいときはここに 1 行足し、レベルのファイル定義で値を与える。 */
  /* label: 表示名 / num: 数として比べられる / unit: 単位 / more・less: 大小を言い表す言葉 / slip: 札に出すか */
  G.attrs = {
    kind: { label: '種類', slip: true },
    ext: { label: '拡張子' },
    year: { label: '年', num: true, unit: '年', more: 'より後', less: 'より前', atLeast: '以降', atMost: '以前' },
    month: { label: '月', num: true, unit: '月', more: 'より後', less: 'より前' },
    proj: { label: '案件', slip: true },
    doc: { label: '書類の種別', slip: true },
    author: { label: '作成者', slip: true },
    secrecy: { label: '機密区分', slip: true },
    state: { label: '版', slip: true },
    size: { label: 'サイズ', num: true, unit: 'MB', more: 'より大きい', less: 'より小さい', slip: true },
    ver: { label: '版数', num: true, slip: true, fmt: (v) => `第${v}版`, more: 'より新しい', less: 'より古い' },
    /* hidden: 依頼の側で決まる内部の印。札・並べ札・虫めがね・仕分け札には出さない（自分で見比べて判断するもの） */
    stale: { label: '旧い版', hidden: true },
    fits: { label: '容量に収まる', hidden: true },
    cryptic: { label: '仮の名前', hidden: true },
    hush: { label: '伏せるもの', hidden: true },
  };
  /* 封のかかったファイルは、開けるまで種類・拡張子・サイズしか読めない。採点や模範解は G.withRaw の中で本当の値を読む */
  const OPEN_ATTRS = ['kind', 'ext', 'size'];
  G.raw = false;
  G.withRaw = (fn) => { const was = G.raw; G.raw = true; try { return fn(); } finally { G.raw = was; } };
  G.attr = (file, a) => {
    if (file.sealed && !G.raw && !OPEN_ATTRS.includes(a)) return undefined;
    return G.attrs[a] && G.attrs[a].get ? G.attrs[a].get(file) : file.attrs[a];
  };
  G.fmtAttr = (a, v) => (v == null || v === '' ? '—'
    : G.attrs[a] && G.attrs[a].fmt ? G.attrs[a].fmt(v) : v + ((G.attrs[a] && G.attrs[a].unit) || ''));

  /* 備えつけのフォルダの印。依頼の marks で指定し、名前の変更・移動・片づけができない */
  G.marks = {
    cloud: { label: 'クラウド', sign: '雲', note: '社外からも見える置き場' },
    backup: { label: 'バックアップ', sign: '写', note: '写しを入れておく置き場' },
    trash: { label: 'ごみ箱', sign: '屑', note: '要らないものを入れる' },
    pin: { label: 'よく使う', sign: '近', note: '近道（ショートカット）を置く' },
    vault: { label: '金庫', sign: '錠', note: '鍵を先に入れないと開かない' },
    mirror: { label: '鏡', sign: '鏡', note: '棚を逆さの順で辿るための近道を置く' },
    memo: { label: '控え', sign: '帳', note: '合言葉のメモが入っている' },
  };

  class Workspace {
    constructor(level) {
      this.nodes = new Map();
      this.seq = 0;
      this.ops = 0;
      this.history = [];
      this._depth = 0;
      this._cost = 0;
      this._batch = false;
      this.nodes.set('root', { id: 'root', type: 'folder', name: '納品棚', parent: null });
      this.nodes.set('desk', { id: 'desk', type: 'folder', name: '机の上', parent: null });
      /* まだ届いていないファイルの置き場。release() で机の上に出てくる */
      this.nodes.set('limbo', { id: 'limbo', type: 'folder', name: '未着', parent: null });
      this.fragile = !!(level && level.fragileLinks); // 本体を動かすと近道が切れる
      /* 番号づけのある依頼では、いちばん上のフォルダは頭の「NN_」を外して名前を比べる */
      this.numbered = !!(level && (level.constraints || []).some((c) => c.type === 'numbered'));
      if (level) this._build(level);
    }

    _build(level) {
      (level.folders || []).forEach((p) => this.ensurePath(p));
      Object.keys(level.marks || {}).forEach((name) => {
        const d = this.node(this.ensurePath([name]));
        d.mark = level.marks[name];
        d.locked = true;
      });
      (level.files || []).forEach((spec) => {
        const [name, date, proj, doc, at, extra] = spec;
        const ext = name.split('.').pop().toLowerCase();
        const [y, m] = (date || '').split('-').map(Number);
        const id = 'f' + ++this.seq;
        this.nodes.set(id, {
          id, type: 'file', name,
          parent: at === '@late' ? 'limbo' : at ? this.ensurePath(at) : 'desk',
          attrs: Object.assign({ ext, kind: G.KINDS[ext] || 'その他', year: y, month: m, proj, doc }, extra || {}),
          sealed: (extra && extra.sealWord) || undefined, // 封のかかったファイル（開ける合言葉）
        });
      });
      this.ops = 0;
      this.history = [];
    }

    /* ---------- 参照 ---------- */
    node(id) { return this.nodes.get(id); }
    children(id) { return [...this.nodes.values()].filter((n) => n.parent === id); }
    /* 届いているファイルすべて（未着のものは数えない） */
    files() { return [...this.nodes.values()].filter((n) => n.type === 'file' && n.parent !== 'limbo'); }
    pending() { return this.children('limbo'); }
    /* 未着のファイルを机の上に届ける */
    release() {
      const late = this.pending();
      if (!late.length) return 0;
      late.forEach((f) => (f.parent = 'desk'));
      G.bus.emit('ws:change', { cmd: 'release', ws: this });
      return late.length;
    }
    /* 置き場 targetId を閉ざしている金庫（鍵がまだ入っていないもの）。無ければ null */
    lockedVault(targetId) {
      for (let n = this.node(targetId); n; n = this.node(n.parent)) {
        if (n.mark === 'vault') return this.subtreeFiles(n.id).some((f) => f.attrs.kind === '鍵') ? null : n;
      }
      return null;
    }
    /* 原本だけ（写し・近道を除く）。分類の対象はこちら */
    originals() { return this.files().filter((n) => !n.role); }
    /* ある原本の写し（role='copy'）や近道（role='link'） */
    refs(role) { return this.files().filter((n) => n.role === role); }
    folders() {
      return [...this.nodes.values()].filter(
        (n) => n.type === 'folder' && n.id !== 'root' && n.id !== 'desk' && this.inShelf(n.id));
    }
    inShelf(id) {
      for (let n = this.node(id); n; n = this.node(n.parent)) if (n.id === 'root') return true;
      return false;
    }
    /* フォルダ自身までの名前の列（納品棚は含めない） */
    folderPath(id) {
      const out = [];
      for (let n = this.node(id); n && n.id !== 'root' && n.id !== 'desk'; n = this.node(n.parent)) out.unshift(n.name);
      return out;
    }
    /* ファイルが置かれている場所の名前の列。机の上なら null */
    pathOf(fileId) {
      const f = this.node(fileId);
      return this.inShelf(f.parent) ? this.folderPath(f.parent) : null;
    }
    /* 納品棚の直下から数えていちばん上の祖先フォルダ。直下・机の上なら null */
    topFolder(fileId) {
      let n = this.node(this.node(fileId).parent);
      if (!n || n.id === 'desk' || n.id === 'root') return null;
      while (n.parent !== 'root') n = this.node(n.parent);
      return n.id;
    }
    /* 名前を比べるときの形。番号づけのある依頼では、いちばん上（depth 0）だけ頭の「NN_」を外す */
    key(name, depth) {
      return norm(this.numbered && depth === 0 ? String(name).replace(/^\d{2}_/, '') : name);
    }
    /* 施錠されたフォルダ（自分か祖先）。無ければ null */
    shutOver(id) {
      for (let n = this.node(id); n; n = this.node(n.parent)) if (n.shut) return n;
      return null;
    }
    findFolder(path) {
      let cur = 'root';
      for (const seg of path) {
        const depth = path.indexOf(seg);
        const hit = this.children(cur).find((c) => c.type === 'folder' && this.key(c.name, depth) === this.key(seg, depth));
        if (!hit) return null;
        cur = hit.id;
      }
      return cur;
    }
    isInside(id, ancestorId) {
      for (let n = this.node(id); n; n = this.node(n.parent)) if (n.id === ancestorId) return true;
      return false;
    }
    subtreeFiles(folderId) {
      return this.files().filter((f) => this.isInside(f.id, folderId));
    }
    _nameTaken(parentId, name, exceptId) {
      return this.children(parentId).some(
        (c) => c.type === 'folder' && c.id !== exceptId && norm(c.name) === norm(name));
    }

    /* ---------- 取引（手数と履歴の管理） ---------- */
    snapshot() {
      return JSON.stringify({ nodes: [...this.nodes.values()], seq: this.seq, ops: this.ops });
    }
    restore(json) {
      const s = JSON.parse(json);
      this.nodes = new Map(s.nodes.map((n) => [n.id, n]));
      this.seq = s.seq;
      this.ops = s.ops;
    }
    _tx(cmd, cost, fn) {
      if (this._depth === 0) {
        this.history.push(this.snapshot());
        this._cost = 0;
      }
      this._depth++;
      let out;
      try { out = fn(); } finally { this._depth--; }
      this._cost += cost;
      if (this._depth === 0) {
        this.ops += this._batch ? Math.min(1, this._cost) : this._cost;
        this._batch = false;
        G.bus.emit('ws:change', { cmd, ws: this });
      }
      return out;
    }
    /* まとめて 1 手として数える。道具・自動化はこれで包む */
    batch(fn, label) {
      if (this._depth === 0) this._batch = true;
      return this._tx(label || 'batch', 0, fn);
    }
    undo() {
      if (!this.history.length) return false;
      this.restore(this.history.pop());
      G.bus.emit('ws:change', { cmd: 'undo', ws: this });
      return true;
    }

    /* ---------- 命令 ---------- */
    createFolder(parentId, name) {
      let base = (name || '新しいフォルダ').trim() || '新しいフォルダ';
      let nm = base;
      for (let i = 2; this._nameTaken(parentId, nm); i++) nm = `${base} (${i})`;
      return this._tx('createFolder', 1, () => {
        const id = 'd' + ++this.seq;
        this.nodes.set(id, { id, type: 'folder', name: nm, parent: parentId });
        return id;
      });
    }
    /* path のフォルダを無ければ作って id を返す。counted=true なら手数に数える */
    ensurePath(path, counted) {
      let cur = 'root';
      for (const seg of path) {
        const depth = path.indexOf(seg);
        let hit = this.children(cur).find((c) => c.type === 'folder' && this.key(c.name, depth) === this.key(seg, depth));
        if (!hit) {
          if (counted) hit = this.node(this.createFolder(cur, seg));
          else {
            hit = { id: 'd' + ++this.seq, type: 'folder', name: seg, parent: cur };
            this.nodes.set(hit.id, hit);
          }
        }
        cur = hit.id;
      }
      return cur;
    }
    /* 動かせるものだけを返す（理由つきで弾く） */
    movable(ids, targetId) {
      const target = this.node(targetId);
      const ok = [];
      let reason = null;
      if (!target || target.type !== 'folder') return { ok, reason: '置き場所がありません' };
      const vault = this.lockedVault(targetId);
      const shut = this.shutOver(targetId);
      if (shut) return { ok, reason: `「${shut.name}」は施錠されています。開けてから入れてください` };
      for (const id of ids) {
        const n = this.node(id);
        if (!n || n.parent === targetId) continue;
        const held = this.shutOver(id);
        if (held) { reason = `「${held.name}」は施錠されています。開けてから取り出してください`; continue; }
        if (vault && !(n.type === 'file' && n.attrs.kind === '鍵')) {
          reason = `「${vault.name}」には鍵がかかっています。先に鍵のファイルを入れてください`;
          continue;
        }
        if (n.type === 'folder') {
          if (n.locked) { reason = '備えつけのフォルダは動かせません'; continue; }
          if (targetId === 'desk') { reason = 'フォルダは机の上には戻せません'; continue; }
          if (this.isInside(targetId, id)) { reason = 'フォルダを自分の中には入れられません'; continue; }
          if (this._nameTaken(targetId, n.name, id)) { reason = '同じ名前のフォルダがすでにあります'; continue; }
        }
        ok.push(id);
      }
      return { ok, reason };
    }
    move(ids, targetId) {
      const { ok, reason } = this.movable([].concat(ids), targetId);
      if (!ok.length) return { moved: 0, reason };
      this._tx('move', 1, () => {
        /* 近道が切れる依頼では、本体（やそれを含むフォルダ）を棚の中で動かすと、その近道は切れる。
           机の上から最初に置くのは「動かす」に数えない */
        if (this.fragile) {
          this.refs('link').forEach((l) => {
            const src = this.node(l.src);
            if (src && this.inShelf(src.parent) && ok.some((id) => this.isInside(src.id, id))) l.broken = true;
          });
        }
        ok.forEach((id) => (this.node(id).parent = targetId));
      });
      return { moved: ok.length, reason };
    }
    /* 名前の付け替えは手数に数えない（打ち間違いを罰しない） */
    rename(id, name) {
      const n = this.node(id);
      const nm = String(name).trim();
      if (!n || n.locked || !nm || (n.type === 'folder' && this._nameTaken(n.parent, nm, id))) return false;
      if (nm === n.name) return true;
      /* フォルダの付け替えは手数に数えない。ファイルの付け替えは 1 手。元の名前と、たどってきた名前を残す */
      this._tx('rename', n.type === 'file' ? 1 : 0, () => {
        if (n.type === 'file') {
          n.orig = n.orig || n.name;
          n.names = (n.names || [n.name]).concat([nm]);
        }
        n.name = nm;
      });
      return true;
    }
    /* フォルダを片づける。中のファイルは机の上へ戻る */
    removeFolder(id) {
      const n = this.node(id);
      if (!n || n.type !== 'folder' || n.locked || n.shut || id === 'root' || id === 'desk') return false;
      const doomed = [...this.nodes.values()].filter((x) => x.type === 'folder' && this.isInside(x.id, id));
      /* 中に備えつけのフォルダがあれば、それは棚の直下へ戻す */
      this._tx('removeFolder', 1, () => {
        this.subtreeFiles(id).forEach((f) => (f.parent = 'desk'));
        doomed.forEach((x) => (x.locked ? (x.parent = 'root') : this.nodes.delete(x.id)));
      });
      return true;
    }
    /* 原本から写し（copy）や近道（link）をつくる。できたものは机の上に置かれる */
    makeRef(id, role) {
      const f = this.node(id);
      if (!f || f.type !== 'file' || f.role) return null;
      return this._tx(role, 1, () => {
        const nid = 'f' + ++this.seq;
        const name = role === 'copy' ? f.name.replace(/(\.\w+)$/, ' の写し$1') : f.name + ' への近道';
        this.nodes.set(nid, { id: nid, type: 'file', name, parent: 'desk', attrs: Object.assign({}, f.attrs), role, src: id });
        return nid;
      });
    }
    /* 写し・近道を捨てる（原本は捨てられない） */
    /* 封を解く。合言葉が合えば、札の中身が読めるようになる */
    unseal(id, word) {
      const f = this.node(id);
      if (!f || !f.sealed || f.sealed !== word) return false;
      this._tx('unseal', 1, () => { f.sealed = undefined; f.opened = true; });
      return true;
    }
    /* フォルダを合言葉で施錠する／開ける。施錠中は出し入れできない */
    lock(id, word) {
      const d = this.node(id);
      if (!d || d.type !== 'folder' || id === 'root' || id === 'desk' || d.shut || !word) return false;
      this._tx('lock', 1, () => (d.shut = word));
      return true;
    }
    unlock(id) {
      const d = this.node(id);
      if (!d || !d.shut) return false;
      this._tx('unlock', 1, () => (d.shut = undefined));
      return true;
    }
    removeRef(id) {
      const f = this.node(id);
      if (!f || !f.role) return false;
      this._tx('removeRef', 1, () => this.nodes.delete(id));
      return true;
    }
  }

  G.Workspace = Workspace;
})();
