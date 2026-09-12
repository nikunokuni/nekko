// ══════════════════════════════════════════════════════════════════
// screens/kifu/PositionSearchModal.jsx  ―  局面から棋譜を探す
//
//   棋譜プレビューで見ている局面を持ち込み、いらない駒を消していくと、
//   残した駒だけが一致する局面を、ためた棋譜の中から探す。
//   結果は「どの棋譜の何手目か」の一覧で、押すとその手数から再生が開く。
//   しおりはそこで既存の機能から付ける（ここでは付けない）。
//
//   ── なぜ「消していく」入力なのか ──
//   空の盤に駒を並べさせると、スマホでは8枚置くだけで続かなくなる。
//   見ていた局面から消すだけなら、操作はタップ1種類で済む。
//   そのおかげで盤も専用の軽いものでよく、ShogiBoard（1290行）を触らずに済む。
//
//   ── マスは3つの状態を回る ──
//     駒 → 見ない → 空 → 駒 …
//   「見ない」と「空」は見た目で区別が付かないと必ず事故るので、
//   空には印を描き、下に凡例を置く。既定は「見ない」で、消すほど条件が緩む
//   （＝ヒットが増える）向きにしてある。逆にすると、持ち込んだ瞬間に
//   自分1局しか当たらず、消しても増えない状態から始まることになる。
// ══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from "react";
import { T, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE } from "../../theme";
import { PIECE_LABEL, PROMOTED_LABEL } from "../../data";
import { SectionLabel } from "../../components/uiParts";
import { MiniBoard } from "../../components";
import { showToast } from "../../toast";
import {
  fetchKifusForPositionSearch, fetchKifuSnapshotsMany, updateKifu, kifuRowToKifu,
} from "../../db";
import {
  ANY_MARK, EMPTY_MARK, boardAt, countMarks, isMyPiece, packBoards, searchPositions,
} from "../../kifuPosition";
import { outcomeLabel } from "./shared";

// 一覧は20件ずつ。ミニ盤面は1枚で最大40要素あるので、全部並べるとDOMが膨らむ
const PAGE_SIZE = 20;
// 詰めた盤面を後から埋めるときのバッチ幅。snapshots は重いので一度に取らない
const PACK_BATCH = 10;

const RANK_KANJI = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
// 盤の座標系（board[row][col]  row = 段-1  col = 9-筋）→ 「7七」のような呼び名。
// 読み上げとE2Eから1マスずつ指せるようにするため、すべてのマスに名前を付ける
const squareName = (row, col) => `${9 - col}${RANK_KANJI[row]}`;

const pieceLabel = (cell) =>
  cell.startsWith("+") ? (PROMOTED_LABEL[cell.slice(1).toLowerCase()] ?? cell)
    : (PIECE_LABEL[cell] ?? cell);

// マスの状態の呼び名（ボタンの名前に入れる）。
// 盤は持ち込んだ棋譜の向きのままなので、小文字＝自分とは限らない（querySide で決まる）
function markName(mark, side) {
  if (mark === ANY_MARK)   return "見ない";
  if (mark === EMPTY_MARK) return "空";
  return `${isMyPiece(mark, side) ? "自分の" : "相手の"}${pieceLabel(mark)}`;
}

// ──────────────────────────────────────────
// QueryBoard: 条件を入力する盤（読み取り専用の MiniBoard とは別物）
// ──────────────────────────────────────────
//   MiniBoard を使い回さないのは、ここだけがマスを押せて、かつ盤には無い
//   「空」という印を描くため。条件盤は board と同じ形をしているが別物なので、
//   描き方も分けておく（混ぜると、うっかり盤として渡す道ができる）。
function QueryBoard({ query, side, onToggle }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(9, 1fr)",
      width: "100%", maxWidth: 306, margin: "0 auto",
      background: "#f3ddab", border: "1px solid rgba(90,60,20,0.5)",
      borderRadius: 3, overflow: "hidden",
    }}>
      {query.map((row, r) => row.map((mark, c) => {
        const isAny   = mark === ANY_MARK;
        const isEmpty = mark === EMPTY_MARK;
        const gote    = !isAny && !isEmpty && /^\+?[A-Z]$/.test(mark);
        return (
          <button
            key={`${r}-${c}`}
            onClick={() => onToggle(r, c)}
            aria-label={`${squareName(r, c)} ${markName(mark, side)}`}
            style={{
              aspectRatio: "1 / 1", width: "100%", padding: 0,
              border: "0.5px solid rgba(90,60,20,0.3)",
              // 見ないマスだけ盤の色を落とす。指定が残っているマスが浮き上がって、
              // 「いま何を条件にしているか」が盤を見ただけで分かる。
              // ここを薄くしすぎると、駒を消したのかどうかが分からなくなる
              // （空きマスと「見ない」は、どちらも駒が無いので見分けが付かない）
              background: isAny ? "rgba(26,15,0,0.13)" : "transparent",
              cursor: "pointer", lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: T.fontSerif, color: isEmpty ? T.brown : T.ink,
              fontSize: isEmpty ? "0.75rem" : "0.8125rem",
              transform: gote ? "rotate(180deg)" : "none",
            }}
          >
            {isAny ? "" : isEmpty ? "×" : pieceLabel(mark)}
          </button>
        );
      }))}
    </div>
  );
}

// ──────────────────────────────────────────
// PositionSearchModal
// ──────────────────────────────────────────
// startBoard … 持ち込んだ局面（9×9）。ここから駒を消して条件を作る
// startSide  … 持ち込んだ棋譜で自分がどちらだったか。盤は向きを変えずに出すので、
//   「自分の駒はどちらか」と「反対側の棋譜へどう当てるか」はこの値で決まる
// onOpenKifu … (kifuId, ply) => void  一覧の1件を押したときの遷移（再生を開く）
export function PositionSearchModal({ userId, startBoard, startSide = "sente", onClose, onOpenKifu }) {
  // 探す対象の棋譜（詰めた盤面つき）。null = まだ読んでいない
  const [games,     setGames]     = useState(null);
  const [loadError, setLoadError] = useState(false);
  // 詰めた盤面をこれから埋める棋譜がある間の進み具合（{ done, total }）
  const [packing,   setPacking]   = useState(null);

  const [query, setQuery] = useState(() =>
    (startBoard || []).map((row) => row.map((cell) => (cell && cell !== " " ? cell : ANY_MARK)))
  );
  // 検索した結果と、そのときの条件で見つかった件数。null = まだ探していない
  const [found, setFound] = useState(null);
  const [page,  setPage]  = useState(0);
  // 条件を変えたのに探し直していない状態。古い一覧を見て判断しないよう出す
  const [dirty, setDirty] = useState(false);

  // ── 読み込み ──
  // 棋譜の軽い列＋詰めた盤面をまとめて読む。詰めた盤面がまだ無い棋譜
  // （この機能より前に取り込んだもの）は、ここで snapshots から作って保存する。
  // 一度やれば次からは要らない
  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(false);
    setGames(null);
    const { data, error } = await fetchKifusForPositionSearch(userId);
    if (error) {
      setLoadError(true);
      showToast("棋譜の読み込みに失敗しました。通信環境を確認してください。",
        { action: { label: "もう一度読む", onClick: load } });
      return;
    }
    let list = (data || []).map(kifuRowToKifu);

    const needPack = list.filter((k) => !k.boardsPacked && k.moveCount > 0);
    if (needPack.length > 0) {
      setPacking({ done: 0, total: needPack.length });
      const packed = new Map();
      for (let i = 0; i < needPack.length; i += PACK_BATCH) {
        const chunk = needPack.slice(i, i + PACK_BATCH);
        const snapshots = await fetchKifuSnapshotsMany(chunk.map((k) => k.id));
        for (const k of chunk) {
          const text = packBoards(snapshots.get(k.id) || []);
          if (!text) continue;
          const { error: saveError } = await updateKifu(k.id, { boardsPacked: text });
          // 保存できなくても、この回の検索では使える（次に開いたときにまた作る）
          if (saveError) console.error("boards_packed の保存に失敗:", saveError);
          packed.set(k.id, text);
        }
        setPacking({ done: Math.min(i + chunk.length, needPack.length), total: needPack.length });
      }
      list = list.map((k) => (packed.has(k.id) ? { ...k, boardsPacked: packed.get(k.id) } : k));
      setPacking(null);
    }
    setGames(list);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  // ── 条件の操作 ──
  const toggleSquare = (row, col) => {
    setDirty(true);
    setQuery((prev) => {
      const next = prev.map((r) => [...r]);
      const cur  = next[row][col];
      const base = startBoard?.[row]?.[col];
      const hasPiece = base && base !== " ";
      next[row][col] =
        cur !== ANY_MARK && cur !== EMPTY_MARK ? ANY_MARK       // 駒 → 見ない
        : cur === ANY_MARK                    ? EMPTY_MARK     // 見ない → 空
        : hasPiece                            ? base           // 空 → 元の駒に戻る
        : ANY_MARK;                                            // 元が空きマスなら駒に戻れない
      return next;
    });
  };
  const resetQuery = () => {
    setDirty(true);
    setQuery((startBoard || []).map((row) => row.map((c) => (c && c !== " " ? c : ANY_MARK))));
  };

  const marks = useMemo(() => countMarks(query), [query]);

  const runSearch = () => {
    setFound(searchPositions({ games: games || [], query, querySide: startSide }));
    setPage(0);
    setDirty(false);
  };

  const byId = useMemo(() => new Map((games || []).map((g) => [g.id, g])), [games]);
  const pageItems = found ? found.results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];
  const lastPage  = found ? Math.max(0, Math.ceil(found.results.length / PAGE_SIZE) - 1) : 0;

  const ready = games !== null;

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "90%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink }}>
            局面から探す
          </div>
          <button onClick={onClose} aria-label="閉じる"
            style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1.125rem", padding: 2 }}>
            <i className="ti ti-x" />
          </button>
        </div>
        <div style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif, lineHeight: 1.7, marginBottom: 12 }}>
          残した駒だけが一致する局面を、保存した棋譜から探します。
          いらない駒を消すほど、当てはまる将棋は増えます。
        </div>

        {/* ── 条件の盤 ── */}
        <QueryBoard query={query} side={startSide} onToggle={toggleSquare} />

        {/* 凡例。「見ない」と「空」は盤の上では紛らわしいので、必ず言葉でも出す */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center",
          margin: "8px 0 10px", fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif,
        }}>
          <span>押すたびに <b style={{ color: T.ink }}>駒 → 見ない → 空</b></span>
          <span><span style={{ color: T.brown }}>×</span> ＝ 空（どちらの駒も無い）</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button
            onClick={runSearch}
            disabled={!ready || marks === 0}
            style={{
              flex: 1, padding: "10px 12px", borderRadius: T.radius.md,
              border: "none", background: !ready || marks === 0 ? T.gray : T.gold,
              color: T.cream, cursor: !ready || marks === 0 ? "default" : "pointer",
              fontSize: T.fontSize.base, fontFamily: T.fontSerif,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <i className="ti ti-search" style={{ fontSize: "0.875rem" }} />
            {marks === 0 ? "駒を1つ以上残してください" : `この形で探す（${marks}マス指定）`}
          </button>
          <button
            onClick={resetQuery}
            style={{
              padding: "10px 12px", borderRadius: T.radius.md,
              border: `0.5px solid ${T.inkLine}`, background: "transparent",
              color: T.inkMid, cursor: "pointer", fontSize: T.fontSize.base, fontFamily: T.fontSerif,
            }}
          >
            元に戻す
          </button>
        </div>

        {/* ── 読み込み・埋め直しの最中 ── */}
        {!ready && !loadError && (
          <div style={{ textAlign: "center", padding: "24px 0", color: T.inkFaint, fontSize: T.fontSize.base, fontFamily: T.fontSerif, lineHeight: 1.8 }}>
            {packing
              ? <>保存済みの棋譜を検索できる形にしています<br />（{packing.done} / {packing.total}）</>
              : "棋譜を読み込んでいます..."}
          </div>
        )}
        {loadError && (
          <div style={{ textAlign: "center", padding: "24px 0", color: T.inkFaint, fontSize: T.fontSize.base, fontFamily: T.fontSerif }}>
            棋譜を読み込めませんでした
            <button
              onClick={load}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                margin: "12px auto 0", padding: "8px 14px", borderRadius: T.radius.md,
                border: `0.5px solid ${T.gold}`, background: "transparent",
                color: T.gold, cursor: "pointer", fontSize: T.fontSize.base, fontFamily: T.fontSerif,
              }}
            >
              <i className="ti ti-refresh" style={{ fontSize: "0.875rem" }} />もう一度読む
            </button>
          </div>
        )}

        {/* ── 結果 ── */}
        {ready && found && (
          <div>
            {/* 条件を変えたまま探していない間は、一覧が古いことを言う。
                黙っていると、消したはずの駒を条件にした結果を読むことになる */}
            {dirty && (
              <div style={{
                marginBottom: 8, padding: "7px 10px", borderRadius: T.radius.sm,
                background: T.goldLight, color: T.brown,
                fontSize: T.fontSize.sm, fontFamily: T.fontSerif,
              }}>
                条件が変わっています。「この形で探す」を押すと結果を更新します
              </div>
            )}
            <SectionLabel style={{ marginBottom: 6 }}>見つかった局面</SectionLabel>
            <div style={{ fontSize: T.fontSize.base, color: T.ink, fontFamily: T.fontSerif, marginBottom: 4 }}>
              対象{found.targets}局中 {found.results.length}件
            </div>
            {/* 先後が決まっていない棋譜は、条件をどちら向きに当てるか決められない。
                黙って母数から外すと「あの将棋が出てこない」の理由が分からなくなる */}
            {found.noSide > 0 && (
              <div style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif, marginBottom: 6, lineHeight: 1.7 }}>
                先後が決まっていない棋譜{found.noSide}件は対象外です
                （棋譜を開いて「あなた」を選ぶと対象になります）
              </div>
            )}

            {found.results.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: T.inkFaint, fontSize: T.fontSize.base, fontFamily: T.fontSerif, lineHeight: 1.8 }}>
                当てはまる局面はありませんでした<br />
                <span style={{ fontSize: T.fontSize.sm }}>駒を減らすと当てはまる将棋が増えます</span>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                  {pageItems.map(({ kifuId, ply }) => {
                    const g = byId.get(kifuId);
                    if (!g) return null;
                    const o = outcomeLabel(g);
                    return (
                      <button
                        key={`${kifuId}-${ply}`}
                        onClick={() => onOpenKifu?.(kifuId, ply)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, width: "100%",
                          padding: 8, borderRadius: T.radius.md, textAlign: "left",
                          border: `0.5px solid ${T.inkLine}`, background: T.cream, cursor: "pointer",
                        }}
                      >
                        {/* 盤は詰めた文字列から描く（snapshots を取り直さない） */}
                        <MiniBoard board={boardAt(g.boardsPacked, ply)} size={64} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: "block", fontSize: T.fontSize.lg, color: T.ink, fontFamily: T.fontSerif,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{g.name}</span>
                          <span style={{ display: "block", marginTop: 3, fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>
                            第{ply}手 ／ 自分は{g.mySide === "sente" ? "先手" : "後手"}
                            {o && <span style={{ color: o.color, marginLeft: 6 }}>{o.text}</span>}
                          </span>
                        </span>
                        <i className="ti ti-chevron-right" style={{ fontSize: "0.8125rem", color: T.gray }} />
                      </button>
                    );
                  })}
                </div>

                {/* 20件ずつ差し替える。下に足していくとミニ盤面が積み上がってDOMが膨らむ */}
                {found.results.length > PAGE_SIZE && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      style={pagerStyle(page === 0)}
                    >前の{PAGE_SIZE}件</button>
                    <span style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>
                      {page * PAGE_SIZE + 1}〜{page * PAGE_SIZE + pageItems.length}件目
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                      disabled={page >= lastPage}
                      style={pagerStyle(page >= lastPage)}
                    >次の{PAGE_SIZE}件</button>
                  </div>
                )}
              </>
            )}
            <div style={{ marginTop: 10, fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
              1つの棋譜からは、その形になった最初の手だけを出します。
              押すとその手から再生が開くので、分岐にしたい手にはしおりをはさんでください。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const pagerStyle = (disabled) => ({
  padding: "7px 12px", borderRadius: T.radius.sm,
  border: `0.5px solid ${disabled ? T.inkLineFaint : T.inkLine}`,
  background: "transparent", color: disabled ? T.gray : T.inkMid,
  cursor: disabled ? "default" : "pointer",
  fontSize: T.fontSize.sm, fontFamily: T.fontSerif,
});
