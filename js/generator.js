/* 依頼の自動生成 — 「格」（1〜12）と種（seed）から、依頼をひとつ決定的に組み立てる。
 *
 * 格が上がると増えるのはファイルの数ではなく「要素」（MECHS）とその掛け合わせ。
 * 要素はそれぞれ、分類の条項（優先順位つき）・追加の条項・手紙の一文・備えつけのフォルダを持ち寄る。
 * 要素を足したいときは MECHS に 1 件足し、ORDER（条項の優先順位）と UNLOCK（解禁される格）に名前を入れる。
 *
 * 依頼の id:  w-<格>-<種>  飛び込みの依頼（報酬は満額）
 *             c-<格>-<種>  自分で作った稽古（報酬は三割）
 *             a-<格>-<種>  広告で呼び込んだ依頼（広告費が要る。報酬は満額）
 */
(function () {
  'use strict';

  const MAX_LEVEL = 20;

  /* 種から決まる乱数（同じ id なら何度作っても同じ依頼になる） */
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r = {
      next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      shuffle(arr) {
        const a2 = arr.slice();
        for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; }
        return a2;
      },
    };
    return r;
  }

  /* ── 題材: 依頼主の業種ごとの語彙 ── */
  const THEMES = [
    {
      id: 'sekkei', trade: '設計事務所',
      clients: ['杉浦建築事務所　杉浦', '港町設計　湊', '槙設計室　槙'],
      projs: ['山手邸', '川辺の家', '丘の診療所', '駅前ビル'],
      authors: ['杉浦', '早苗', '小暮'],
      docs: [
        { doc: '契約書', ext: ['pdf'], important: true },
        { doc: '見積書', ext: ['xlsx'] },
        { doc: '図面', ext: ['pdf', 'png'], handy: true },
        { doc: '議事録', ext: ['docx'] },
        { doc: '現場写真', ext: ['jpg'] },
      ],
      upcoming: [['海辺の別荘', ['図面', '見積']], ['旧館の改修', ['調査', '図面']], ['保育園の増築', ['申請', '図面']]],
      jobs: ['事務所の引っ越し', '年度替わりの棚卸し', '共有フォルダの立て直し', '竣工後の片づけ'],
    },
    {
      id: 'shuppan', trade: '出版社',
      clients: ['月見出版　月見', '汀書房　有馬', 'こだま舎　児玉'],
      projs: ['文芸誌', '絵本', '社史', '図鑑'],
      authors: ['月見', '有馬', '千種'],
      docs: [
        { doc: '契約書', ext: ['pdf'], important: true },
        { doc: '原稿', ext: ['docx', 'txt'], handy: true },
        { doc: '挿絵', ext: ['png', 'jpg'] },
        { doc: '進行表', ext: ['xlsx'] },
        { doc: '取材録音', ext: ['mp3'] },
      ],
      upcoming: [['写真集', ['原稿', '写真']], ['翻訳叢書', ['原文', '訳稿']], ['創刊準備号', ['企画', '原稿']]],
      jobs: ['編集部の共有フォルダ', '校了後の片づけ', '担当替えの引き継ぎ', '年度替わりの棚卸し'],
    },
    {
      id: 'shouten', trade: '商店街の事務局',
      clients: ['あけぼの商店街　桑原', '浜通り商店会　浜野', '八百トメ　浜口トメ'],
      projs: ['春の催事', '夏祭り', '歳末売出し', '朝市'],
      authors: ['桑原', '浜野', 'トメ'],
      docs: [
        { doc: '契約書', ext: ['pdf'], important: true },
        { doc: 'チラシ', ext: ['png', 'pdf'], handy: true },
        { doc: '売上表', ext: ['xlsx', 'csv'] },
        { doc: '案内文', ext: ['docx'] },
        { doc: '会場写真', ext: ['jpg'] },
      ],
      upcoming: [['秋の収穫祭', ['チラシ', '出店者']], ['七夕まつり', ['飾り', '協賛']], ['新春初売り', ['チラシ', '福袋']]],
      jobs: ['事務局のパソコン', '催しのあとの片づけ', '役員交代の引き継ぎ', '補助金の報告前'],
    },
    {
      id: 'shinryo', trade: '診療所',
      clients: ['丘の診療所　丘', 'みどり歯科　緑川', 'こもれび小児科　木下'],
      projs: ['健診', '予防接種', '往診', '院内研修'],
      authors: ['丘', '緑川', '木下'],
      docs: [
        { doc: '同意書', ext: ['pdf'], important: true },
        { doc: '問診票', ext: ['pdf', 'docx'], handy: true },
        { doc: '検査結果', ext: ['xlsx', 'csv'] },
        { doc: '掲示物', ext: ['png'] },
        { doc: '院内写真', ext: ['jpg'] },
      ],
      upcoming: [['夜間診療', ['当番表', '案内']], ['新棟の開設', ['図面', '備品']], ['健康教室', ['資料', '名簿']]],
      jobs: ['カルテ移行の前の整理', '院内パソコンの入れ替え', '年度末の書類整理', '監査の前の片づけ'],
    },
    {
      id: 'gakko', trade: '学校',
      clients: ['桜台小学校　事務室', 'みなと中学校　教務', 'ひばり幼稚園　園長'],
      projs: ['運動会', '遠足', '文化祭', '卒業式'],
      authors: ['教務', '事務', '養護'],
      docs: [
        { doc: '名簿', ext: ['xlsx'], important: true },
        { doc: '配布プリント', ext: ['docx', 'pdf'], handy: true },
        { doc: '行事写真', ext: ['jpg'] },
        { doc: '会計報告', ext: ['xlsx', 'csv'] },
        { doc: '校内放送', ext: ['mp3'] },
      ],
      upcoming: [['修学旅行', ['しおり', '名簿']], ['入学式', ['式次第', '配布物']], ['公開授業', ['指導案', '案内']]],
      jobs: ['年度替わりの整理', '職員室の共有フォルダ', '行事のあとの片づけ', '担任交代の引き継ぎ'],
    },
    {
      id: 'houritsu', trade: '法律事務所',
      clients: ['柏木法律事務所　柏木', '港南司法書士事務所　南', 'つぐみ行政書士事務所　鶫'],
      projs: ['相続', '会社設立', '賃貸借', '商標'],
      authors: ['柏木', '南', '鶫'],
      docs: [
        { doc: '委任状', ext: ['pdf'], important: true },
        { doc: '書面の控え', ext: ['docx', 'pdf'], handy: true },
        { doc: '証拠写真', ext: ['jpg', 'png'] },
        { doc: '費用明細', ext: ['xlsx'] },
        { doc: '面談録音', ext: ['mp3'] },
      ],
      upcoming: [['遺言の作成', ['原案', '資料']], ['事業承継', ['契約', '評価']], ['登記の変更', ['申請', '添付']]],
      jobs: ['事件記録の整理', '事務所の移転', '決算前の棚卸し', '新人への引き継ぎ'],
    },
    {
      id: 'inshoku', trade: '飲食店',
      clients: ['喫茶 灯台　早瀬', 'そば処 竹林　竹内', '洋食 かもめ亭　鴎'],
      projs: ['春の献立', '夏の献立', '仕出し', '周年祭'],
      authors: ['早瀬', '竹内', '鴎'],
      docs: [
        { doc: '許可証', ext: ['pdf'], important: true },
        { doc: 'レシピ', ext: ['docx', 'txt'], handy: true },
        { doc: '料理写真', ext: ['jpg'] },
        { doc: '仕入れ表', ext: ['xlsx', 'csv'] },
        { doc: '店内音楽', ext: ['mp3'] },
      ],
      upcoming: [['秋の献立', ['試作', '原価']], ['二号店', ['図面', '求人']], ['料理教室', ['資料', '申込']]],
      jobs: ['店のパソコンの整理', '改装の前の片づけ', '保健所の立入の前', '帳簿の締め'],
    },
    {
      id: 'kenkyu', trade: '研究室',
      clients: ['水野研究室　水野', '潮見研究所　潮', '星野ゼミ　星野'],
      projs: ['水質調査', '土壌分析', '気象観測', '文献調査'],
      authors: ['水野', '潮', '星野'],
      docs: [
        { doc: '承諾書', ext: ['pdf'], important: true },
        { doc: '論文草稿', ext: ['docx'], handy: true },
        { doc: '測定データ', ext: ['csv', 'xlsx'] },
        { doc: 'グラフ', ext: ['png'] },
        { doc: '聞き取り録音', ext: ['wav', 'mp3'] },
      ],
      upcoming: [['学会発表', ['要旨', 'スライド']], ['共同研究', ['計画', '覚書']], ['野外実習', ['行程', '名簿']]],
      jobs: ['研究室の共有ドライブ', '卒業生からの引き継ぎ', '報告書の提出前', '年度末の整理'],
    },
    {
      id: 'yakuba', trade: '役場',
      clients: ['浜崎町役場　総務課', '山根村役場　住民課', '汐入公民館　館長'],
      projs: ['防災訓練', '夏まつり', '広報紙', '健康づくり'],
      authors: ['総務', '住民', '企画'],
      docs: [
        { doc: '協定書', ext: ['pdf'], important: true },
        { doc: '回覧文', ext: ['docx', 'pdf'], handy: true },
        { doc: '予算表', ext: ['xlsx'] },
        { doc: 'ポスター', ext: ['png'] },
        { doc: '記録写真', ext: ['jpg'] },
      ],
      upcoming: [['成人のつどい', ['案内', '名簿']], ['町民運動会', ['種目', '備品']], ['文化財調査', ['記録', '写真']]],
      jobs: ['庁内の共有フォルダ', '人事異動の引き継ぎ', '議会の前の整理', '保存年限の見直し'],
    },
    {
      id: 'shashin', trade: '写真館',
      clients: ['小野寺写真館　小野寺', 'フォト工房ひかり　光井', 'スタジオ凪　凪'],
      projs: ['七五三', '成人式', '卒業アルバム', '家族写真'],
      authors: ['小野寺', '光井', '凪'],
      docs: [
        { doc: '使用許諾書', ext: ['pdf'], important: true },
        { doc: '納品写真', ext: ['jpg', 'png'], handy: true },
        { doc: '見積書', ext: ['xlsx'] },
        { doc: '撮影台本', ext: ['docx'] },
        { doc: '撮影時の音声', ext: ['mp3'] },
      ],
      upcoming: [['桜の出張撮影', ['申込', '台本']], ['写真展', ['出品', '案内']], ['アルバムの増刷', ['注文', '原稿']]],
      jobs: ['撮影シーズン後の片づけ', '店のパソコンの入れ替え', '納品前の整理', '代替わりの引き継ぎ'],
    },
  ];

  /* ── 出だしの状態: 同じ決まりごとでも、どこから始めるかで仕事が変わる ── */
  const SCENES = {
    desk: { label: '机の上から', say: '' },
    inherit: { label: '前任者の棚', say: '棚には、前の担当が作ったフォルダがそのまま残っています。名前を付け替えて使ってもらって構いません。' },
    half: { label: 'やりかけの棚', say: '途中までは自分でやってみました。合っているところはそのままで、間違っているところだけ直してください。' },
  };
  function applyScene(lv, scene, r) {
    const ws = new G.Workspace(lv);
    const plan = new Map();
    G.planFor(lv, ws).forEach((path, id) => plan.set(ws.node(id).name, path));
    const sealed = Object.keys(lv.marks).filter((k) => lv.marks[k] === 'vault');
    const open = (path) => path && !sealed.includes(path[0]);
    const movable = r.shuffle(lv.files.filter((s) => !s[4] && !s[0].endsWith('.key') && open(plan.get(s[0]))));
    if (scene === 'inherit') {
      const junk = r.shuffle(['新しいフォルダ', '新しいフォルダ (2)', 'とりあえず', '古い', '保留', 'あとで見る']).slice(0, r.int(2, 3));
      lv.folders = junk.map((j) => [j]);
      movable.slice(0, Math.ceil(movable.length * 0.45)).forEach((s) => (s[4] = [r.pick(junk)]));
    } else {
      const right = Math.ceil(movable.length * 0.35);
      const wrong = Math.ceil(movable.length * 0.15);
      const places = [...new Set(movable.map((s) => plan.get(s[0]).join('\u0000')))].map((p) => p.split('\u0000'));
      movable.slice(0, right).forEach((s) => (s[4] = plan.get(s[0])));
      movable.slice(right, right + wrong).forEach((s) => {
        const other = places.filter((p) => p.join('/') !== plan.get(s[0]).join('/'));
        if (other.length) s[4] = r.pick(other);
      });
    }
  }

  const AXIS = {
    proj: { seg: '{proj}', word: '案件' },
    doc: { seg: '{doc}', word: '書類の種別' },
    kind: { seg: '{kind}', word: 'ファイルの種類（画像・文書・表など）' },
    year: { seg: '{year}年', word: '年' },
    author: { seg: '{author}', word: '作成者' },
  };
  const eq = (attr, v) => ({ attr, eq: v });
  const NOT_DUP = { not: eq('state', '重複') };

  /* ── 要素 ──
   * label: 受付に出す名前 / min: 解禁される格 / needs: 前提の要素
   * rule(x): 分類の条項（条件と行き先） / more(x): 追加の条項 / mark: 備えつけフォルダ
   * say(x): 手紙の一文 / teach: 初めて出会ったときの手ほどき / seed(x): 当てはまるファイルを仕込む */
  const MECHS = {
    nest: {
      label: '入れ子', min: 2, side: 'logic',
      teach: 'ふたつの軸で分ける依頼です。外側のフォルダの中に、内側のフォルダを入れ子にします。条項の例を見て、どちらが外側かを確かめましょう。',
    },
    exception: {
      label: '例外', min: 2, side: 'logic',
      rule: (x) => ({ when: eq('doc', x.important), path: ['重要'] }),
      say: (x) => x.r.pick([
        `ただし${x.important}だけは別です。どの${x.a.word}のものでも「重要」にまとめてください。`,
        `${x.important}は大事なものなので、ほかとは分けて「重要」というフォルダにお願いします。`,
      ]),
      teach: '例外のある依頼です。条項は上から順に当てはめ、最初に合ったものだけが効きます。番号の小さい条項が先です。',
      seed: (x) => {
        x.ensure(2, (f) => f.doc === x.important, (f) => x.setDoc(f, x.importantDef));
        /* 「社外秘」があるとき、大事な書類がすべて機密だと「重要」が空になる。機密でないものを必ず残す */
        if (x.has('secret')) x.files.filter((f) => f.doc === x.important).forEach((f, i) => (f.secrecy = i === 0 ? '社内' : f.secrecy));
      },
    },
    reserve: {
      label: '空フォルダ', min: 3, side: 'hand',
      more: (x) => [{ type: 'reserve', paths: x.reservePaths }],
      say: (x) => {
        const [top, subs] = x.upcoming;
        return x.r.pick([
          `それと、このあと「${top}」の作業を始めます。「${top}」というフォルダを作り、その中に${subs.map((s) => `「${s}」`).join('と')}の空のフォルダを用意しておいてください。中身はこちらで入れます。`,
          `来月から「${top}」が動き出します。先に入れ物だけ欲しいので、「${top}」の中に${subs.map((s) => `「${s}」`).join('・')}という空フォルダを作っておいてもらえますか。`,
        ]);
      },
      teach: '空のフォルダを用意する依頼です。名前は手紙のとおりに。ふだんは「空のフォルダを残さない」決まりですが、頼まれた入れ物はその例外です。',
    },
    trash: {
      label: '重複', min: 4, side: 'logic', mark: ['ごみ箱', 'trash'],
      rule: () => ({ when: eq('state', '重複'), path: ['ごみ箱'] }),
      say: (x) => x.r.pick([
        '同じファイルが重複して入っているようです。重複しているほうは「ごみ箱」へ入れてください。札の〈版〉に「重複」と出ているはずです。',
        'コピーが紛れ込んでいます。〈版〉が「重複」のものは要りませんので、「ごみ箱」へお願いします。',
      ]),
      teach: '「ごみ箱」は備えつけのフォルダです。動かしたり名前を変えたりはできません。重複かどうかは名前ではなく、札の〈版〉で確かめます。',
      seed: (x) => x.duplicate(2),
    },
    archive: {
      label: '保管', min: 5, side: 'logic',
      rule: (x) => ({ when: { attr: 'year', lt: x.cutYear }, path: ['保管'] }),
      say: (x) => x.r.pick([
        `${x.cutYear}年より前のものはもう動かさないので、中身を問わず「保管」にまとめてください。`,
        `古いもの（${x.cutYear}年より前）は「保管」へ。細かく分けなくて結構です。`,
      ]),
      teach: '日付で決まる条項です。年は名前に出ていないことがあります。札の〈日付〉を見て、境目の年より前かどうかを確かめます。',
      seed: (x) => {
        x.ensure(2, (f) => f.year < x.cutYear, (f) => (f.year = x.cutYear - x.r.int(1, 2)));
        x.ensure(4, (f) => f.year >= x.cutYear, (f) => (f.year = x.cutYear + x.r.int(0, 1)));
      },
    },
    cloud: {
      label: 'クラウド', min: 6, side: 'logic', mark: ['クラウド', 'cloud'],
      rule: (x) => ({
        when: x.has('cloudSize') || x.has('capacity') ? {
          all: [eq('secrecy', '公開')].concat(
            x.has('cloudSize') ? [{ attr: 'size', lte: x.cap }] : [], x.has('capacity') ? [eq('fits', '可')] : []),
        } : eq('secrecy', '公開'),
        say: x.has('capacity')
          ? `〈機密区分〉が「公開」${x.has('cloudSize') ? `で ${x.cap}MB 以下` : ''}のうち、小さい順に足して合計 ${x.capTotal}MB に収まるもの` : null,
        path: ['クラウド', x.a.seg],
      }),
      more: () => [{ type: 'forbid', when: eq('secrecy', '機密'), under: ['クラウド'] }],
      say: (x) => x.r.pick([
        `社外の方にも見てもらうものは「クラウド」に置きます。〈機密区分〉が「公開」のものを、クラウドの中で${x.a.word}ごとに分けてください。機密のものは決してクラウドに置かないでください。`,
        `〈機密区分〉が「公開」のファイルは「クラウド」へ上げてください。中は${x.a.word}ごとに。言うまでもありませんが、機密のものをクラウドに置くのは厳禁です。`,
      ]),
      teach: '「クラウド」は社外からも見える置き場です。置いてよいのは〈機密区分〉が「公開」のものだけ。行き先と禁止、ふたつの条項が同時に効きます。',
      seed: (x) => x.ensure(3, (f) => f.secrecy === '公開' && f.doc !== x.important, (f) => (f.secrecy = '公開'), (f) => f.doc !== x.important),
    },
    backup: {
      label: 'バックアップ', min: 7, side: 'hand', mark: ['バックアップ', 'backup'],
      more: (x) => [{
        type: 'backup', path: ['バックアップ'],
        when: x.has('trash') ? { all: [eq('doc', x.important), NOT_DUP] } : eq('doc', x.important),
      }],
      say: (x) => x.r.pick([
        `${x.important}は失くすと困ります。写しをとって「バックアップ」にも入れておいてください。原本はいつもの場所に置いたままで。${x.has('trash') ? '重複のほうは写さなくて結構です。' : ''}`,
        `念のため、${x.important}は写しを「バックアップ」にも。原本は動かさず、決まりどおりの場所へ。${x.has('trash') ? '捨てる重複まで写す必要はありません。' : ''}`,
      ]),
      teach: '写しをとる依頼です。ファイルを押して札を出し、「写しをとる」を押すと机の上に写しができます。原本は分類どおりの場所へ、写しは「バックアップ」へ。',
      seed: (x) => x.ensure(2, (f) => f.doc === x.important, (f) => x.setDoc(f, x.importantDef)),
    },
    shortcut: {
      label: '近道', min: 8, side: 'hand', mark: ['よく使う', 'pin'],
      more: (x) => [{
        type: 'shortcut', path: ['よく使う'],
        when: { all: [eq('doc', x.handy)].concat(x.has('trash') ? [NOT_DUP] : [], x.has('archive') ? [{ attr: 'year', gte: x.cutYear }] : []) },
      }],
      say: (x) => `${x.handy}は毎日のように開くので、「よく使う」に近道（ショートカット）を置いてください。本体は動かさずに。${x.has('archive') ? `保管にまわす古いもの（${x.cutYear}年より前）の近道は要りません。` : ''}`,
      teach: '近道（ショートカット）は、本体を動かさずに別の場所からも開けるようにするものです。札の「近道をつくる」で作り、「よく使う」へ運びます。',
      seed: (x) => x.ensure(2, (f) => f.doc === x.handy && (!x.has('archive') || f.year >= x.cutYear),
        (f) => { x.setDoc(f, x.handyDef); if (x.has('archive')) f.year = x.cutYear + x.r.int(0, 1); }, (f) => f.doc !== x.important),
    },
    secret: {
      label: '社外秘', min: 9, side: 'logic',
      rule: () => ({ when: eq('secrecy', '機密'), path: ['社外秘'] }),
      say: (x) => x.r.pick([
        '〈機密区分〉が「機密」のものは、ほかの決まりより先に「社外秘」へ集めてください。',
        '機密のファイルは扱いを分けます。何の書類であっても、まず「社外秘」へ。',
      ]),
      teach: '機密のファイルは、ほかのどの決まりよりも先に「社外秘」へ行きます。たとえ契約書でも、古いものでも、です。条項の順番を確かめましょう。',
      seed: (x) => x.ensure(2, (f) => f.secrecy === '機密', (f) => (f.secrecy = '機密')),
    },
    cloudSize: {
      label: '容量', min: 10, side: 'logic', needs: 'cloud',
      say: (x) => `ただしクラウドは ${x.cap}MB を超えるファイルを受け付けません。超えるものは「公開」でも上げず、ほかのファイルと同じように手元の棚へ置いてください。`,
      teach: '条件がふたつ重なる条項です。「公開」で、しかも容量の上限以下のものだけがクラウドへ行きます。大きすぎるものは、その下の条項に落ちていきます。',
      seed: (x) => {
        const open = x.files.filter((f) => f.secrecy === '公開' && f.doc !== x.important);
        open.forEach((f, i) => (f.size = i === 0 ? x.cap + x.r.int(8, 60) : Math.min(f.size, x.cap - x.r.int(1, 20))));
      },
    },
    draft: {
      label: '下書き', min: 11, side: 'logic',
      rule: () => ({ when: eq('state', '下書き'), path: ['下書き'] }),
      say: () => '書きかけのもの（〈版〉が「下書き」）は、仕上がったものと混ざらないよう「下書き」に分けておいてください。',
      teach: '〈版〉が「下書き」のものを分けます。名前に「下書き」とあっても、決め手は札です。',
      seed: (x) => x.ensure(2, (f) => f.state === '下書き', (f) => (f.state = '下書き'), (f) => f.state === '確定版'),
    },

    /* ── 格 13 から: 理屈を覚えたあとで、圧力と、現実離れした仕掛けを 1 つずつ ── */
    opsCap: {
      label: '手数の上限', min: 13, side: 'hand',
      more: () => [{ type: 'opsLimit', factor: 1.5 }],
      say: () => 'あまり棚をいじり回されると困ります。手数には上限を設けますので、条項の数字を確かめてから始めてください。',
      teach: '手数に上限があります（目安の 1.5 倍）。超えたまま納品すると、充足が満点でも差し戻しです。動かす前に棚の形を決めましょう。「ひとつ戻す」で手数も戻ります。',
    },
    fragile: {
      label: '切れる近道', min: 14, side: 'logic', needs: 'shortcut',
      say: () => '近道は、本体をあとから動かすと切れてしまいます。本体の置き場所を決めてから作ってください。',
      teach: '近道は本体の場所を覚えています。棚に置いた本体（やそれを含むフォルダ）をあとから動かすと、近道は切れて役に立たなくなります。順番は「本体を置く → 近道を作る」。切れたら捨てて作り直します。',
    },
    versions: {
      label: '版の系譜', min: 15, side: 'logic',
      rule: () => ({ when: eq('stale', '旧'), path: ['旧版'], say: '同じ書類に、より新しい版があるもの（旧い版）' }),
      say: () => '同じ書類の版がいくつか混ざっています（名前の末尾が v1、v2…）。いちばん新しい版だけを決まりどおりに置き、それより旧い版は「旧版」にまとめてください。',
      teach: '1 つのファイルだけ見ても決まらない条項です。同じ書類の版どうしを見比べ、いちばん新しい版だけがふつうの扱い。それより旧い版は「旧版」へ。虫めがねで名前を探すと揃えやすくなります。',
    },
    timer: {
      label: '納期', min: 16, side: 'hand',
      say: () => '急ぎの仕事です。手を動かしはじめてからの時間を計らせてください。遅れても受け取りますが、そのぶんは報酬から引かせてもらいます。',
      teach: '納期のある依頼です。砂時計は、最初に手を動かしたときから進みます。読んで考える時間は計りません。遅れても差し戻しにはならず、報酬が最大 15% 減るだけです。',
    },
    capacity: {
      label: '棚の容量', min: 17, side: 'logic', needs: 'cloud',
      say: (x) => `クラウドの空きは、合計で ${x.capTotal}MB しかありません。上げてよいもののうち、サイズの小さいものから順に入れていき、収まりきらないものは手元の棚に、ほかのファイルと同じように置いてください。`,
      teach: 'クラウド全体に容量があります。上げてよいファイルを小さい順に足していき、合計が上限を超える手前で止めます。入りきらなかったものは、下の条項に落ちます。並べ札でサイズ順にすると数えやすくなります。',
    },
    late: {
      label: '追加の到着', min: 18, side: 'hand',
      teach: '作業の途中で、追加のファイルが届くことがあります。届いたら机の上に現れ、要求書に追伸がつきます。決まりは同じです。先に届いた分だけで棚を決めつけず、あとから足せる形にしておきましょう。',
    },
    vault: {
      label: '鍵つきの金庫', min: 19, side: 'logic', needs: 'secret', mark: ['社外秘', 'vault'],
      rule: () => ({ when: eq('kind', '鍵'), path: ['社外秘'] }),
      say: () => '「社外秘」は金庫にしました。鍵のファイル（社外秘の鍵.key）を先に入れないと開きません。鍵はそのまま金庫の中にしまっておいてください。',
      teach: '「社外秘」は鍵つきの金庫です。鍵のファイルを先に入れるまで、ほかのものは入りません。鍵は机の上のどこかにあります。前提を先に済ませる——順番そのものが条項です。',
    },
    mirror: {
      label: '鏡の棚', min: 20, side: 'logic', needs: 'nest', mark: ['鏡', 'mirror'],
      more: (x) => [{
        type: 'shortcut', title: '鏡', path: ['鏡', x.b.seg, x.a.seg],
        when: { all: [eq('author', x.mirrorAuthor), eq('proj', x.mirrorProj), NOT_DUP, { not: eq('stale', '旧') }] },
        say: `〈作成者〉が「${x.mirrorAuthor}」で〈案件〉が「${x.mirrorProj}」（重複と旧い版を除く）`,
      }],
      say: (x) => `${x.mirrorAuthor}さんが担当した「${x.mirrorProj}」の分は、逆の順でも辿れるようにしたいのです。「鏡」の中に、${x.b.word}ごと、その中を${x.a.word}ごと、という逆さの入れ子を作り、そこに近道を置いてください。本体は動かさずに。`,
      teach: '「鏡」の中には、棚の入れ子を逆さにした形（内側と外側を入れ替えたもの）を作り、近道を置きます。同じファイルを、ふたつの順で辿れるようにする仕掛けです。対象は、手紙で指定された人と案件の分だけ。',
    },
  };
  /* 分類の条項の優先順位（上が先）。理屈: 捨てるもの → 守るもの → 特別扱い → 古いもの → 外に出すもの → 途中のもの → ふつう */
  const ORDER = ['vault', 'trash', 'versions', 'secret', 'exception', 'archive', 'cloud', 'draft'];
  /* 格ごとの要素の数。ファイルの数ではなく、ここで難しさが決まる。格 13 からは 1 格につき 1 つずつ加わる */
  const COUNT = [0, 1, 2, 3, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19];

  function chooseMechs(level, r) {
    const open = Object.keys(MECHS).filter((k) => MECHS[k].min <= level);
    const fresh = open.filter((k) => MECHS[k].min === level);
    const picked = new Set(level === 2 ? [r.pick(fresh)] : fresh);
    const rest = r.shuffle(open.filter((k) => !picked.has(k)));
    const want = Math.min(COUNT[level - 1], open.length);
    for (const k of rest) {
      if (picked.size >= want) break;
      picked.add(k);
    }
    /* 前提のある要素は、前提を連れてくる */
    [...picked].forEach((k) => MECHS[k].needs && picked.add(MECHS[k].needs));
    return Object.keys(MECHS).filter((k) => picked.has(k));
  }

  function make(level, seed, kind) {
    level = Math.max(1, Math.min(MAX_LEVEL, level | 0));
    const r = rng(seed * 7919 + level);
    const T = r.pick(THEMES);
    const mechs = chooseMechs(level, r);
    const has = (k) => mechs.includes(k);

    /* 分け方の軸 */
    const a = AXIS[r.pick(level === 1 ? ['proj', 'doc', 'kind'] : ['proj', 'proj', 'doc', 'author', 'year'])];
    /* 出だしの状態。格 2 から、半分は机の上から、残りは前任者の棚かやりかけの棚 */
    const scene = level < 2 ? 'desk' : r.pick(['desk', 'desk', 'inherit', 'half']);
    const secondPool = ['year', 'doc', 'kind', 'proj', 'author'].map((k) => AXIS[k]).filter((v) => v !== a);
    const b = has('nest') ? r.pick(secondPool) : null;

    const importantDef = T.docs.find((d) => d.important);
    const handyDef = T.docs.find((d) => d.handy);
    const upcoming = r.pick(T.upcoming);

    /* ── ファイルを用意する ── */
    /* ファイルの数はゆるやかにしか増やさない（格 12 で 18、格 20 で 24。重複・旧い版・鍵が数個これに加わる） */
    const n = level <= 12 ? Math.min(18, 8 + level) : 16 + (level - 12);
    const files = [];
    const setDoc = (f, def) => { f.doc = def.doc; f.ext = r.pick(def.ext); if (def.important) f.secrecy = has('secret') ? f.secrecy : '機密'; };
    const sizeFor = (ext) => {
      const kindOf = G.KINDS[ext];
      const [lo, hi] = kindOf === '画像' ? [2, 38] : kindOf === '音声' ? [6, 70] : kindOf === '表' ? [1, 4] : [1, 9];
      return r.int(lo, hi);
    };
    for (let i = 0; i < n; i++) {
      const def = r.pick(T.docs);
      const f = {
        proj: T.projs[i % 3 === 0 ? r.int(0, 2) : i % 3], doc: def.doc, ext: r.pick(def.ext),
        year: r.int(2023, 2025), month: r.int(1, 12), author: r.pick(T.authors),
        secrecy: def.important ? '機密' : r.pick(['社内', '社内', '社内', '公開', '公開', '機密']), state: '確定版',
        fits: '可',
      };
      f.size = sizeFor(f.ext);
      files.push(f);
    }
    const x = {
      r, T, a, b, has, files, setDoc, importantDef, handyDef, upcoming,
      important: importantDef.doc, handy: handyDef.doc, cutYear: 2023, cap: r.pick([30, 50, 80]),
      reservePaths: [[upcoming[0]]].concat(upcoming[1].map((s) => [upcoming[0], s])),
      /* 条件に合うファイルが count 個になるまで、候補を作り替える */
      ensure(count, test, change, among) {
        let lack = count - files.filter(test).length;
        for (const f of r.shuffle(files.filter((g) => !g.pinned && !test(g) && (!among || among(g))))) {
          if (lack <= 0) break;
          change(f);
          f.pinned = true;
          lack--;
        }
        files.filter(test).slice(0, count).forEach((f) => (f.pinned = true));
      },
      duplicate(count) {
        const src = r.shuffle(files).slice(0, count);
        /* 掛け合わせを確かめられるよう、できれば大事な書類の重複もひとつ混ぜる */
        const imp = files.find((f) => f.doc === importantDef.doc);
        if (imp && (has('exception') || has('backup')) && !src.includes(imp)) src[0] = imp;
        src.forEach((f) => files.push(Object.assign({}, f, { state: '重複', dupOf: f, pinned: true })));
      },
    };
    if (has('archive')) x.cutYear = 2024;
    /* 仕込みは優先順位の低いものから。後から仕込む（優先の高い）要素が、先の仕込みを壊さないよう pinned で守る */
    ['shortcut', 'backup', 'exception', 'archive', 'cloud', 'cloudSize', 'secret', 'draft', 'trash']
      .filter(has).forEach((k) => MECHS[k].seed && MECHS[k].seed(x));

    /* どの条項にも、実際に当てはまるファイルが 1 つはあるようにする。
       優先の高い条項に先に取られて空になった条項があれば、ふつうのファイルを 1 つその条項向けに作り替える */
    const keyed = ORDER.filter(has).map((k) => [k, MECHS[k].rule(x)]);
    const firstOf = (f) => (keyed.find(([, rule]) => G.match(rule.when, { attrs: f, name: '' })) || ['base'])[0];
    const plain = (f) => { f.secrecy = '社内'; f.state = '確定版'; f.year = Math.max(f.year, x.cutYear); };
    const FORCE = {
      secret: (f) => (f.secrecy = '機密'),
      exception: (f) => { plain(f); setDoc(f, importantDef); f.secrecy = '社内'; },
      archive: (f) => { plain(f); f.year = x.cutYear - 1; },
      cloud: (f) => { plain(f); f.secrecy = '公開'; f.size = Math.min(f.size, x.cap - 5); },
      draft: (f) => { plain(f); f.state = '下書き'; },
    };
    const countOf = (k) => files.filter((f) => firstOf(f) === k).length;
    for (let pass = 0; pass < 4; pass++) {
      keyed.forEach(([k]) => {
        if (!FORCE[k] || countOf(k)) return;
        const free = files.filter((f) => !f.dupOf && f.doc !== x.important && f.doc !== x.handy);
        const cand = r.shuffle(free.filter((f) => firstOf(f) === 'base'))[0] || r.shuffle(free)[0];
        if (cand) FORCE[k](cand);
      });
      /* 「ふつうの分け方」に落ちるファイルも必ず残す。いちばん数の多い条項から 1 つ譲ってもらう */
      if (!countOf('base')) {
        const rich = keyed.map(([k]) => k).filter((k) => FORCE[k]).sort((p, q) => countOf(q) - countOf(p))[0];
        const cand = files.find((f) => !f.dupOf && f.doc !== x.important && firstOf(f) === rich) || files.find((f) => !f.dupOf && f.doc !== x.important);
        if (cand) plain(cand);
      }
    }

    const ordinary = (f) => !f.dupOf && f.doc !== x.important && f.doc !== x.handy;

    /* 棚の容量: クラウドに上がる候補を 3 つ以上にし、サイズを互いに違えて、いちばん大きい 1 つだけが入りきらないようにする */
    if (has('capacity')) {
      for (let i = 0; i < 3 && countOf('cloud') < 3; i++) {
        const cand = r.shuffle(files.filter((f) => ordinary(f) && firstOf(f) === 'base'))[0];
        if (cand) FORCE.cloud(cand);
      }
      const up = files.filter((f) => firstOf(f) === 'cloud').sort((p, q) => p.size - q.size);
      up.forEach((f, i) => { if (i && f.size <= up[i - 1].size) f.size = up[i - 1].size + 1; });
      if (up.length >= 2) {
        x.capTotal = up.slice(0, -1).reduce((s, f) => s + f.size, 0) + 1;
        up[up.length - 1].fits = '否';
      } else x.capTotal = up.reduce((s, f) => s + f.size, 0) + 10;
    }

    /* 版の系譜: ふつうのファイルを 2 つ選び、それぞれに旧い版を足す（選んだものが最新版になる） */
    if (has('versions')) {
      const plainOnes = r.shuffle(files.filter((f) => ordinary(f) && firstOf(f) === 'base'));
      const others = r.shuffle(files.filter((f) => ordinary(f) && firstOf(f) !== 'base' && firstOf(f) !== 'cloud'));
      plainOnes.concat(others).slice(0, 2).forEach((head, i) => {
        head.ver = i === 0 ? 3 : 2;
        for (let v = 1; v < head.ver; v++) {
          files.push(Object.assign({}, head, { ver: v, stale: '旧', verOf: head, month: Math.max(1, head.month - (head.ver - v)), pinned: true }));
        }
      });
    }

    /* 鏡の棚: 「ある人が担当した、ある案件の分」に絞って、作る近道を 2〜3 個に抑える */
    if (has('mirror')) {
      const load = (au, pj) => files.filter((f) => f.author === au && f.proj === pj && !f.dupOf && !f.stale).length;
      const pairs = [];
      T.authors.forEach((au) => T.projs.forEach((pj) => pairs.push([au, pj, load(au, pj)])));
      const best = r.shuffle(pairs.filter((p) => p[2] >= 2)).sort((p, q) => p[2] - q[2])[0] || pairs.sort((p, q) => q[2] - p[2])[0];
      x.mirrorAuthor = best[0];
      x.mirrorProj = best[1];
    }

    /* 追加の到着: ふつうのファイルを 3 つ、あとから届く分にまわす（クラウドの容量の計算に関わるものは避ける） */
    if (has('late')) {
      r.shuffle(files.filter((f) => ordinary(f) && !f.ver && !f.verOf && firstOf(f) !== 'cloud' && !files.some((g) => g.dupOf === f)))
        .slice(0, 3).forEach((f) => (f.late = true));
    }

    /* 金庫の鍵 */
    if (has('vault')) {
      files.push({
        isKey: true, name: '社外秘の鍵.key', doc: '鍵', proj: '—', ext: 'key', year: 2025, month: 1,
        author: '—', secrecy: '機密', state: '確定版', size: 1, fits: '可',
      });
    }

    /* 名前を決める（名前から読めるのは書類の種別と案件、それに版だけ。残りは札を見る） */
    const used = {};
    const specs = files.map((f) => {
      if (f.isKey) return f;
      if (f.dupOf) f.name = 'コピー ～ ' + f.dupOf.name;
      else if (f.verOf) f.name = `${f.verOf.stem}_v${f.ver}.${f.ext}`;
      else {
        const base = `${f.doc}_${f.proj}`;
        used[base] = (used[base] || 0) + 1;
        f.stem = base + (used[base] > 1 ? `_${used[base]}` : '') + (f.state === '下書き' ? '_下書き' : '');
        f.name = f.stem + (f.ver ? `_v${f.ver}` : '') + '.' + f.ext;
      }
      if (f.dupOf) ['year', 'month', 'author', 'secrecy', 'size', 'ext', 'doc', 'proj'].forEach((k) => (f[k] = f.dupOf[k]));
      return f;
    });
    const fileSpecs = r.shuffle(specs).map((f) => {
      const extra = { author: f.author, secrecy: f.secrecy, state: f.state, size: f.size };
      if (f.ver) extra.ver = f.ver;
      if (f.stale) extra.stale = f.stale;
      if (has('capacity')) extra.fits = f.fits;
      return [f.name, `${f.year}-${String(f.month).padStart(2, '0')}`, f.proj, f.doc, f.late ? '@late' : null, extra];
    });

    /* ── 条項を組む ── */
    const basePath = b ? [a.seg, b.seg] : [a.seg];
    const rules = ORDER.filter(has).map((k) => MECHS[k].rule(x)).concat([{ when: true, path: basePath }]);
    const constraints = [{ type: 'classify', rules }];
    mechs.forEach((k) => MECHS[k].more && constraints.push(...MECHS[k].more(x)));
    if (level >= 2) constraints.push({ type: 'noEmpty' });
    constraints.push({ type: 'rootClean' });

    /* ── 手紙を書く ── */
    const client = r.pick(T.clients);
    const job = r.pick(T.jobs);
    const opener = r.pick([
      `${job}で、ファイルがすっかり散らかってしまいました。`,
      `${job}にあわせて、手元のファイルを整えたいのです。`,
      `お世話になります。${job}の件でお願いがあります。`,
      `${T.trade}の者です。${job}で手が回らず、お力を借りたいのです。`,
      `急なお願いで恐縮です。${job}にともなって、ファイルを整理していただけますか。`,
      `${job}の時期になりました。今年もよろしくお願いします。`,
    ]) + SCENES[scene].say;
    const baseSay = b
      ? r.pick([
        `まず${a.word}ごとに分け、その中をさらに${b.word}ごとに分けてください。`,
        `大きくは${a.word}ごと、その中は${b.word}ごと、という二段の棚にしてください。`,
      ])
      : r.pick([
        `${a.word}ごとにフォルダを分けてください。フォルダの名前は、札に書いてあるとおりで結構です。`,
        `基本は${a.word}ごとです。札のとおりの名前でフォルダを作って、分けて入れてください。`,
      ]);
    const yearNote = [a, b].includes(AXIS.year) ? '年のフォルダは「2024年」のように「年」をつけてください。' : '';
    /* 手紙では、ふつうの分け方を先に述べ、そのあと「ただし」を優先の低いものから重ねていく */
    const sayOrder = ['exception', 'draft', 'cloud', 'cloudSize', 'capacity', 'archive', 'secret', 'vault', 'versions', 'trash',
      'backup', 'shortcut', 'fragile', 'mirror', 'reserve', 'opsCap', 'timer'];
    const says = sayOrder.filter(has).map((k) => MECHS[k].say && MECHS[k].say(x)).filter(Boolean);
    const closing = level >= 2 ? r.pick(['使わない空のフォルダは残さないでください。', '余計な空フォルダは片づけておいてください。']) : '';
    /* 段落ごとに改行で区切る（画面では段落として組まれる） */
    const letter = [opener + baseSay + yearNote, ...says, closing].filter(Boolean).join('\n');

    /* ── 難しさの物差し: 要素の数と、条項どうしの掛け合わせの数 ── */
    const combos = (rules.length * (rules.length - 1)) / 2 +
      (has('backup') && has('trash') ? 1 : 0) + (has('shortcut') && has('archive') ? 1 : 0) +
      (has('shortcut') && has('trash') ? 1 : 0) + (has('cloud') ? 1 : 0) + (has('reserve') ? 1 : 0);
    const full = 20 + 10 * mechs.length + 4 * combos + 4 * level;

    const marks = {};
    mechs.forEach((k) => MECHS[k].mark && (marks[MECHS[k].mark[0]] = MECHS[k].mark[1]));

    const lv = {
      id: `${kind}-${level}-${seed}`, generated: kind, level, chapter: 'gen',
      title: job, client, letter, trade: T.trade, scene, sceneLabel: SCENES[scene].label,
      reward: kind === 'c' ? Math.round(full * 0.3) : full,
      mechs, combos, files: fileSpecs, marks, constraints,
      features: { copy: has('backup'), link: has('shortcut') || has('mirror') },
      fragileLinks: has('fragile'), timed: has('timer'),
      lateNote: has('late') ? '追伸: すみません、あとから何件か見つかりました。机の上に足しておきます。決まりは同じでお願いします。' : null,
      teach: mechs.map((k) => ({ mech: k, side: MECHS[k].side, text: MECHS[k].teach })),
    };
    if (scene !== 'desk') applyScene(lv, scene, r);
    /* 手と理の重さ（1〜10）は、出来上がった依頼の中身から測る */
    Object.assign(lv, G.rate(lv, {
      hand: mechs.filter((k) => MECHS[k].side === 'hand').length,
      logic: mechs.filter((k) => MECHS[k].side === 'logic').length,
    }));
    return lv;
  }

  const cache = new Map();
  G.gen = {
    MAX_LEVEL, MECHS,
    make(level, seed, kind) {
      const id = `${kind}-${level}-${seed}`;
      if (!cache.has(id)) cache.set(id, make(level, seed, kind));
      return cache.get(id);
    },
    newId: (kind, level) => `${kind}-${level}-${Math.floor(Math.random() * 1e9)}`,
    /* 広告費。その格の報酬の下限（要素の数だけで決まる分）の三割。
       合格したときの報酬は、どんなに手際が悪くても満額の 0.9×0.7×0.6 ≒ 37.8% を下回らないので、
       合格すれば必ず広告費を上回る。格が高いほど高い */
    minReward: (level) => 20 + 10 * COUNT[level - 1] + 4 * level,
    adCost: (level) => Math.floor(0.3 * (20 + 10 * COUNT[level - 1] + 4 * level)),
    /* 合格したときに最低でも受け取れる額（広告の説明に使う） */
    adFloor: (level) => Math.round(0.378 * (20 + 10 * COUNT[level - 1] + 4 * level)),
    /* その格で初めて出会う要素 */
    freshAt: (level) => Object.keys(MECHS).filter((k) => MECHS[k].min === level).map((k) => MECHS[k].label),
  };

  /* id から依頼を引く（手づくりの依頼も、生成した依頼も） */
  G.levelById = function (id) {
    const hand = G.levels.find((l) => l.id === id);
    if (hand) return hand;
    const m = /^([wca])-(\d+)-(\d+)$/.exec(id || '');
    return m ? G.gen.make(Number(m[2]), Number(m[3]), m[1]) : null;
  };
})();
