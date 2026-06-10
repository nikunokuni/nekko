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

// ── カスタム戦法タグ ─────────────────────────────
const CUSTOM_TAGS_KEY = "nekko_custom_tags";

/** ユーザーが追加したカスタム戦法タグ一覧を返す */
export function getCustomTags() {
  try {
    const raw = localStorage.getItem(CUSTOM_TAGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/** カスタム戦法タグを追加する（重複は無視） */
export function addCustomTag(name) {
  try {
    const trimmed = name.trim();
    if (!trimmed) return;
    const tags = getCustomTags();
    if (!tags.includes(trimmed)) {
      tags.push(trimmed);
      localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(tags));
    }
  } catch {}
}
const toDateKey = (d) => d.toISOString().slice(0, 10);

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
  { id: "tree-1",   icon: "ti-seedling",      color: "#3B6D11", label: "はじめの一歩",     desc: "ツリーを1個作る",       check: (s) => s.treeCount  >= 1   },
  { id: "tree-5",   icon: "ti-plant-2",       color: "#3B6D11", label: "ねっこが広がる",   desc: "ツリーを5個作る",       check: (s) => s.treeCount  >= 5   },
  { id: "tree-15",  icon: "ti-trees",         color: "#3B6D11", label: "森の管理人",       desc: "ツリーを15個作る",      check: (s) => s.treeCount  >= 15  },
  { id: "node-10",  icon: "ti-git-branch",    color: "#1a5276", label: "分岐の探求者",     desc: "ノードを10個作る",      check: (s) => s.nodeCount  >= 10  },
  { id: "node-50",  icon: "ti-sitemap",       color: "#1a5276", label: "戦法マイスター",   desc: "ノードを50個作る",      check: (s) => s.nodeCount  >= 50  },
  { id: "node-150", icon: "ti-network",       color: "#1a5276", label: "棋譜の賢者",       desc: "ノードを150個作る",     check: (s) => s.nodeCount  >= 150 },
  { id: "login-3",  icon: "ti-flame",         color: "#854F0B", label: "三日坊主卒業",     desc: "3日連続でログイン",     check: (s) => s.streak     >= 3   },
  { id: "login-7",  icon: "ti-calendar-week", color: "#854F0B", label: "一週間の積み重ね", desc: "7日連続でログイン",     check: (s) => s.streak     >= 7   },
  { id: "login-30",   icon: "ti-trophy",        color: "#A93226", label: "継続は力なり",       desc: "30日連続でログイン",           check: (s) => s.streak        >= 30  },
  // ── アクション系バッジ ──
  { id: "published",  icon: "ti-world",         color: "#1a5276", label: "公開の勇気",         desc: "ツリーを公開する",             check: (s) => !!s.hasPublished },
  { id: "memo",       icon: "ti-notes",         color: "#854F0B", label: "メモの達人",         desc: "一言メモを記入する",           check: (s) => !!s.hasMemo      },
  { id: "approach",   icon: "ti-tag",           color: "#854F0B", label: "分析家",             desc: "ツリーにタグをつける",         check: (s) => !!s.hasTags      },
  { id: "copied",     icon: "ti-copy",          color: "#1a5276", label: "コレクター",         desc: "みんなのツリーをコピーする",   check: (s) => !!s.hasCopied    },
  { id: "liked",      icon: "ti-heart",         color: "#A93226", label: "応援団",             desc: "みんなのツリーにいいねする",   check: (s) => !!s.hasLiked     },
  { id: "tags",       icon: "ti-tags",          color: "#3B6D11", label: "タグ整理師",         desc: "新しい戦法タグを追加する",     check: (s) => !!s.hasCustomTag },
  { id: "kifu",       icon: "ti-video",         color: "#1a5276", label: "棋譜記録者",         desc: "盤面に棋譜を記録する",         check: (s) => !!s.hasKifu      },
  { id: "template",  icon: "ti-layout-grid",   color: "#854F0B", label: "型の継承者",         desc: "盤面のテンプレートを利用する", check: (s) => !!s.hasTemplate  },
];

export function getEarnedBadgeIds(stats) {
  return new Set(BADGE_DEFS.filter((b) => b.check(stats)).map((b) => b.id));
}
