// ══════════════════════════════════════════════════════════════════
// screens/kifu/shared.js  ―  棋譜まわりの画面で共用する小さな表示ヘルパー
//   棋譜ライブラリ（一覧・取り込み・再生）の各ファイルから引く。
//   ここに置くのは「見せ方」だけ。判定や集計は kifu*.js 側の役目。
// ══════════════════════════════════════════════════════════════════
import { T } from "../../theme";
import { outcomeFor } from "../../kifuAnalyze";

// 対局結果を「自分から見た」日本語にする。
// 自分の側が分からない棋譜は先手／後手のどちらが勝ったかだけを示す。
export function outcomeLabel(kifu) {
  const o = outcomeFor(kifu.result, kifu.mySide);
  if (o === "win")  return { text: "勝ち",   color: T.green };
  if (o === "lose") return { text: "負け",   color: T.red };
  if (o === "draw") return { text: "引き分け", color: T.grayText };
  if (kifu.result === "sente") return { text: "先手の勝ち", color: T.grayText };
  if (kifu.result === "gote")  return { text: "後手の勝ち", color: T.grayText };
  return null;
}
