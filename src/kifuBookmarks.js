// ══════════════════════════════════════════════════
// kifuBookmarks.js  ―  棋譜の「しおり」（分岐にしたい手の印）
//
//   棋譜からツリーを作る作業は2段階になる。
//     ① 棋譜を通して見て、分岐にしたい手を全部見つける（読む作業）
//     ② 1つずつノードにまとめる（書く作業）
//   分けること自体は正しいが、①で見つけた場所が残らないと、
//   ②を始めるときにまた探すところからやり直しになる。しおりはその受け皿。
//
//   形は [{ ply, done }]。ply は手数（0 = 初期局面）、
//   done は「この手からノードを作った」印。
//
//   **ノードにしても消さずに done を立てるだけ**にしてある。
//   消すと「自分がどのあたりを分岐点だと思ったか」の記録がその場で失われる。
//   これは機械が数えられる事実（利用者が付けた印）なので、あとから
//   「何手目に分岐しがちか」を集計できる。
//
//   DBに入れる前に必ず normalize を通す（重複・順序・型を1か所で揃える）。
//   純粋関数なので test-harness からそのままテストできる。
// ══════════════════════════════════════════════════

/** 保存されている値を [{ ply, done }] の正しい形に揃える。
 *  手数の昇順・重複なし。数値でない ply は捨てる。
 *
 *  古い行・手で編集された行・将来の形が混ざりうる場所なので、
 *  読み込み側で必ず通す。ここで弾かないと、画面のあちこちで
 *  「たまに ply が文字列」のような形の崩れを個別に相手にすることになる。 */
export function normalizeBookmarks(raw) {
  if (!Array.isArray(raw)) return [];
  const byPly = new Map();
  for (const b of raw) {
    // 数字だけが入っている古い形（[12, 30]）も受け取る
    const ply = typeof b === "number" ? b : Number(b?.ply);
    if (!Number.isInteger(ply) || ply < 0) continue;
    const done = typeof b === "number" ? false : !!b?.done;
    // 同じ手が重複していたら、done が立っているほうを残す
    // （片方だけ消すと「ノードにしたのに未処理に見える」状態が残る）
    const prev = byPly.get(ply);
    byPly.set(ply, { ply, done: done || !!prev?.done });
  }
  return [...byPly.values()].sort((a, b) => a.ply - b.ply);
}

/** その手にしおりが付いているか */
export function hasBookmark(list, ply) {
  return normalizeBookmarks(list).some((b) => b.ply === ply);
}

/** しおりを付ける／外す。付いていれば外し、無ければ付ける。
 *  外すときは done も一緒に消える（＝押し間違いの取り消し）。 */
export function toggleBookmark(list, ply) {
  const norm = normalizeBookmarks(list);
  if (!Number.isInteger(ply) || ply < 0) return norm;
  return norm.some((b) => b.ply === ply)
    ? norm.filter((b) => b.ply !== ply)
    : normalizeBookmarks([...norm, { ply, done: false }]);
}

/** 「この手からノードを作った」印を立てる。
 *  しおりが付いていない手でも記録する ―― しおりを付けずに直接ノードを
 *  作ることもでき、そちらも「分岐点だと判断した」事実には違いないため。 */
export function markBookmarkDone(list, ply) {
  const norm = normalizeBookmarks(list);
  if (!Number.isInteger(ply) || ply < 0) return norm;
  return norm.some((b) => b.ply === ply)
    ? norm.map((b) => (b.ply === ply ? { ...b, done: true } : b))
    : normalizeBookmarks([...norm, { ply, done: true }]);
}

/** まだノードにしていないしおり（＝作業の残り） */
export function pendingBookmarks(list) {
  return normalizeBookmarks(list).filter((b) => !b.done);
}
