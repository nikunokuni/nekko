// ══════════════════════════════════════════════════
// kifuAnalyze.js  ―  棋譜1件の解析（パース＋特徴抽出のまとめ役）
//
//   kifuParser（テキスト→指し手・対局情報）と
//   kifuFeatures（盤面→特徴）をつないで、
//   DBの kifus 行に保存する形へ変換する。
//
//   分析画面はここで作った軽い値（result / my_side / features）だけを読み、
//   snapshots は読まない。1局の snapshots は数十KBあり、
//   100局を毎回取り直すと通信量が実用に耐えないため。
// ══════════════════════════════════════════════════
import { parseKifuMeta, isEvenGame } from "./kifuParser.js";
import { extractGameFeatures } from "./kifuFeatures.js";

// 比較用に対局者名を正規化する。
// 将棋サイトの表示名は「にく 三段」「にく(1500)」のように
// 段位やレートが付くことがあるため、括弧以降と空白を落として比べる。
function normalizeName(name) {
  return String(name || "")
    .replace(/[（(].*$/, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

/**
 * 対局者名から「自分がどちら側か」を判定する。
 * @param {Object} meta parseKifuMeta の結果
 * @param {string[]} playerNames 設定に登録した自分の対局者名（複数可）
 * @returns {"sente"|"gote"|null} 判定できなければ null（利用者が手で選ぶ）
 */
export function resolveMySide(meta, playerNames = []) {
  const mine = playerNames.map(normalizeName).filter(Boolean);
  if (mine.length === 0) return null;
  const sente = normalizeName(meta?.senteName);
  const gote  = normalizeName(meta?.goteName);
  const isSente = sente && mine.includes(sente);
  const isGote  = gote  && mine.includes(gote);
  // 両方一致（自分同士の対局・同名）は判定不能として扱う
  if (isSente && isGote) return null;
  if (isSente) return "sente";
  if (isGote)  return "gote";
  return null;
}

/**
 * 先手から見た結果と自分の側から、自分から見た勝敗を出す。
 * @returns {"win"|"lose"|"draw"|null}
 */
export function outcomeFor(result, mySide) {
  if (!result || !mySide) return null;
  if (result === "draw") return "draw";
  return result === mySide ? "win" : "lose";
}

/**
 * 棋譜1件を解析して、DBへ保存する形の値を返す。
 * @param {Object} p
 * @param {string} p.sourceText KIF/CSA 原文
 * @param {Array}  p.snapshots  盤面スナップショット配列
 * @param {string[]} p.playerNames 自分の対局者名
 * @returns {{senteName, goteName, handicap, result, mySide, playedAt, features, metaParsed}}
 */
export function analyzeKifu({ sourceText, snapshots, playerNames = [] }) {
  const meta   = parseKifuMeta(sourceText || "");
  const mySide = resolveMySide(meta, playerNames);
  // 特徴は「自分視点」で持つ。自分の側が分からないうちは計算できないので、
  // 側を手で設定したあとに再計算する（recomputeFeatures）。
  const features = mySide && isEvenGame(meta.handicap)
    ? extractGameFeatures(snapshots, mySide)
    : null;

  return {
    senteName: meta.senteName,
    goteName:  meta.goteName,
    handicap:  meta.handicap,
    result:    meta.result,
    playedAt:  meta.playedAt,
    mySide,
    features,
    metaParsed: true,
  };
}

/**
 * 自分の側を手で選び直したときに、特徴だけを計算し直す。
 * 駒落ちは初期配置も先後の扱いも平手と異なるため特徴を持たせない。
 */
export function recomputeFeatures({ snapshots, mySide, handicap }) {
  if (!mySide || !isEvenGame(handicap)) return null;
  return extractGameFeatures(snapshots, mySide);
}

/**
 * 分析画面が使う「1局分のレコード」へ変換する。
 * 勝敗・自分の側・特徴のどれかが欠けている棋譜は集計対象外（null を返す）。
 */
export function toAnalysisGame(kifu) {
  const outcome = outcomeFor(kifu.result, kifu.mySide);
  if (!outcome || !kifu.features) return null;
  return {
    id: kifu.id,
    name: kifu.name,
    side: kifu.mySide,
    outcome,
    playedAt: kifu.playedAt,
    features: kifu.features,
  };
}
