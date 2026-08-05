// ══════════════════════════════════════════════════════════════════
// screens/kifu/RecordKifuModal.jsx  ―  盤に並べて棋譜を作る（棋譜入力）
//   棋譜ライブラリ（KifuListScreen）から開く。
// ══════════════════════════════════════════════════════════════════
import { useState } from "react";
import { T, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE, parseTags } from "../../theme";
import { InputField, SectionLabel, ModalActionButtons, TagPickerField } from "../../components/uiParts";
import ShogiBoard from "../../ShogiBoard";
import { STRATEGY_GROUPS, INITIAL_BOARD } from "../../data";
import { resultFromOutcome } from "../../kifuAnalyze";

// ──────────────────────────────────────────
// RecordKifuModal: 盤に並べて棋譜を作る（棋譜入力）
//
//   道場・大会・棋書のように、棋譜ファイルが手に入らない対局を残すための入口。
//   開いた時点から記録が始まり、「記録を終わる」で棋譜が確定する。
//
//   盤と入力欄は1画面に同居させる（段階で切り替えない）。並べている途中に
//   思い出したことをその場で書けるようにするため。入力欄は素の state なので、
//   記録中（ShogiBoard の中の ref）とは干渉しない。
//
//   取り込みと違って対局者名も「まで〇手で…の勝ち」も無いので、自動で決まる
//   ものが何も無い。代わりに「自分はどちら側か」「結果」をその場で聞く。
//   この2つが欠けた棋譜は傾向分析に載らない（toAnalysisGame が null を返す）ため、
//   忘れる前にここで押さえておく。
// ──────────────────────────────────────────

// 既定の棋譜名と記録日。手入力は「今日指した対局」を残すのが大半なので今日にする
function todayInputValue() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function RecordKifuModal({ onClose, onSave, customTags, onAddCustomTag }) {
  const [snapshots, setSnapshots] = useState(null);  // null = まだ記録中
  const [touched,   setTouched]   = useState(false); // 1手でも動かしたか（閉じる前の確認に使う）
  const [emptyWarn, setEmptyWarn] = useState(false); // 0手のまま「記録を終わる」を押した
  const [boardSeq,  setBoardSeq]  = useState(0);     // やり直しのたびに盤を作り直すためのキー

  const [name,     setName]     = useState(() => {
    const d = new Date();
    return `${d.getMonth() + 1}/${d.getDate()} の対局`;
  });
  const [playedAt, setPlayedAt] = useState(todayInputValue);
  const [mySide,   setMySide]   = useState(null);    // "sente" | "gote" | "none"
  const [outcome,  setOutcome]  = useState(null);    // "win" | "lose" | "draw" | "none"
  const [tags,     setTags]     = useState("");
  const [memo,     setMemo]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  // 「記録を終わる」を受ける。0手なら保存フォームへ進めず、盤に戻して並べ直してもらう
  const handleRecordStop = (snaps) => {
    if (snaps.length <= 1) { setEmptyWarn(true); return; }
    setEmptyWarn(false);
    setSnapshots(snaps);
  };

  const restart = () => {
    setSnapshots(null);
    setTouched(false);
    setEmptyWarn(false);
    setBoardSeq((n) => n + 1);
  };

  // 並べた手はどこにも残っていないので、閉じる前に確認する。
  // オーバーレイのタップでは閉じない（他のモーダルと違い、誤タップの損失が大きい）
  const handleClose = () => {
    if ((touched || snapshots) && !window.confirm("入力した棋譜は保存されません。閉じますか？")) return;
    onClose();
  };

  const side = mySide === "none" ? null : mySide;

  const handleSave = async () => {
    if (!snapshots || saving) return;
    setSaving(true);
    setError("");
    const ok = await onSave({
      name:      name.trim(),
      tags:      parseTags(tags),
      memo:      memo.trim(),
      snapshots,
      mySide:    side,
      result:    resultFromOutcome(outcome === "none" ? null : outcome, side),
      // 日付だけの入力なので、その日の 00:00 として保存する（一覧の並びは日単位で足りる）
      playedAt:  playedAt ? new Date(`${playedAt}T00:00:00`).toISOString() : null,
    });
    setSaving(false);
    if (ok) onClose();
    else setError("保存できませんでした。もう一度お試しください");
  };

  // 保存できない理由（先に出会うものから1つだけ出す）
  const blocker =
    !snapshots       ? "盤に並べて「記録を終わる」を押すと保存できます"
    : !mySide        ? "「あなたはどちら」を選ぶと保存できます。あとから思い出せない項目なので、ここで聞いています"
    : !name.trim()   ? "棋譜の名前を入れてください"
    : null;

  // 選択式の共通ボタン（自分の側・結果）
  const choiceBtn = (selected) => ({
    padding: "5px 12px", borderRadius: T.radius.sm, cursor: "pointer",
    fontFamily: T.fontSerif, fontSize: T.fontSize.base,
    border: `0.5px solid ${selected ? T.gold : T.inkLine}`,
    background: selected ? T.gold : "transparent",
    color: selected ? T.cream : T.grayText,
  });

  return (
    <div style={MODAL_OVERLAY_STYLE}>
      <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "94%", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink }}>
            棋譜入力
          </div>
          <button onClick={handleClose} aria-label="棋譜入力を閉じる"
            style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1.125rem", padding: 2 }}>
            <i className="ti ti-x" />
          </button>
        </div>

        {/* ── 盤（一番上）──
            並べている間ずっと見るのは盤なので、説明も入力欄も下にまわす。
            記録が終わった後もこの盤をそのまま使う（差し替えない）。
            kifu を渡すと再生ナビが出て、記録の操作は消える（kifuLen === 0 の条件）ので、
            「並べる盤」と「見返す盤」を1つで兼ねられる */}
        <ShogiBoard
          key={boardSeq}
          board={INITIAL_BOARD}
          kifu={snapshots || []}
          recordOnly
          readOnly={!!snapshots}
          // 駒が動いたら 0手の注意は用済み。消さないと、並べ直しているのに
          // 「まだ1手も動かしていません」が残って矛盾する
          onChange={() => { setTouched(true); setEmptyWarn(false); }}
          onRecordStop={handleRecordStop}
        />

        {emptyWarn && (
          <div style={{ marginTop: 10, fontSize: T.fontSize.sm, color: T.red, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
            まだ1手も動かしていません。「棋譜を記録」からもう一度始めてください。
          </div>
        )}

        {/* 記録中／記録済みの案内。記録済みのときだけ並べ直せる */}
        <div style={{
          marginTop: 10, marginBottom: 16, padding: "9px 12px", borderRadius: T.radius.md,
          background: T.goldLight, fontSize: T.fontSize.sm, color: T.ink,
          fontFamily: T.fontSerif, lineHeight: 1.7,
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        }}>
          {!snapshots ? (
            <span style={{ flex: 1 }}>
              初手から順に、先手・後手の両方の駒を動かしてください。<br />
              指し終えたら<b>「記録を終わる」</b>を押すと保存できます（下の項目は今のうちに書けます）。
            </span>
          ) : (
            <>
              <span style={{ flex: 1 }}>
                <i className="ti ti-check" style={{ fontSize: "0.75rem", color: T.green }} /> {snapshots.length - 1}手を記録しました
              </span>
              <button onClick={restart} style={{ ...choiceBtn(false), display: "flex", alignItems: "center", gap: 4 }}>
                <i className="ti ti-refresh" style={{ fontSize: "0.75rem" }} />最初から入力し直す
              </button>
            </>
          )}
        </div>

        {/* ── 入力欄（盤の下）── */}
        <InputField label="棋譜の名前" value={name} onChange={setName} placeholder="例：7/18 道場での対局" />

        {/* 記録日と「あなたはどちら」は横並び。日付は幅を取らないので、
            この2つを1行に収めると盤と保存ボタンの距離が縮む */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <SectionLabel style={{ marginBottom: 5 }}>記録日</SectionLabel>
            <input
              type="date"
              value={playedAt}
              onChange={(e) => setPlayedAt(e.target.value)}
              aria-label="記録日"
              style={{
                border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.md,
                padding: "6px 8px", fontSize: T.fontSize.base, color: T.ink,
                background: T.cream, fontFamily: T.fontSerif, outline: "none",
              }}
            />
          </div>
          {/* 自分の側と結果。傾向分析はこの2つが揃った棋譜だけを数える */}
          <div style={{ flex: 1, minWidth: 150 }}>
            <SectionLabel style={{ marginBottom: 5 }}>あなたはどちら</SectionLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[["sente", "先手"], ["gote", "後手"], ["none", "分析しない"]].map(([v, label]) => (
                <button key={v} onClick={() => setMySide(v)} style={choiceBtn(mySide === v)}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {side && (
          <div style={{ marginBottom: 14 }}>
            <SectionLabel style={{ marginBottom: 6 }}>結果</SectionLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[["win", "勝ち"], ["lose", "負け"], ["draw", "引き分け"], ["none", "記録しない"]].map(([v, label]) => (
                <button key={v} onClick={() => setOutcome(v)} style={choiceBtn(outcome === v)}>{label}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ margin: "0 -16px" }}>
          <TagPickerField
            label="戦法タグ（任意）"
            text={tags}
            onSelectTag={(next) => setTags(next.join("、"))}
            groups={STRATEGY_GROUPS}
            customTags={customTags}
            onAddCustomTag={onAddCustomTag}
          />
        </div>

        {/* 自由メモ。統計に使わない「理由と狙い」を残す場所（機械は事実と数字だけを扱う） */}
        <div style={{ marginBottom: 14 }}>
          <SectionLabel style={{ marginBottom: 5 }}>メモ（自由記入）</SectionLabel>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例：序盤で角道を止める形にした／終盤の寄せが分からなかった"
            rows={3}
            aria-label="メモ（自由記入）"
            style={{
              width: "100%", boxSizing: "border-box",
              border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.md,
              padding: "10px 12px", fontSize: T.fontSize.base, color: T.ink,
              background: T.cream, fontFamily: T.fontSerif, resize: "vertical", outline: "none",
            }}
            onFocus={(e) => (e.target.style.borderColor = T.gold)}
            onBlur={(e)  => (e.target.style.borderColor = T.inkLine)}
          />
        </div>

        {error && (
          <div style={{ marginTop: 10, fontSize: T.fontSize.sm, color: T.red, fontFamily: T.fontSerif }}>
            {error}
          </div>
        )}

        <ModalActionButtons
          onCancel={handleClose}
          onConfirm={handleSave}
          confirmLabel={saving ? "保存中..." : "保存する"}
          disabled={!snapshots || !name.trim() || !mySide || saving}
        />
        {/* なぜ保存できないのかを1つだけ出す。並べ終わる前から欄を埋められるぶん、
            「押せない理由」が見えないと止まってしまう */}
        {blocker && (
          <div style={{ marginTop: 8, fontSize: T.fontSize.sm, color: T.grayText, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
            {blocker}
          </div>
        )}
      </div>
    </div>
  );
}
