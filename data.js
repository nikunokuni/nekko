// ══════════════════════════════════════════════════
// data.js  ―  ねっこ  定数 / メタ / サンプルデータ
// ══════════════════════════════════════════════════

// ── 将棋の駒ラベル ───────────────────────────────
export const PIECE_LABEL = {
  k:'玉', r:'飛', b:'角', g:'金', s:'銀', n:'桂', l:'香', p:'歩',
  K:'王', R:'龍', B:'馬', G:'金', S:'全', N:'圭', L:'杏', P:'と',
};

// ── 初期盤面（平手）──────────────────────────────
export const INITIAL_BOARD = [
  ['l','n','s','g','k','g','s','n','l'],
  [' ','r',' ',' ',' ',' ',' ','b',' '],
  ['p','p','p','p','p','p','p','p','p'],
  [' ',' ',' ',' ',' ',' ',' ',' ',' '],
  [' ',' ',' ',' ',' ',' ',' ',' ',' '],
  [' ',' ',' ',' ',' ',' ',' ',' ',' '],
  ['P','P','P','P','P','P','P','P','P'],
  [' ','B',' ',' ',' ',' ',' ','R',' '],
  ['L','N','S','G','K','G','S','N','L'],
];

// 超速の典型局面（親ノードのデモ用）
export const CHOUSO_BOARD = [
  ['l','n','s','g','k','g','s','n','l'],
  [' ','r',' ',' ',' ',' ',' ','b',' '],
  ['p','p','p','p','p','p',' ','p','p'],
  [' ',' ',' ',' ',' ',' ','p',' ',' '],
  [' ',' ',' ',' ',' ',' ',' ',' ',' '],
  [' ',' ','P',' ','S',' ',' ',' ',' '],
  ['P','P',' ','P','P','P','P','P','P'],
  [' ','B',' ',' ',' ',' ',' ','R',' '],
  ['L','N','S','G','K','G',' ','N','L'],
];

// ── ノードID採番（フロントのみ。DB保存時はUUIDが上書きされる）──
let _id = 100;
export const newId = () => String(++_id);

// ── ステータス表示メタ ────────────────────────────
export const STATUS_META = {
  done: { label:'完成',  bg:'#EAF3DE', color:'#3B6D11', dot:'#3B6D11' },
  wip:  { label:'研究中', bg:'#FAEEDA', color:'#854F0B', dot:'#854F0B' },
  todo: { label:'未定',  bg:'transparent', color:'#5F5E5A', dot:'#B4B2A9', dashed:true },
};

// ── アプローチ表示メタ ────────────────────────────
export const APPROACH_META = {
  '相手の戦法': { bg:'#fadbd8', color:'#7B3010' },
  '自分の志向': { bg:'#d6eaf8', color:'#1a5276' },
  '局面の状況': { bg:'#FAEEDA', color:'#854F0B' },
  '自分の選択': { bg:'#d6eaf8', color:'#1a5276' },
};

// ── ノード追加ウィザードのサジェスト候補 ─────────
export const SUGGESTIONS = {
  '相手の戦法': ['▲４六銀型超速','持久戦系居飛車','▲３七銀戦法','急戦棒銀','角道オープン型','左美濃急戦'],
  '自分の志向': ['受け志向（銀引き型）','攻め志向（▲５五歩型）','バランス型（金上がり）','速攻志向'],
  '局面の状況': ['銀が間に合った場合','銀が間に合わなかった場合','穴熊に組まれた場合','早仕掛けを受けた場合','飛車交換になった場合'],
};

// ── ローカル動作確認用サンプルツリー ─────────────
// Supabase 接続時は DB のデータが使われるため、実装では参照しない。
export const SAMPLE_TREES = [
  {
    id: 't1',
    name: '中飛車',
    active: true,
    public: false,
    tags: ['振り飛車','中飛車'],
    likedBy: 0,
    nodes: {
      root: {
        id: 'root', label: '中飛車', status: 'done',
        isRoot: true, parentId: null,
        board: null, memo: '振り飛車の軸となる戦法。5筋の制圧が最大のテーマ。',
        stamps: [], childIds: ['n1','n2'],
      },
      n1: {
        id: 'n1', label: '対居飛車', status: 'wip',
        approachType: '自分の選択', parentId: 'root',
        board: null, memo: '', stamps: [], childIds: ['n3','n4','n5'],
      },
      n2: {
        id: 'n2', label: '対振り飛車', status: 'wip',
        approachType: '自分の選択', parentId: 'root',
        board: null, memo: '', stamps: [], childIds: ['n8','n9'],
      },
      n3: {
        id: 'n3', label: '超速', status: 'done',
        approachType: '相手の戦法', parentId: 'n1',
        board: CHOUSO_BOARD,
        memo: '超速▲４六銀型に対しては△３二飛と回るのが有力。',
        stamps: [{ row:5, col:4, type:'hoshi' }],
        childIds: ['n6','n7'],
      },
      n4: {
        id: 'n4', label: '持久戦', status: 'wip',
        approachType: '相手の戦法', parentId: 'n1',
        board: null, memo: '研究中。角交換型と穴熊対策が主な課題。',
        stamps: [], childIds: ['n10','n11'],
      },
      n5: {
        id: 'n5', label: '急戦', status: 'todo',
        approachType: '相手の戦法', parentId: 'n1',
        board: null, memo: '', stamps: [], childIds: [],
      },
      n6: {
        id: 'n6', label: '銀対抗', status: 'done',
        approachType: '自分の志向', parentId: 'n3',
        board: null, memo: '受け志向。▲４六銀△３二飛型で安定。',
        stamps: [], childIds: [],
      },
      n7: {
        id: 'n7', label: '▲５五歩型', status: 'todo',
        approachType: '自分の志向', parentId: 'n3',
        board: null, memo: '', stamps: [], childIds: [],
      },
      n8: {
        id: 'n8', label: '三間飛車', status: 'done',
        approachType: '相手の戦法', parentId: 'n2',
        board: null, memo: '▲６八銀型で対抗。', stamps: [], childIds: ['n12'],
      },
      n9: {
        id: 'n9', label: '四間飛車', status: 'todo',
        approachType: '相手の戦法', parentId: 'n2',
        board: null, memo: '', stamps: [], childIds: [],
      },
      n10: {
        id: 'n10', label: '角交換型', status: 'done',
        approachType: '局面の状況', parentId: 'n4',
        board: null, memo: '角道を開けて対抗。', stamps: [], childIds: ['n13'],
      },
      n11: {
        id: 'n11', label: '穴熊対策', status: 'done',
        approachType: '局面の状況', parentId: 'n4',
        board: null, memo: '', stamps: [], childIds: ['n12'], mergeTargetId: 'n12',
      },
      n12: {
        id: 'n12', label: '三間穴熊', status: 'done',
        approachType: '局面の状況', parentId: 'n8',
        board: null, memo: '複数のルートから合流する局面。',
        stamps: [], childIds: [], isMergeTarget: true,
      },
      n13: {
        id: 'n13', label: '角交換振り飛車対策', status: 'done',
        approachType: '相手の戦法', parentId: 'n10',
        board: null, memo: '', stamps: [], childIds: [],
      },
    },
  },
];
