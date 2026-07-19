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
  };
  await migrateLegacyLocalStorage();
}

/** ログアウト時にキャッシュを空にする（次のユーザーへ持ち越さない） */
export function resetUserState() {
  _userId = null;
  _state = { loginDays: [], actions: {}, earnedBadges: [], customTags: [], commentTags: [] };
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

/** 一回限りのアクション達成を記録する */
export function recordAction(key) {
  if (!key || _state.actions[key]) return;
  _state.actions = { ..._state.actions, [key]: true };
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
// check は { treeCount, nodeCount, totalDays, streak } を受け取り達成判定する
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
];

