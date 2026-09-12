// kifuPosition.js の純粋関数ユニットテスト（Nodeで直接実行）。
//   実行: node test-harness/kifuPosition.test.mjs
//
// 局面検索は **壊れても画面が落ちない** 種類の機能で、結果の並びが
// 静かに変わるだけになる。目でもE2Eでも見つけられないのは主に3つ。
//   ① 自分が後手だった棋譜への当て方（条件の反転）。座標だけ回して
//      駒の先後を入れ替え忘れると、黙って0件になる
//   ② 同じ棋譜から1件だけ出す畳み込み（崩れると一覧が同じ将棋で埋まる）
//   ③「空」と「見ない」の取り違え。緩くなる方向に壊れると件数が増えるだけで、
//      誰も間違いに気づけない
// ここはその3つを名指しで見張る。
import { INITIAL_BOARD } from "../src/data.js";
import { importKifuText } from "../src/kifuParser.js";
import {
  ANY_MARK, EMPTY_MARK, SQUARES,
  packBoards, plyCountOf, boardAt, codeOf, countMarks, flipQuery, compileQuery,
  findFirstMatch, searchPositions,
} from "../src/kifuPosition.js";

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  — " + detail : "")); }
}

// 空盤（すべて見ない）の条件を作る
const emptyQuery = () => Array.from({ length: 9 }, () => Array(9).fill(ANY_MARK));
// 盤の座標系：board[row][col]  row = 段-1  col = 9-筋
const at = (board, file, rank) => board[rank - 1][9 - file];
const put = (query, file, rank, mark) => { query[rank - 1][9 - file] = mark; return query; };

// ══════════════════════════════════════════════════
// 詰める / 戻す
// ══════════════════════════════════════════════════
{
  const packed = packBoards([{ board: INITIAL_BOARD }]);
  check("1局面は81文字", packed.length === SQUARES, `${packed.length}`);
  check("局面数を数えられる", plyCountOf(packed) === 1);
  check("詰めて戻すと元の盤面に戻る", eq(boardAt(packed, 0), INITIAL_BOARD));
  check("範囲の外は null", boardAt(packed, 1) === null);
}

// 成り駒は2文字（'+p'）なので、1マス1文字に詰めるには別の字が要る。
// 表に載せ忘れた駒があると、その駒がある局面だけ静かに一致しなくなる
{
  const pieces = ["p", "l", "n", "s", "g", "b", "r", "k",
    "+p", "+l", "+n", "+s", "+b", "+r"];
  const all = [...pieces, ...pieces.map((x) => (x.startsWith("+") ? "+" + x[1].toUpperCase() : x.toUpperCase()))];
  const codes = all.map(codeOf);
  check("駒の種類ぶん、すべて別の1文字になる",
    codes.every((c) => c.length === 1 && c !== "?") && new Set(codes).size === all.length,
    codes.join(""));
  // 先手と後手が同じ字になると、相手の駒が自分の駒として一致してしまう
  check("先手と後手は別の字", codeOf("p") !== codeOf("P") && codeOf("+r") !== codeOf("+R"));
  // 読めない駒を空マスにすると「そこには何も無かった」という事実を作ってしまう
  check("読めない駒は空マスにしない", codeOf("zz") !== codeOf(" "));

  const board = INITIAL_BOARD.map((r) => [...r]);
  board[4][4] = "+p";
  board[3][3] = "+R";
  check("成り駒も詰めて戻せる", eq(boardAt(packBoards([{ board }]), 0), board));
}

// ══════════════════════════════════════════════════
// 条件（見ない / 空 / 駒）
// ══════════════════════════════════════════════════
{
  const q = emptyQuery();
  check("見ないだけの条件は0マス指定", countMarks(q) === 0);
  put(q, 7, 7, "b");            // 7七角
  put(q, 8, 8, EMPTY_MARK);     // 8八は空
  check("指定したマスだけ数える", countMarks(q) === 2);

  const compiled = compileQuery(q);
  check("見ないマスは照合に載せない（比較の回数を増やさない）", compiled.length === 2);
  // ③ 空を「見ない」に落とすと条件が緩み、件数が増えるだけで誰も気づかない
  check("空は照合に載る（空マスの文字と比べる）",
    compiled.some(([, code]) => code === codeOf(" ")));
}

// ── 反転（自分が後手だった棋譜へ当てる形）──
{
  const q = put(emptyQuery(), 7, 7, "b");   // 自分の角が7七
  const f = flipQuery(q);
  // ① 座標だけ回して先後を入れ替え忘れる、が一番ありがちな壊れ方
  check("反転：180度回した位置へ移る", at(f, 3, 3) === "B", JSON.stringify(at(f, 3, 3)));
  check("反転：駒の先後も入れ替わる", at(f, 3, 3) === at(f, 3, 3).toUpperCase());
  check("反転：元の位置は見ないに戻る", at(f, 7, 7) === ANY_MARK);
  check("反転を2回かけると元に戻る", eq(flipQuery(f), q));

  const pq = put(emptyQuery(), 8, 8, "+r");
  check("反転：成り駒も先後が入れ替わる", at(flipQuery(pq), 2, 2) === "+R");

  // 「空」は駒ではないので先後の入れ替えをしない（'_' が壊れると条件が消える）
  const eq2 = put(emptyQuery(), 5, 5, EMPTY_MARK);
  check("反転：空はそのまま位置だけ移る", at(flipQuery(eq2), 5, 5) === EMPTY_MARK);
}

// ══════════════════════════════════════════════════
// 実際の棋譜で探す（四間飛車：5手目に6八飛）
// ══════════════════════════════════════════════════
const KIF_SHIKENBISHA = `手合割：平手
先手：にく
後手：たろう
手数----指手---------消費時間--
   1 ７六歩(77)   ( 0:01/00:00:01)
   2 ３四歩(33)   ( 0:01/00:00:01)
   3 ６六歩(67)   ( 0:01/00:00:02)
   4 ８四歩(83)   ( 0:01/00:00:02)
   5 ６八飛(28)   ( 0:01/00:00:03)
   6 ８五歩(84)   ( 0:01/00:00:03)
   7 ７七角(88)   ( 0:01/00:00:04)
   8 ５四歩(53)   ( 0:01/00:00:04)
まで8手で後手の勝ち
`;

const snapshots = importKifuText(KIF_SHIKENBISHA).snapshots;
const packed = packBoards(snapshots);
check("棋譜まるごと詰められる", plyCountOf(packed) === snapshots.length);

{
  // 6八の飛車だけを条件にする。5手目で初めて成立する
  const q = put(emptyQuery(), 6, 8, "r");
  check("最初に成立した手数を返す", findFirstMatch(packed, compileQuery(q)) === 5);

  // ② 一致は5手目以降ずっと続く。1局1件に畳めていないと、一覧が同じ将棋で埋まる
  let hits = 0;
  for (let ply = 0; ply < plyCountOf(packed); ply++) {
    if (findFirstMatch(packed, compileQuery(q), ply) === ply) hits++;
  }
  check("同じ条件は何手も続けて成立する（だから1局1件に畳む）", hits === 4, `${hits}`);

  // 初期局面は全棋譜で同じなので、既定では探さない（条件が緩いと全局が0手目で当たる）
  const initial = put(emptyQuery(), 5, 9, "k");   // 5九玉＝初形のまま
  check("既定では初期局面（0手目）を探さない", findFirstMatch(packed, compileQuery(initial)) !== 0);
  check("0手目から探すよう頼めば当たる", findFirstMatch(packed, compileQuery(initial), 0) === 0);
}

{
  // 「空」の条件：7七は初形では空きマス、7手目に角が入る
  const q = put(emptyQuery(), 7, 7, EMPTY_MARK);
  check("空の条件は、駒が無い局面に当たる", findFirstMatch(packed, compileQuery(q)) === 1);
  const q2 = put(emptyQuery(), 7, 7, "b");
  check("同じマスの駒の条件は、駒が来た手に当たる", findFirstMatch(packed, compileQuery(q2)) === 7);
  // 空と駒は同時に成立してはいけない（③の取り違えを正面から見る）
  check("空と駒が同じ手で両方成立することはない",
    findFirstMatch(packed, compileQuery(q)) !== findFirstMatch(packed, compileQuery(q2)));
}

// ══════════════════════════════════════════════════
// searchPositions（先後の使い分けがここの本体）
// ══════════════════════════════════════════════════
{
  // 同じ棋譜を、自分＝先手／自分＝後手として2件並べる。
  // 盤面（詰めた文字列）は同じで、違うのは mySide だけ
  const games = [
    { id: "sente", mySide: "sente", boardsPacked: packed },
    { id: "gote",  mySide: "gote",  boardsPacked: packed },
    { id: "unknown", mySide: null,  boardsPacked: packed },
  ];
  // 「自分の飛車が6八」＝先手から見た形。後手の棋譜には反転して当たるので、
  // 盤の上では4二の飛車を探すことになる（この棋譜には無い）
  const q = put(emptyQuery(), 6, 8, "r");
  const r = searchPositions({ games, query: q });
  check("自分が先手の棋譜だけに当たる", eq(r.results.map((x) => x.kifuId), ["sente"]),
    JSON.stringify(r.results));
  check("先後が未確定の棋譜は母数から外し、件数を返す", r.noSide === 1 && r.targets === 2);

  // ① 両方の条件を無差別に当てていると、ここで「自分が先手の棋譜」にも当たる。
  //    自分の飛車を探したのに相手の飛車が出てくる、という形の誤ヒット
  check("自分の駒の条件は、相手の駒には当たらない",
    !r.results.some((x) => x.kifuId === "gote"));

  // 自分が後手なら、相手（先手）の6八飛は自分視点では4二に見える。
  // この条件は「自分が後手の棋譜」だけに当たらなければならない
  const oppQ = put(emptyQuery(), 4, 2, "R");
  const r2 = searchPositions({ games, query: oppQ });
  check("相手の駒の条件は、自分が後手の棋譜に当たる",
    eq(r2.results.map((x) => x.kifuId), ["gote"]), JSON.stringify(r2.results));
  check("相手の駒の条件が当たるのも、その形になった手",
    r2.results[0]?.ply === 5, JSON.stringify(r2.results));

  // 持ち込んだ棋譜で自分が後手だったなら、同じ条件の当たり先が入れ替わる。
  // 盤はどちらの棋譜からでも絶対座標のまま持ち込むので、
  // 「どちら側から作った条件か」を渡さないと、当たる棋譜が丸ごとずれる
  const rg = searchPositions({ games, query: q, querySide: "gote" });
  check("後手側から作った条件は、自分が後手の棋譜にそのまま当たる",
    eq(rg.results.map((x) => x.kifuId), ["gote"]), JSON.stringify(rg.results));

  check("1つの棋譜からは1件だけ", new Set(r.results.map((x) => x.kifuId)).size === r.results.length);
  check("何も指定しなければ探さない", searchPositions({ games, query: emptyQuery() }).results.length === 0);
  check("詰めた盤面が無い棋譜は当たらない",
    searchPositions({ games: [{ id: "x", mySide: "sente", boardsPacked: "" }], query: q }).results.length === 0);
}

console.log(`\n=== ${pass}/${pass + fail} passed ===`);
if (fail > 0) process.exit(1);
