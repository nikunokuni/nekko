// ══════════════════════════════════════════════════
// rewards.js  ―  ご褒美機能（ログイン記録 / スタンプ定義）
//   ログイン日数は端末ローカル（localStorage）で管理する
// ══════════════════════════════════════════════════

const STORAGE_KEY = "nekko_login_log";
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
  { id: "login-30", icon: "ti-trophy",        color: "#A93226", label: "継続は力なり",     desc: "30日連続でログイン",    check: (s) => s.streak     >= 30  },
];

export function getEarnedBadgeIds(stats) {
  return new Set(BADGE_DEFS.filter((b) => b.check(stats)).map((b) => b.id));
}
