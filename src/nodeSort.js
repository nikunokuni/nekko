// ══════════════════════════════════════════════════
// nodeSort.js  ―  ノード一覧の並べ替え（ノード検索 / 呼び出しで共用）
//
//   同じ「自分の全ノードを並べる」画面が2つある（ノード検索と、
//   ノード編集画面の「呼び出し」）。別々に並べ替えを書くと、
//   同じ「頻度順」でも未設定の扱いが違う、といったズレが静かに生まれる。
//   ―― 子ノードの並び順を treeOps の orderedChildIds に一本化してあるのと同じ理由。
//
//   受け取るのは fetchAllMyNodes が返す**行**（snake_case）。
//   組み立て済みのノードではないので、列名で直接読む。
// ══════════════════════════════════════════════════

// 並べ替えの選択肢。「新しい順」は取得順（created_at 降順）そのままなので
// column を持たない
export const NODE_SORTS = [
  { key: "recent",     label: "新しい順" },
  { key: "winRate",    label: "勝率順",   icon: "ti-trophy", column: "win_rate" },
  { key: "likeLevel",  label: "好き度順", icon: "ti-heart",  column: "like_level" },
  { key: "usageLevel", label: "頻度順",   icon: "ti-flame",  column: "usage_level" },
];

/** 行の配列を並べ替えて**新しい配列**で返す（元の配列は触らない）。
 *
 *  未設定（null / 列そのものが無い）を必ず数値に置き換えてから引き算する。
 *  そのままだと `undefined - 5` が NaN になり、比較関数が
 *  「どちらが先とも言えない」を返す＝並びが不定になる（実際、未設定の行が
 *  先頭に来る）。落ちないので、順番が変わったことにしか気づけない。
 *  置き換え先を -Infinity にしているのは、未設定を必ず末尾へ送るため。 */
export function sortNodeRows(rows = [], sortKey = "recent") {
  const def = NODE_SORTS.find((s) => s.key === sortKey);
  if (!def || !def.column) return rows;          // 新しい順＝取得順のまま
  const val = (r) => {
    const v = r[def.column];
    return v == null ? -Infinity : v;
  };
  return [...rows].sort((a, b) => val(b) - val(a));
}
