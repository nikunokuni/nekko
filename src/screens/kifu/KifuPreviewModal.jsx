// ══════════════════════════════════════════════════════════════════
// screens/kifu/KifuPreviewModal.jsx  ―  保存済み棋譜の再生ビュー
//   棋譜ライブラリ（KifuListScreen）から開く。
// ══════════════════════════════════════════════════════════════════
import { useCallback, useState } from "react";
import { T, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE } from "../../theme";
import { SectionLabel, KifuPreviewBoard } from "../../components/uiParts";
import { FEATURES_VERSION } from "../../kifuFeatures";
import { normalizeBookmarks, toggleBookmark, markBookmarkDone, pendingBookmarks } from "../../kifuBookmarks";
import { recordAction } from "../../rewards";
import { outcomeLabel } from "./shared";

// ──────────────────────────────────────────
// KifuPreviewModal: 保存済み棋譜の再生ビュー
// ──────────────────────────────────────────
// 読み取った対局情報と特徴を並べて見せる表。
// 戦法や囲いの自動判定が実戦の感覚と合っているかを、ここで確かめられるようにする。
function KifuFactsTable({ kifu, onSetSide }) {
  const f = kifu.features;
  const side = kifu.mySide === "sente" ? "先手" : kifu.mySide === "gote" ? "後手" : null;
  const outcome = outcomeLabel(kifu);
  // 完成度は数字で出すと「67%＝組めていない」と読めてしまう。
  // 片美濃のように金1枚でも完成形の囲いがあるため、型として成立していれば
  // 名前だけを出し、崩れている場合だけ「組みかけ」と添える。
  const castle = (c) => {
    if (!c) return "―";
    if (c.completeness > 0 && c.completeness < 1) return `${c.name}（組みかけ）`;
    return c.name;
  };
  // 特徴の作り方を変えたあとの古い解析結果には、新しい項目が入っていない。
  // 「なし」と出すと計算していないだけの対局が事実に見えるので、そう書かない
  // （傾向画面の「まとめて解析する」で作り直せる）
  const fresh = (value) => (f?.v === FEATURES_VERSION ? value : "―（再解析が必要）");
  const reswing = (x) => {
    const parts = [];
    if (x.myReswingPly)  parts.push(`自分が${x.myReswingPly}手目`);
    if (x.oppReswingPly) parts.push(`相手が${x.oppReswingPly}手目`);
    return parts.length ? parts.join(" / ") : "なし";
  };

  // 先後が決まっていない棋譜は、ここで名前を選んで直せるようにする。
  // 対局者名の表記ゆれで自動判定が外れると、他に直す手段が無くなるため。
  const sideCell = side ? `${side}番` : (
    <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {[["sente", kifu.senteName || "先手"], ["gote", kifu.goteName || "後手"]].map(([v, label]) => (
        <button
          key={v}
          onClick={() => onSetSide?.(v)}
          style={{
            padding: "2px 10px", borderRadius: T.radius.sm, cursor: "pointer",
            border: `0.5px solid ${T.gold}`, background: "transparent", color: T.gold,
            fontFamily: T.fontSerif, fontSize: T.fontSize.sm,
            maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >{label}</button>
      ))}
      <span style={{ color: T.inkFaint, fontSize: T.fontSize.sm }}>← あなたはどちら？</span>
    </span>
  );

  const rows = [
    ["対局者", `先手 ${kifu.senteName || "―"} ／ 後手 ${kifu.goteName || "―"}`],
    ["あなた", sideCell],
    ["結果",   outcome ? outcome.text : "読み取れていません"],
    ...(kifu.handicap && kifu.handicap !== "平手" ? [["手合割", `${kifu.handicap}（駒落ちは集計対象外）`]] : []),
    ...(f ? [
      ["戦型",       fresh(f.formation)],
      ["自分の戦法", f.myStrategy],
      ["相手の戦法", f.oppStrategy],
      ["自分の囲い", castle(f.myCastle)],
      ["相手の囲い", castle(f.oppCastle)],
      ["角交換",     fresh(f.bishopExchangePly ? `${f.bishopExchangePly}手目で成立` : "なし")],
      ["仕掛け",     fresh(f.breakPly ? `${f.breakPly}手目（${f.attackFirst}）` : "駒がぶつかっていません")],
      ["飛車を振った手", f.swingPly ? `${f.swingPly}手目（${f.swingSpeed}・${f.swingTiming === "先発" ? "自分から決めた" : "相手を見てから決めた"}）` : "振っていません（居飛車）"],
      ["飛車の振り直し", fresh(reswing(f))],
    ] : []),
  ];

  return (
    <div style={{ marginBottom: 14 }}>
      <SectionLabel style={{ marginBottom: 6 }}>読み取った内容</SectionLabel>
      <div style={{ borderRadius: T.radius.md, border: `0.5px solid ${T.inkLine}`, overflow: "hidden" }}>
        {rows.map(([label, value], i) => (
          <div key={label} style={{
            display: "flex", gap: 10, padding: "8px 12px",
            borderBottom: i < rows.length - 1 ? `0.5px solid ${T.inkLineFaint}` : "none",
            fontSize: T.fontSize.base, fontFamily: T.fontSerif,
          }}>
            <span style={{ width: 96, flexShrink: 0, color: T.inkMid }}>{label}</span>
            <span style={{ flex: 1, color: T.ink }}>{value}</span>
          </div>
        ))}
      </div>
      {!f && (
        <div style={{ marginTop: 6, fontSize: T.fontSize.sm, color: T.grayText, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
          あなたがどちら側か決まっていないため、戦法・囲いは判定していません。
          上の「あなた」で名前を選ぶと、次からは自動で判定します。
        </div>
      )}
    </div>
  );
}

// 再生位置の呼び名。0手目は「第0手」ではなく初期局面と呼ぶ（盤の再生ナビと同じ言い方）
const plyLabel = (i) => (i === 0 ? "初期局面" : `第${i}手`);

// ツリーへ送る手順を中断するボタン。
// 選択肢と同じ大きさのボタンにしてあるのは、始めた操作から降りる導線が
// 小さな文字リンクだと見つからず、モーダルごと閉じるしか無いように見えるため。
// 手順のどの段階にも必ず置く（片方だけだと、無い側で行き止まりになる）。
function CancelButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%",
        padding: "9px 12px", borderRadius: T.radius.sm,
        border: `0.5px solid ${T.inkLine}`, background: "transparent",
        color: T.grayText, cursor: "pointer", fontSize: T.fontSize.base, fontFamily: T.fontSerif,
      }}
    >
      <i className="ti ti-arrow-back-up" style={{ fontSize: "0.875rem" }} />
      やめる
    </button>
  );
}

export function KifuPreviewModal({ kifu, onClose, onSetSide, trees = [], onSendToInbox, onBookmarksChange }) {
  // ツリーへ送るまでの段階。null=未着手 / "range"=どこまでかを聞いている / "tree"=送り先を選んでいる。
  // 範囲→ツリーの順にしているのは、範囲の始点が「ボタンを押した時に見ていた局面」で決まるため。
  // 先にツリーを選ばせると、選んでいる間に盤を触られて始点が動いてしまう
  const [step,    setStep]    = useState(null);
  const [range,   setRange]   = useState(null);  // { start, end } 確定した切り取り範囲
  const [sending, setSending] = useState(false);
  // 盤がいま映している手数（null = 再生していない＝最終局面を表示中）
  const [viewPly, setViewPly] = useState(null);
  // しおり。保存は呼び出し元（DBを触るのは画面側）だが、押した瞬間に
  // 見た目が変わらないと「効いていない」と読まれるので、ここでも持つ
  const [marks, setMarks] = useState(() => normalizeBookmarks(kifu.bookmarks));

  // しおりを付け外しする。保存に失敗したら見た目を元に戻す
  // （消えたはずの印が残る／付けた印が消えるのを、黙って放置しない）
  const saveMarks = async (next) => {
    const prev = marks;
    setMarks(next);
    const ok = await onBookmarksChange?.(kifu.id, next);
    if (ok === false) setMarks(prev);
  };
  // 盤へ渡す通知。毎レンダー作り直すと盤の useEffect が回り続けるので固定する
  const handlePlaybackIdxChange = useCallback((idx) => setViewPly(idx), []);

  const snaps     = kifu.snapshots || [];
  const moveCount = Math.max(0, snaps.length - 1);

  // 始点はボタンを押した時点で凍らせる。以降は終点を選ぶために盤を動かすので、
  // 表示中の手数（viewPly）をそのまま始点として読み続けると始点まで一緒に動いてしまう
  const [start, setStart] = useState(0);

  const beginSend = () => {
    // 「その時に見ていた盤面」から切り取る。再生していないとき（null）だけは、
    // 見えている最終局面を始点にすると手が1つも入らないので、棋譜まるごと＝初期局面からにする
    const s = viewPly ?? 0;
    setStart(s);
    // 1局面しかない／最終手を見ていた場合は切り取る余地がないので、範囲は聞かずに送り先へ進む
    if (s >= moveCount) { setRange({ start: 0, end: moveCount }); setStep("tree"); return; }
    setStep("range");
  };

  const chooseEnd = (end) => { setRange({ start, end }); setStep("tree"); };

  const send = async (treeId) => {
    if (sending) return;
    setSending(true);
    const ok = await onSendToInbox?.(treeId, kifu, range);
    setSending(false);
    // ノードにした手は「済み」にする。しおりは消さない ―― 消すと
    // 「自分がどこを分岐点だと思ったか」の記録がその場で失われる。
    // しおりを付けずに直接作った手も、分岐点だと判断した事実には違いないので記録する
    if (ok !== false && range) saveMarks(markBookmarkDone(marks, range.start));
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "90%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink }}>
            {kifu.name}
          </div>
          {/* 絵しか無いボタンには aria-label を付ける（title だけでは、
              アイコンフォントが ::before で差し込む文字に名前が引っ張られる） */}
          <button onClick={onClose} aria-label="閉じる"
            style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1.125rem", padding: 2 }}>
            <i className="ti ti-x" />
          </button>
        </div>
        <KifuFactsTable kifu={kifu} onSetSide={onSetSide} />

        {/* 自分で書いたメモ。読み取った事実（上の表）とは別物なので、線を引いて分ける */}
        {(kifu.memo || "").trim() && (
          <div style={{ marginBottom: 14 }}>
            <SectionLabel style={{ marginBottom: 6 }}>メモ</SectionLabel>
            <div style={{
              padding: "9px 12px", borderRadius: T.radius.md,
              border: `0.5px solid ${T.inkLine}`, background: T.goldBg,
              fontSize: T.fontSize.base, color: T.ink, fontFamily: T.fontSerif,
              lineHeight: 1.8, whiteSpace: "pre-wrap",
            }}>
              {kifu.memo}
            </div>
          </div>
        )}

        {/* ── ツリーへ送る ──
            どこに置くか決めずにツリーへ入れられるようにする。
            置き場所を決めるのは後で良い、という前提で「とりあえず」へ入れる。
            ボタンの文言は入れ先ではなく**することそのもの**にしてある。
            「とりあえず」はツリーの中の置き場の名前で、棋譜を見ている時点では
            まだ出てきていないので、押す前に何が起きるか読み取れない
            （入れ先は下の説明と、押したあとのツリー選択で分かる） */}
        {onSendToInbox && trees.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {step === null ? (
              <button
                onClick={beginSend}
                style={{
                  display: "flex", alignItems: "center", gap: 6, width: "100%",
                  padding: "9px 12px", borderRadius: T.radius.md,
                  border: `0.5px dashed ${T.gold}`, background: "transparent",
                  color: T.gold, cursor: "pointer", fontSize: T.fontSize.base, fontFamily: T.fontSerif,
                }}
              >
                <i className="ti ti-git-branch" style={{ fontSize: "0.875rem" }} />
                この局面からノードを作る
              </button>
            ) : step === "range" ? (
              /* ── ①どこまで入れるか ──
                 始点は押した時に見ていた局面で固定し、終点だけを聞く。
                 「ここから・ここまで」の2回選ばせると、見ていた局面をもう一度
                 選び直す手間になるうえ、選び忘れたまま止まりやすい */
              <div>
                <SectionLabel style={{ marginBottom: 6 }}>どこまで入れますか</SectionLabel>
                <div style={{ fontSize: T.fontSize.base, color: T.ink, fontFamily: T.fontSerif, marginBottom: 8 }}>
                  {plyLabel(start)}から
                  <span style={{ color: T.inkFaint, fontSize: T.fontSize.sm }}>
                    {viewPly === null ? "（棋譜のはじめから）" : "（さっき見ていた局面）"}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* 下の盤を動かしてから押す。ラベルは再生位置に追従する */}
                  <button
                    onClick={() => chooseEnd(viewPly)}
                    disabled={viewPly === null || viewPly <= start}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, width: "100%",
                      padding: "9px 12px", borderRadius: T.radius.sm,
                      border: `0.5px solid ${T.gold}`, background: T.goldBg,
                      color: viewPly === null || viewPly <= start ? T.gray : T.ink,
                      cursor: viewPly === null || viewPly <= start ? "default" : "pointer",
                      fontSize: T.fontSize.base, fontFamily: T.fontSerif,
                    }}
                  >
                    <i className="ti ti-scissors" style={{ fontSize: "0.875rem" }} />
                    {viewPly === null || viewPly <= start
                      ? "いま見ている局面まで（盤を進めてください）"
                      : `いま見ている局面（${plyLabel(viewPly)}）まで`}
                  </button>
                  <button
                    onClick={() => chooseEnd(moveCount)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, width: "100%",
                      padding: "9px 12px", borderRadius: T.radius.sm,
                      border: `0.5px solid ${T.inkLine}`, background: T.cream,
                      color: T.ink, cursor: "pointer", fontSize: T.fontSize.base, fontFamily: T.fontSerif,
                    }}
                  >
                    <i className="ti ti-player-skip-forward" style={{ fontSize: "0.875rem" }} />
                    最後（{plyLabel(moveCount)}）まで
                  </button>
                  <CancelButton onClick={() => setStep(null)} />
                </div>
                <div style={{ marginTop: 6, fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
                  下の盤を終わりの局面まで進めてから押します。選んだ範囲だけを切り取ります。
                </div>
              </div>
            ) : (
              /* ── ②どのツリーへ入れるか ── */
              <div>
                <SectionLabel style={{ marginBottom: 6 }}>どのツリーに入れますか</SectionLabel>
                {range && (
                  <div style={{ marginBottom: 6, fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>
                    切り取る範囲：{plyLabel(range.start)}〜{plyLabel(range.end)}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* 押せるものは button で作る。div のままだとキーボードや読み上げから
                      たどれず、名前も付かないので E2E からも「ツリー名の文字」でしか
                      指せない（画面の他の場所に同じ将棋用語が出た瞬間に指せなくなる） */}
                  {trees.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => send(t.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "9px 12px", borderRadius: T.radius.sm, textAlign: "left",
                        border: `0.5px solid ${T.inkLine}`, background: T.cream,
                        cursor: sending ? "default" : "pointer", opacity: sending ? 0.6 : 1,
                        fontSize: T.fontSize.base, color: T.ink, fontFamily: T.fontSerif,
                      }}
                    >
                      <i className="ti ti-plant-2" style={{ fontSize: "0.875rem", color: T.gold, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                      <i className="ti ti-chevron-right" style={{ fontSize: "0.8125rem", color: T.gray }} />
                    </button>
                  ))}
                  <CancelButton onClick={() => { setStep(null); setRange(null); }} />
                </div>
                <div style={{ marginTop: 6, fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
                  切り取った範囲をノードにして、ツリーの「とりあえず」に入れます。
                </div>
              </div>
            )}
          </div>
        )}

        {/* しおりの残り。盤のしおり列は再生を始めないと目に入らないので、
            「まだいくつ残っているか」は盤の外に出しておく。
            棋譜を開き直したとき、続きがあること自体を思い出せるようにする */}
        {onBookmarksChange && marks.length > 0 && (
          <div style={{ marginBottom: 10, fontSize: T.fontSize.sm, color: T.brown, fontFamily: T.fontSerif }}>
            <i className="ti ti-bookmark" style={{ fontSize: "0.75rem", marginRight: 4 }} />
            しおり {marks.length}件
            {pendingBookmarks(marks).length > 0
              ? `（ノードにしていない手が${pendingBookmarks(marks).length}件）`
              : "（すべてノードにしました）"}
          </div>
        )}

        <KifuPreviewBoard
          snapshots={kifu.snapshots}
          onPlaybackIdxChange={handlePlaybackIdxChange}
          bookmarks={marks}
          // 保存する手段が無いときはしおりのUIごと出さない（押せても残らないため）
          onToggleBookmark={onBookmarksChange ? (ply) => {
            const next = toggleBookmark(marks, ply);
            // 外したときは数えない（はさめたことを見たいので、往復で取れると意味が薄れる）
            if (next.length > marks.length) recordAction("bookmark");
            saveMarks(next);
          } : undefined}
        />
      </div>
    </div>
  );
}
