// ══════════════════════════════════════════════════
// rewards.js  ―  ご褒美機能（ログイン記録 / スタンプ定義）
//   ログイン日数は端末ローカル（localStorage）で管理する
// ══════════════════════════════════════════════════

const STORAGE_KEY = "nekko_login_log";
const ACTIONS_KEY = "nekko_actions";

/** 一回限りのアクション達成を記録する */
export function recordAction(key) {
  try {
    const raw     = localStorage.getItem(ACTIONS_KEY);
    const actions = raw ? JSON.parse(raw) : {};
    if (!actions[key]) {
      actions[key] = true;
      localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions));
    }
  } catch {}
}

/** 記録済みアクション一覧を返す */
export function getActions() {
  try {
    const raw = localStorage.getItem(ACTIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
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

// ── カスタム戦法タグ ─────────────────────────────
const CUSTOM_TAGS_KEY = "nekko_custom_tags";

/**
 * ストレージから生データを返す。
 * 旧形式（文字列配列）は { name, group: null }[] に変換して返す。
 */
function loadRawCustomTags() {
  try {
    const raw = localStorage.getItem(CUSTOM_TAGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((item) =>
      typeof item === "string" ? { name: item, group: null } : item
    );
  } catch { return []; }
}

/** ユーザーが追加したカスタム戦法タグ名一覧を返す（後方互換：文字列配列） */
export function getCustomTags() {
  return loadRawCustomTags().map((t) => t.name);
}

/** ユーザーが追加したカスタム戦法タグを { name, group }[] 形式で返す */
export function getCustomTagsByGroup() {
  return loadRawCustomTags();
}

/** カスタム戦法タグを追加する（重複は無視）。group を指定するとグループに紐付く */
export function addCustomTag(name, group = null) {
  try {
    const trimmed = name.trim();
    if (!trimmed) return;
    const tags = loadRawCustomTags();
    if (!tags.some((t) => t.name === trimmed)) {
      tags.push({ name: trimmed, group });
      localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(tags));
    }
  } catch {}
}
// ── コメント用カスタムタグ ────────────────────────
const COMMENT_TAGS_KEY = "nekko_comment_tags";

export function getCommentCustomTags() {
  try {
    const raw = localStorage.getItem(COMMENT_TAGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((item) =>
      typeof item === "string" ? { name: item, group: null } : item
    );
  } catch { return []; }
}

export function addCommentCustomTag(name, group = null) {
  try {
    const trimmed = name.trim();
    if (!trimmed) return;
    const tags = getCommentCustomTags();
    if (!tags.some((t) => t.name === trimmed)) {
      tags.push({ name: trimmed, group });
      localStorage.setItem(COMMENT_TAGS_KEY, JSON.stringify(tags));
    }
  } catch {}
}

// ── 金曜夜トースト ────────────────────────────────
const FRIDAY_TOAST_KEY = "nekko_friday_toast_week";

/** ISO週番号（例: "2025-W23"）を返す */
function isoWeekKey(d) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const year = tmp.getUTCFullYear();
  const week = Math.ceil(((tmp - new Date(Date.UTC(year, 0, 1))) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * 今がトースト表示タイミングかどうかを返す。
 * 条件: 金曜日（日本時間）かつ 18:00 以降、かつ今週まだ未表示。
 */
export function shouldShowFridayToast() {
  try {
    const now  = new Date();
    const jst  = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    if (jst.getDay() !== 5) return false;        // 金曜以外は不要
    if (jst.getHours() < 18) return false;       // 18時前は不要
    const week = isoWeekKey(jst);
    return localStorage.getItem(FRIDAY_TOAST_KEY) !== week;
  } catch { return false; }
}

/** 今週の金曜トーストを表示済みとしてマークする */
export function markFridayToastShown() {
  try {
    const jst  = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    localStorage.setItem(FRIDAY_TOAST_KEY, isoWeekKey(jst));
  } catch {}
}

// 日本時間基準の日付キーを返す（UTC基準だと JST 朝9時に日付が切り替わってしまい、
// 金曜トースト判定（JST基準）とログイン日数判定の基準がズレてしまうため統一する）
const toDateKey = (d) => {
  const jst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, "0");
  const day = String(jst.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** 今日のログインを記録する（同日2回目以降は無視） */
export function recordLogin() {
  try {
    const raw  = localStorage.getItem(STORAGE_KEY);
    const days = raw ? JSON.parse(raw) : [];
    const today = toDateKey(new Date());
    if (!days.includes(today)) {
      days.push(today);
      days.sort();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(days));
    }
  } catch {
    // localStorage が使えない環境では何もしない
  }
}

/** 累計ログイン日数 / 連続ログイン日数を取得する */
export function getLoginStats() {
  let days = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    days = raw ? JSON.parse(raw) : [];
  } catch {
    days = [];
  }

  const daySet = new Set(days);
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = toDateKey(cursor);
    if (!daySet.has(key)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { totalDays: days.length, streak };
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
  { id: "approach",  icon: "ti-tag",          color: "#854F0B", label: "分析家",           desc: "ツリーにタグをつける",         check: (s) => !!s.hasTags      },
  { id: "copied",    icon: "ti-copy",         color: "#1a5276", label: "コレクター",       desc: "みんなのツリーをコピーする",   check: (s) => !!s.hasCopied    },
  { id: "liked",     icon: "ti-heart",        color: "#A93226", label: "応援団",           desc: "みんなのツリーにいいねする",   check: (s) => !!s.hasLiked     },
  { id: "tags",      icon: "ti-tags",         color: "#3B6D11", label: "タグ整理師",       desc: "新しい戦法タグを追加する",     check: (s) => !!s.hasCustomTag },
  { id: "kifu",      icon: "ti-video",        color: "#1a5276", label: "棋譜記録者",       desc: "盤面に棋譜を記録する",         check: (s) => !!s.hasKifu      },
  { id: "template",  icon: "ti-layout-grid",  color: "#854F0B", label: "型の継承者",       desc: "盤面のテンプレートを利用する", check: (s) => !!s.hasTemplate  },
];

