// ══════════════════════════════════════════════════
// rewards.js  ―  ご褒美機能（ログイン記録 / スタンプ定義）
//
//   ユーザー資産・実績（ログイン日数 / アクション達成 / 獲得バッジ /
//   カスタム戦法タグ / カスタムコメントタグ）は DB（profiles テーブル）を
//   真実源とし、端末変更やキャッシュ削除でも失われないようにする。
//   ログイン時に initUserState() で profiles からセッション内キャッシュへ
//   ハイドレートし、読み取りは同期的にキャッシュから、書き込みはキャッシュ
//   更新＋バックグラウンドで updateProfile 永続化する。
//
//   一方、既読フラグ（オンボーディング / 金曜トースト）は消えても再表示に
//   なるだけなので、従来どおり端末ローカル（localStorage）で管理する。
// ══════════════════════════════════════════════════
import { updateProfile } from "./db";

// ── セッション内キャッシュ（DBが真実源。ログイン時にハイドレート）──
let _userId = null;
let _state = {
  loginDays:    [], // "YYYY-MM-DD"[]（JST基準）
  actions:      {}, // { copied:true, liked:true, ... }
  earnedBadges: [], // バッジID[]
  customTags:   [], // { name, group }[]（戦法タグ）
  commentTags:  [], // { name, group }[]（コメントタグ）
  tsuikaVisibility: {}, // 「ついか」欄の表示設定。{ key:false } のときだけ非表示
  kifuPlayerNames: [],  // 棋譜での自分の対局者名（先手／後手のどちらが自分かの判定に使う）
};

// 旧localStorageキー（初回ログイン時にDBへ一度だけ移行してから掃除する）
const LEGACY_KEYS = {
  loginDays:    "nekko_login_log",
  actions:      "nekko_actions",
  earnedBadges: "nekko_earned_badges",
  customTags:   "nekko_custom_tags",
  commentTags:  "nekko_comment_tags",
};

function readLegacyJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// タグは旧形式（文字列配列）と新形式（{name,group}[]）が混在しうるので正規化する
function normTags(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => (typeof t === "string" ? { name: t, group: null } : t))
            .filter((t) => t && typeof t.name === "string" && t.name.trim());
}

// name 重複を避けて2つのタグ配列をマージする（既存を優先）
function mergeTags(base, extra) {
  const seen = new Set(base.map((t) => t.name));
  const out = [...base];
  for (const t of extra) {
    if (!seen.has(t.name)) { seen.add(t.name); out.push(t); }
  }
  return out;
}

// キャッシュの変更を DB（profiles）へ永続化する。未ログイン時は何もしない。
function persist(patch) {
  if (!_userId) return;
  updateProfile(_userId, patch).catch((e) => console.error("persist userState error:", e));
}

/**
 * ログイン時に profiles 行から内部キャッシュをハイドレートする。
 * 旧 localStorage データがあれば一度だけ DB へマージ移行してから掃除する。
 * @param {string} userId
 * @param {object|null} profileRow  getProfile の結果（新カラムを含む）
 */
export async function initUserState(userId, profileRow) {
  _userId = userId || null;
  _state = {
    loginDays:    Array.isArray(profileRow?.login_days) ? [...profileRow.login_days] : [],
    actions:      profileRow?.actions && typeof profileRow.actions === "object" ? { ...profileRow.actions } : {},
    earnedBadges: Array.isArray(profileRow?.earned_badges) ? [...profileRow.earned_badges] : [],
    customTags:   normTags(profileRow?.custom_strategy_tags),
    commentTags:  normTags(profileRow?.custom_comment_tags),
    tsuikaVisibility: profileRow?.tsuika_visibility && typeof profileRow.tsuika_visibility === "object"
      ? { ...profileRow.tsuika_visibility } : {},
    kifuPlayerNames: Array.isArray(profileRow?.kifu_player_names)
      ? profileRow.kifu_player_names.filter((n) => typeof n === "string" && n.trim()) : [],
  };
  // ハイドレート前に記録されたアクションを合流させる（下の _pendingActions 参照）
  if (Object.keys(_pendingActions).length > 0) {
    _state.actions = { ..._state.actions, ..._pendingActions };
    _pendingActions = {};
    persist({ actions: _state.actions });
  }
  await migrateLegacyLocalStorage();
}

/** ログアウト時にキャッシュを空にする（次のユーザーへ持ち越さない） */
export function resetUserState() {
  _userId = null;
  _pendingActions = {};
  _state = {
    loginDays: [], actions: {}, earnedBadges: [], customTags: [], commentTags: [],
    tsuikaVisibility: {}, kifuPlayerNames: [],
  };
}

// ── 棋譜での自分の対局者名 ───────────────────────────
// 棋譜の「先手：」「後手：」と照合して、どちらが自分かを自動判定するために使う。
// 将棋アプリごとにIDが違うので複数登録できる。

/** 登録済みの対局者名（配列） */
export function getKifuPlayerNames() {
  return [..._state.kifuPlayerNames];
}

/** 対局者名を保存する（空文字・重複は取り除く） */
export function setKifuPlayerNames(names) {
  const cleaned = [...new Set((names || []).map((n) => String(n).trim()).filter(Boolean))];
  _state.kifuPlayerNames = cleaned;
  persist({ kifu_player_names: cleaned });
  return cleaned;
}

/** 対局者名を1つ追加する（既に登録済みなら何もしない）。
 *  取り込み時に「この名前はあなたですか？」と確認した答えを覚えるために使う。
 *  一度覚えれば、以降その名前の棋譜は先後を自動判定できる。 */
export function addKifuPlayerName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed || _state.kifuPlayerNames.includes(trimmed)) return _state.kifuPlayerNames;
  return setKifuPlayerNames([..._state.kifuPlayerNames, trimmed]);
}

// ── 「ついか」欄の表示設定 ─────────────────────────
// { key:false } のときだけ非表示（既定＝全項目表示）。
// OFFにしても入力済みのデータは消えず、ONに戻せばそのまま再表示される。

/** その項目を表示するかどうか（未設定は表示） */
export function isTsuikaVisible(key) {
  return _state.tsuikaVisibility[key] !== false;
}

/** 項目の表示/非表示を切り替えて保存する */
export function setTsuikaVisible(key, visible) {
  _state.tsuikaVisibility = { ..._state.tsuikaVisibility, [key]: !!visible };
  persist({ tsuika_visibility: _state.tsuikaVisibility });
}

// 旧 localStorage のユーザー状態を DB へ一度だけ移行する。
// 成功（または移行不要）で旧キーを削除。DB書き込みに失敗したら次回リトライ。
async function migrateLegacyLocalStorage() {
  if (!_userId) return;
  const patch = {};

  const days = readLegacyJson(LEGACY_KEYS.loginDays);
  if (Array.isArray(days) && days.length) {
    const merged = [...new Set([..._state.loginDays, ...days])].sort();
    if (merged.length !== _state.loginDays.length) { _state.loginDays = merged; patch.login_days = merged; }
  }
  const acts = readLegacyJson(LEGACY_KEYS.actions);
  if (acts && typeof acts === "object") {
    const merged = { ...acts, ..._state.actions };
    if (Object.keys(merged).length !== Object.keys(_state.actions).length) { _state.actions = merged; patch.actions = merged; }
  }
  const badges = readLegacyJson(LEGACY_KEYS.earnedBadges);
  if (Array.isArray(badges) && badges.length) {
    const merged = [...new Set([..._state.earnedBadges, ...badges])];
    if (merged.length !== _state.earnedBadges.length) { _state.earnedBadges = merged; patch.earned_badges = merged; }
  }
  const ct = normTags(readLegacyJson(LEGACY_KEYS.customTags));
  if (ct.length) {
    const merged = mergeTags(_state.customTags, ct);
    if (merged.length !== _state.customTags.length) { _state.customTags = merged; patch.custom_strategy_tags = merged; }
  }
  const cmt = normTags(readLegacyJson(LEGACY_KEYS.commentTags));
  if (cmt.length) {
    const merged = mergeTags(_state.commentTags, cmt);
    if (merged.length !== _state.commentTags.length) { _state.commentTags = merged; patch.custom_comment_tags = merged; }
  }

  if (Object.keys(patch).length > 0) {
    try {
      const { error } = await updateProfile(_userId, patch);
      if (error) return; // 移行失敗。旧キーは残して次回リトライする
    } catch { return; }
  }
  // 移行成功（または移行不要）。旧キーを掃除して再移行を防ぐ
  for (const k of Object.values(LEGACY_KEYS)) {
    try { localStorage.removeItem(k); } catch {}
  }
}

// ハイドレート（initUserState）より前に記録されたアクションの控え。
//
// 「画面に入った瞬間」に記録する種類のトロフィー（棋譜の傾向・ノード検索）は、
// URL直打ちやリロードで開くと profiles が届く前に走ることがある。
// そのとき _userId がまだ無く、persist は黙って何もしない ――
// つまり**その回の達成が保存されず、リロードで消える**。
// 画面は何も変わらないので、バッジが取れないことでしか気づけない。
let _pendingActions = {};

/** 一回限りのアクション達成を記録する */
export function recordAction(key) {
  if (!key || _state.actions[key]) return;
  _state.actions = { ..._state.actions, [key]: true };
  // ハイドレート前なら控えに積む。initUserState が読み込んだ内容へ合流させる
  // （ここで persist しても _userId が無く、書き込みは捨てられる）
  if (!_userId) { _pendingActions[key] = true; return; }
  persist({ actions: _state.actions });
}

/** 記録済みアクション一覧を返す */
export function getActions() {
  return _state.actions;
}

// ── 獲得済みバッジ ────────────────────────────────
// 一度獲得したバッジは、その後に条件を満たさなくなっても（公開を取り消す・
// ツリーを削除する等）獲得済みのまま表示し続けるための記録（DB＝profiles）

/** 獲得済みとして記録されているバッジIDの配列を返す */
export function getEarnedBadges() {
  return _state.earnedBadges;
}

/** バッジIDの配列を獲得済みに追加する（既存分とマージして保存） */
export function recordEarnedBadges(ids) {
  const merged = [...new Set([..._state.earnedBadges, ...ids])];
  if (merged.length === _state.earnedBadges.length) return; // 新規なし
  _state.earnedBadges = merged;
  persist({ earned_badges: merged });
}

// ── 初回オンボーディング（使い方トースト）─────────
// 画面ごとに一度だけ使い方トーストを出すための既読管理（端末ローカル）
const ONBOARD_KEY = "nekko_onboard_seen";

/** その画面の使い方トーストをまだ表示していなければ true */
export function shouldShowOnboard(key) {
  try {
    const raw  = localStorage.getItem(ONBOARD_KEY);
    const seen = raw ? JSON.parse(raw) : {};
    return !seen[key];
  } catch { return false; }
}

/** その画面の使い方トーストを表示済みとして記録する */
export function markOnboardSeen(key) {
  try {
    const raw  = localStorage.getItem(ONBOARD_KEY);
    const seen = raw ? JSON.parse(raw) : {};
    if (!seen[key]) {
      seen[key] = true;
      localStorage.setItem(ONBOARD_KEY, JSON.stringify(seen));
    }
  } catch {}
}

/** 使い方トーストの既読をすべてリセットする（もう一度見る） */
export function resetOnboard() {
  try { localStorage.removeItem(ONBOARD_KEY); } catch {}
}

// ── カスタム戦法タグ（DB＝profiles を真実源にセッションキャッシュで扱う）──

/** ユーザーが追加したカスタム戦法タグを { name, group }[] 形式で返す */
export function getCustomTagsByGroup() {
  return _state.customTags;
}

/** カスタム戦法タグを追加する（重複は無視）。group を指定するとグループに紐付く */
export function addCustomTag(name, group = null) {
  const trimmed = (name || "").trim();
  if (!trimmed || _state.customTags.some((t) => t.name === trimmed)) return;
  _state.customTags = [..._state.customTags, { name: trimmed, group }];
  persist({ custom_strategy_tags: _state.customTags });
}

// ── コメント用カスタムタグ（同上）────────────────────

export function getCommentCustomTags() {
  return _state.commentTags;
}

export function addCommentCustomTag(name, group = null) {
  const trimmed = (name || "").trim();
  if (!trimmed || _state.commentTags.some((t) => t.name === trimmed)) return;
  _state.commentTags = [..._state.commentTags, { name: trimmed, group }];
  persist({ custom_comment_tags: _state.commentTags });
}

// 日本時間基準の日付キーを返す（UTC基準だと JST 朝9時に日付が切り替わってしまい、
// ログイン日数のカウントが実際の感覚とズレてしまうため JST に統一する）
const toDateKey = (d) => {
  const jst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, "0");
  const day = String(jst.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** 今日のログインを記録する（同日2回目以降は無視。DB＝profiles に永続化）*/
export function recordLogin() {
  const today = toDateKey(new Date());
  if (_state.loginDays.includes(today)) return;
  _state.loginDays = [..._state.loginDays, today].sort();
  persist({ login_days: _state.loginDays });
}

/** 累計ログイン日数 / 連続ログイン日数を取得する */
export function getLoginStats() {
  const daySet = new Set(_state.loginDays);
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = toDateKey(cursor);
    if (!daySet.has(key)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { totalDays: _state.loginDays.length, streak };
}

// ── スタンプ（バッジ）定義 ─────────────────────────
// check は { treeCount, nodeCount, totalDays, streak, kifuCount, doneCount,
//            maxDepth, has* } を受け取り達成判定する。
//
// トロフィーの目的は2つだけ。**続けて使ってもらうこと**と、
// **奥にある機能に気づいてもらうこと**。だから採る／採らないはこう決めている。
//
//   ・継続系 … 一度では終わらず、時間をかけないと増えない／減らせないもの。
//              段階を刻む（progress を持たせて、あと何回かが見えるようにする）
//   ・認知系 … 画面の奥にあって気づかれにくいもの。1回やれば達成でよく、
//              **desc がそのまま機能の紹介文になる**ように書く
//
// 逆に「入力欄を埋める」たぐいは入れない（志向・勝率・好き度・序盤の意識など）。
// 使わない項目は「ついか」の歯車で消せるようにしてあるので、
// 埋めることをご褒美にすると、消せる設計と正面から矛盾する。
export const BADGE_DEFS = [
  { id: "tree-1",   icon: "ti-seedling",      color: "#3B6D11", label: "はじめの一歩",     desc: "ツリーを1個作る",       check: (s) => s.treeCount  >= 1,   progress: (s) => ({ current: s.treeCount,  max: 1   }) },
  { id: "tree-5",   icon: "ti-plant-2",       color: "#3B6D11", label: "ねっこが広がる",   desc: "ツリーを5個作る",       check: (s) => s.treeCount  >= 5,   progress: (s) => ({ current: s.treeCount,  max: 5   }) },
  { id: "tree-15",  icon: "ti-trees",         color: "#3B6D11", label: "森の管理人",       desc: "ツリーを15個作る",      check: (s) => s.treeCount  >= 15,  progress: (s) => ({ current: s.treeCount,  max: 15  }) },
  { id: "node-10",  icon: "ti-git-branch",    color: "#1a5276", label: "分岐の探求者",     desc: "ノードを10個作る",      check: (s) => s.nodeCount  >= 10,  progress: (s) => ({ current: s.nodeCount,  max: 10  }) },
  { id: "node-50",  icon: "ti-sitemap",       color: "#1a5276", label: "戦法マイスター",   desc: "ノードを50個作る",      check: (s) => s.nodeCount  >= 50,  progress: (s) => ({ current: s.nodeCount,  max: 50  }) },
  { id: "node-150", icon: "ti-network",       color: "#1a5276", label: "棋譜の賢者",       desc: "ノードを150個作る",     check: (s) => s.nodeCount  >= 150, progress: (s) => ({ current: s.nodeCount,  max: 150 }) },
  { id: "login-3",  icon: "ti-flame",         color: "#854F0B", label: "三日坊主卒業",     desc: "3日連続でログイン",     check: (s) => s.streak     >= 3,   progress: (s) => ({ current: s.streak,     max: 3   }) },
  { id: "login-7",  icon: "ti-calendar-week", color: "#854F0B", label: "一週間の積み重ね", desc: "7日連続でログイン",     check: (s) => s.streak     >= 7,   progress: (s) => ({ current: s.streak,     max: 7   }) },
  { id: "login-30", icon: "ti-trophy",        color: "#A93226", label: "継続は力なり",     desc: "30日連続でログイン",    check: (s) => s.streak     >= 30,  progress: (s) => ({ current: s.streak,     max: 30  }) },
  // ── アクション系バッジ（進捗なし）──
  { id: "published", icon: "ti-world",        color: "#1a5276", label: "公開の勇気",       desc: "ツリーを公開する",             check: (s) => !!s.hasPublished },
  { id: "memo",      icon: "ti-notes",        color: "#854F0B", label: "メモの達人",       desc: "一言メモを記入する",           check: (s) => !!s.hasMemo      },
  { id: "approach",  icon: "ti-tag",          color: "#854F0B", label: "分析家",           desc: "ツリーにタグをつける（頻度4以上のノードの戦法のみ集計）", check: (s) => !!s.hasTags },
  { id: "copied",    icon: "ti-copy",         color: "#1a5276", label: "コレクター",       desc: "みんなのツリーをコピーする",   check: (s) => !!s.hasCopied    },
  { id: "liked",     icon: "ti-heart",        color: "#A93226", label: "応援団",           desc: "みんなのツリーにいいねする",   check: (s) => !!s.hasLiked     },
  { id: "tags",      icon: "ti-tags",         color: "#3B6D11", label: "タグ整理師",       desc: "新しい戦法タグを追加する",     check: (s) => !!s.hasCustomTag },
  { id: "kifu",      icon: "ti-video",        color: "#1a5276", label: "棋譜記録者",       desc: "盤面に棋譜を記録する",         check: (s) => !!s.hasKifu      },
  { id: "template",  icon: "ti-layout-grid",  color: "#854F0B", label: "型の継承者",       desc: "盤面のテンプレートを利用する", check: (s) => !!s.hasTemplate  },

  // ══ 継続系 ══════════════════════════════════════
  // 連続ログイン（streak）は1日休むとゼロに戻る。休んでも消えない軸が
  // 無いと、一度途切れた人には積み上げるものが何も残らない
  { id: "days-30",  icon: "ti-calendar-check", color: "#854F0B", label: "ひと月ぶん",     desc: "累計30日ログインする",  check: (s) => s.totalDays >= 30,  progress: (s) => ({ current: s.totalDays, max: 30  }) },
  { id: "days-100", icon: "ti-calendar-stats", color: "#854F0B", label: "百日の記録",     desc: "累計100日ログインする", check: (s) => s.totalDays >= 100, progress: (s) => ({ current: s.totalDays, max: 100 }) },
  { id: "days-365", icon: "ti-calendar-heart", color: "#A93226", label: "一年分のねっこ", desc: "累計365日ログインする", check: (s) => s.totalDays >= 365, progress: (s) => ({ current: s.totalDays, max: 365 }) },

  // 棋譜は実際に対局しないと増えない＝時間そのものが要る。
  // 300局は傾向分析が見る上限（ANALYSIS_GAME_LIMIT）と同じ数
  { id: "kifu-10",  icon: "ti-file-stack", color: "#1a5276", label: "棋譜の芽",     desc: "棋譜を10局ためる",  check: (s) => s.kifuCount >= 10,  progress: (s) => ({ current: s.kifuCount, max: 10  }) },
  { id: "kifu-50",  icon: "ti-books",      color: "#1a5276", label: "棋譜の蓄え",   desc: "棋譜を50局ためる",  check: (s) => s.kifuCount >= 50,  progress: (s) => ({ current: s.kifuCount, max: 50  }) },
  { id: "kifu-300", icon: "ti-database",   color: "#A93226", label: "傾向が見える", desc: "棋譜を300局ためる（傾向分析が見る上限）", check: (s) => s.kifuCount >= 300, progress: (s) => ({ current: s.kifuCount, max: 300 }) },

  // 「できた」と「次にやりたいこと」は、このアプリで唯一**減る／終わる**もの。
  // 増やすだけのバッジばかりだと、やりきったことが何にも表れない
  { id: "done-10",   icon: "ti-circle-check", color: "#3B6D11", label: "やりきった",         desc: "ステータスを「できた」にしたノードを10個", check: (s) => s.doneCount >= 10, progress: (s) => ({ current: s.doneCount, max: 10 }) },
  { id: "next-done", icon: "ti-flag-check",   color: "#3B6D11", label: "やりたいを片づける", desc: "「次にやりたいこと」を書いて、片づける",   check: (s) => !!s.hasNextDone },

  // 「ノード150個」は横に広げるだけでも取れる。掘った深さは別の軸。
  // ツリーを作った直後が1段なので、2段目から自分で掘った分になる
  { id: "depth-3", icon: "ti-stairs",   color: "#1a5276", label: "三段掘り", desc: "ルートから3段の分岐を作る", check: (s) => s.maxDepth >= 3, progress: (s) => ({ current: s.maxDepth, max: 3 }) },
  { id: "depth-5", icon: "ti-mountain", color: "#1a5276", label: "五段掘り", desc: "ルートから5段の分岐を作る", check: (s) => s.maxDepth >= 5, progress: (s) => ({ current: s.maxDepth, max: 5 }) },

  // ══ 認知系（1回やれば達成。desc が機能の紹介文）══════════
  { id: "kifu-import",  icon: "ti-file-import",      color: "#1a5276", label: "棋譜を取り込む",     desc: "KIF/CSAの棋譜ファイルを取り込む",         check: (s) => !!s.hasKifuImport  },
  { id: "insight",      icon: "ti-chart-histogram",  color: "#1a5276", label: "傾向を読む",         desc: "ためた棋譜から自分の傾向を見る",           check: (s) => !!s.hasInsight     },
  { id: "insight-drill",icon: "ti-zoom-scan",        color: "#1a5276", label: "実戦にあたる",       desc: "傾向の戦型から、その実戦の棋譜を開く",     check: (s) => !!s.hasInsightDrill},
  // 実戦の統計からツリーの枝を作る、このアプリだけの動線。
  // 説明文でも「実戦で当たった相手だけが出る」ことが分かるようにする
  { id: "branch-cand",  icon: "ti-git-fork",         color: "#A93226", label: "実戦から枝を作る",   desc: "実戦で当たった相手の候補から子ノードを作る", check: (s) => !!s.hasBranchCand },
  { id: "to-inbox",     icon: "ti-inbox",            color: "#854F0B", label: "あとで整理する",     desc: "棋譜から「とりあえず」へ送る",             check: (s) => !!s.hasToInbox     },
  { id: "kifu-range",   icon: "ti-scissors",         color: "#854F0B", label: "切り取って残す",     desc: "棋譜の一部を切り出して分岐にする",         check: (s) => !!s.hasKifuRange   },
  { id: "player-name",  icon: "ti-user-check",       color: "#854F0B", label: "先後おまかせ",       desc: "棋譜での自分の名前を登録する（先後を聞かれなくなる）", check: (s) => !!s.hasPlayerName },
  { id: "merge",        icon: "ti-arrow-merge",      color: "#1a5276", label: "合流させる",         desc: "別々の枝を1つの子ノードへ合流させる",       check: (s) => !!s.hasMerge       },
  { id: "summary-node", icon: "ti-folder",           color: "#3B6D11", label: "章立てする",         desc: "まとめノードで枝を束ねる",                 check: (s) => !!s.hasSummaryNode },
  { id: "recall",       icon: "ti-copy",             color: "#854F0B", label: "使い回す",           desc: "他のノードの中身を呼び出して写す",         check: (s) => !!s.hasRecall      },
  { id: "search",       icon: "ti-search",           color: "#3B6D11", label: "まとめて探す",       desc: "ノード検索で全ツリーからノードを探す",     check: (s) => !!s.hasSearch      },
  { id: "reparent",     icon: "ti-drag-drop",        color: "#3B6D11", label: "つなぎ替える",       desc: "マップでノードをドラッグして親を変える",   check: (s) => !!s.hasReparent    },
  { id: "inbox-sorted", icon: "ti-arrow-move-right", color: "#854F0B", label: "置き場から出す",     desc: "「とりあえず」のノードを別の枝へ移す",     check: (s) => !!s.hasInboxSorted },
];

