// ══════════════════════════════════════════════════════════════════
// KifuListScreen.jsx  ―  棋譜ライブラリ画面
//   KifuCard / KifuList / ImportKifuModal / RecordKifuModal /
//   KifuPreviewModal / EditKifuModal / DeleteKifuModal
//   棋譜（kifus テーブル）の一覧・インポート・手入力・再生・削除を行う。
//   ノードへの取り込みはノード編集画面側（KifuPickerModal）から行う。
// ══════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { T, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE, parseTags } from "../theme";
import { InputField, SectionLabel, ModalActionButtons, ConfirmDeleteModal, KifuPreviewBoard, TagPickerField } from "../components/uiParts";
import ShogiBoard from "../ShogiBoard";
import { STRATEGY_GROUPS, INITIAL_BOARD } from "../data";
import { recordAction, getCustomTagsByGroup, addCustomTag, getKifuPlayerNames, addKifuPlayerName } from "../rewards";
import { importKifuText } from "../kifuParser";
import { readKifuFile } from "../kifuFile";
import { analyzeKifu, recomputeFeatures, resolveMySide, outcomeFor, resultFromOutcome } from "../kifuAnalyze";
import { fetchMyKifus, fetchKifu, createKifu, updateKifu, deleteKifu, kifuRowToKifu } from "../db";

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

// 一覧カードの日付表示（例: 2026/7/18）
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// ──────────────────────────────────────────
// ImportKifuModal: ファイル選択 or テキスト貼り付けで棋譜を登録
//   ファイルは複数まとめて選べる（実戦をためるには一括取り込みが要るため）。
//
//   「自分がどちら側か」は対局者名から自動判定する。判定できないときは
//   「先手／後手のどちら？」ではなく「この名前はあなた？」と名前で聞く。
//   答えを対局者名として覚えるので、同じ場でまとめて読み込んだ他の棋譜も
//   その場で解決し、次回以降は聞かずに済む。
// ──────────────────────────────────────────

// 取り込み候補1件を作る。読めなかった場合も error を持たせて一覧に残す
// （どのファイルが失敗したのか分かるようにするため）。
let entrySeq = 0;
function makeEntry(text, defaultName, playerNames) {
  const key = `e${++entrySeq}`;
  const result = importKifuText(text);
  if (!result || result.snapshots.length <= 1) {
    return { key, name: defaultName, error: "棋譜の手を読み取れませんでした（KIF/CSA形式か確認してください）" };
  }
  return {
    key,
    name: defaultName,
    snapshots:  result.snapshots,
    sourceText: text,
    skipped:    result.skipped,
    analysis:   analyzeKifu({ sourceText: text, snapshots: result.snapshots, playerNames }),
    sideOverride: null,   // null=自動判定に従う / "none"=分析しない / "sente" / "gote"
  };
}

// その棋譜で最終的に採用する「自分の側」
function effectiveSide(entry) {
  if (entry.sideOverride === "none") return null;
  return entry.sideOverride ?? entry.analysis?.mySide ?? null;
}

// ── 「自分はどちら？」を対局者名で聞く行 ──────────────
function SidePicker({ entry, onChoose, compact }) {
  const a = entry.analysis;
  if (!a) return null;
  const side = effectiveSide(entry);
  const options = [
    { v: "sente", label: a.senteName || "先手（名前の記載なし）" },
    { v: "gote",  label: a.goteName  || "後手（名前の記載なし）" },
    { v: "none",  label: "分析しない" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {!compact && <span style={{ fontSize: T.fontSize.sm, color: T.grayText, fontFamily: T.fontSerif }}>あなたは</span>}
      {options.map(({ v, label }) => {
        const selected = v === "none" ? side === null : side === v;
        return (
          <button
            key={v}
            onClick={() => onChoose(entry.key, v)}
            style={{
              padding: "3px 10px", borderRadius: T.radius.sm, cursor: "pointer",
              fontFamily: T.fontSerif, fontSize: T.fontSize.sm, maxWidth: 160,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              border: `0.5px solid ${selected ? T.gold : T.inkLine}`,
              background: selected ? T.gold : "transparent",
              color: selected ? T.cream : T.grayText,
            }}
          >{label}</button>
        );
      })}
    </div>
  );
}

// ── 一覧の1行（複数まとめて読み込んだとき）──────────
function EntryRow({ entry, onChoose, onRemove }) {
  const a = entry.analysis;
  const side = effectiveSide(entry);
  const outcome = a ? outcomeLabel({ result: a.result, mySide: side }) : null;
  return (
    <div style={{ padding: "10px 0", borderBottom: `0.5px solid ${T.inkLineFaint}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: entry.error ? 0 : 6 }}>
        <span style={{ flex: 1, fontSize: T.fontSize.base, color: T.ink, fontFamily: T.fontSerif, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.name}
        </span>
        {entry.snapshots && (
          <span style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>
            {entry.snapshots.length - 1}手
          </span>
        )}
        {outcome && (
          <span style={{ fontSize: T.fontSize.sm, color: outcome.color, fontFamily: T.fontSerif }}>
            {outcome.text}
          </span>
        )}
        <button
          onClick={() => onRemove(entry.key)}
          style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "0.875rem", padding: 2, lineHeight: 1 }}
          aria-label="この棋譜を取り込みから外す"
        >
          <i className="ti ti-x" />
        </button>
      </div>
      {entry.error
        ? <div style={{ fontSize: T.fontSize.sm, color: T.red, fontFamily: T.fontSerif }}>{entry.error}</div>
        : <SidePicker entry={entry} onChoose={onChoose} compact />}
    </div>
  );
}

function ImportKifuModal({ onClose, onImportMany, customTags, onAddCustomTag }) {
  const [entries,   setEntries]   = useState([]);
  const [tags,      setTags]      = useState("");   // 「、」区切りの戦法タグ（TagPickerField の形式）
  const [singleName, setSingleName] = useState(""); // 1件だけのときに編集できる名前
  const [pasteText, setPasteText] = useState("");
  const [error,     setError]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [progress,  setProgress]  = useState(0);
  // 覚えている対局者名。この場で新しく覚えたぶんも即座に反映する
  const [playerNames, setPlayerNames] = useState(() => getKifuPlayerNames());

  const readable = entries.filter((e) => e.snapshots);
  const single   = entries.length === 1 && !entries[0].error;
  // 名前が分からず自分の側を決められていない棋譜（先に解決してほしいので数える）
  const unresolved = readable.filter((e) => effectiveSide(e) === null && e.sideOverride !== "none").length;

  const addEntries = (newOnes) => {
    setEntries((prev) => [...prev, ...newOnes]);
    if (newOnes.length === 1 && !newOnes[0].error) setSingleName((n) => n || newOnes[0].name);
  };

  const handleFileChange = async (e) => {
    const files = [...(e.target.files || [])];
    // 同じファイルをもう一度選んでも change が発火するよう value をリセットする
    e.target.value = "";
    if (files.length === 0) return;
    setError("");
    try {
      const made = [];
      for (const file of files) {
        const text = await readKifuFile(file);
        made.push(makeEntry(text, file.name.replace(/\.[^.]+$/, ""), playerNames));
      }
      addEntries(made);
      const failed = made.filter((m) => m.error).length;
      if (failed > 0) setError(`${failed}件は読み取れませんでした（一覧の×で外せます）`);
    } catch (err) {
      console.error("棋譜の読み込みに失敗しました", err);
      setError("棋譜の読み込みに失敗しました");
    }
  };

  const handlePaste = () => {
    setError("");
    const entry = makeEntry(pasteText, `貼り付けた棋譜${entries.length + 1}`, playerNames);
    if (entry.error) { setError(entry.error); return; }
    addEntries([entry]);
    setPasteText("");
  };

  // 「あなたはこの名前？」への答え。
  // 名前を覚えたうえで、まだ判定できていない他の棋譜もその場で解決する。
  // 副作用（名前の永続化）は StrictMode の二重実行を避けるため updater の外で行う。
  const handleChooseSide = (key, side) => {
    const target = entries.find((e) => e.key === key);
    let names = playerNames;
    if (side !== "none" && target?.analysis) {
      const chosen = side === "sente" ? target.analysis.senteName : target.analysis.goteName;
      if (chosen && !names.includes(chosen)) {
        names = addKifuPlayerName(chosen);
        setPlayerNames(names);
      }
    }
    setEntries((prev) => prev.map((e) => {
      if (e.key === key) return { ...e, sideOverride: side };
      // 手動指定していない・自動判定もできていない棋譜だけ、覚えた名前で見直す
      if (e.sideOverride == null && e.analysis && !e.analysis.mySide) {
        const resolved = resolveMySide(e.analysis, names);
        if (resolved) return { ...e, analysis: { ...e.analysis, mySide: resolved } };
      }
      return e;
    }));
  };

  const handleRemove = (key) => setEntries((prev) => prev.filter((e) => e.key !== key));

  const handleSave = async () => {
    if (readable.length === 0 || saving) return;
    setSaving(true);
    setProgress(0);
    const parsedTags = parseTags(tags);
    const items = readable.map((e) => ({
      name: (single ? singleName : e.name).trim() || e.name,
      snapshots:  e.snapshots,
      sourceText: e.sourceText,
      tags:       parsedTags,
      analysis:   { ...e.analysis, mySide: effectiveSide(e) },
    }));
    const savedCount = await onImportMany(items, setProgress);
    setSaving(false);
    if (savedCount === items.length) onClose();
    else setError(`${savedCount}/${items.length}件を保存しました。残りは保存できませんでした`);
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "85%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, marginBottom: 20 }}>
          棋譜を保存
        </div>

        {/* ファイル選択（複数可） */}
        <div style={{ marginBottom: 14 }}>
          <SectionLabel style={{ marginBottom: 8 }}>ファイルから（KIF/CSA・複数選択できます）</SectionLabel>
          <label
            htmlFor="kifu-lib-file-input"
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 12px", borderRadius: T.radius.md,
              border: `0.5px dashed ${T.gold}`, cursor: "pointer",
              color: T.gold, fontSize: T.fontSize.base, fontFamily: T.fontSerif,
            }}
          >
            <i className="ti ti-file-upload" style={{ fontSize: "0.875rem" }} />
            KIF / CSA ファイルを選択（まとめて選べます）
          </label>
          <input
            id="kifu-lib-file-input"
            type="file"
            multiple
            accept=".kif,.kifu,.csa,.txt"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </div>

        {/* テキスト貼り付け */}
        <div style={{ marginBottom: 14 }}>
          <SectionLabel style={{ marginBottom: 8 }}>またはテキストを貼り付け</SectionLabel>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="将棋アプリやサイトからコピーした棋譜（KIF/CSA）を貼り付け..."
            rows={4}
            style={{
              width: "100%", boxSizing: "border-box",
              border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.md,
              padding: "10px 12px", fontSize: T.fontSize.base, color: T.ink,
              background: T.cream, fontFamily: T.fontSerif, resize: "vertical", outline: "none",
            }}
            onFocus={(e) => (e.target.style.borderColor = T.gold)}
            onBlur={(e)  => (e.target.style.borderColor = T.inkLine)}
          />
          {pasteText.trim() && (
            <button
              onClick={handlePaste}
              style={{
                marginTop: 6, padding: "7px 14px", borderRadius: T.radius.md,
                border: `0.5px solid ${T.gold}`, background: T.goldLight, color: T.gold,
                fontSize: T.fontSize.base, cursor: "pointer", fontFamily: T.fontSerif,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <i className="ti ti-clipboard-check" style={{ fontSize: "0.8125rem" }} />
              貼り付けた棋譜を読み込む
            </button>
          )}
        </div>

        {error && (
          <div style={{ marginBottom: 14, fontSize: T.fontSize.sm, color: T.red, fontFamily: T.fontSerif }}>
            {error}
          </div>
        )}

        {/* ── 1件だけのとき：対局情報を詳しく見せる ── */}
        {single && entries[0].analysis && (() => {
          const e = entries[0];
          const a = e.analysis;
          return (
            <div style={{
              marginBottom: 14, padding: "10px 12px", borderRadius: T.radius.md,
              background: T.goldLight, fontSize: T.fontSize.sm, color: T.ink,
              fontFamily: T.fontSerif, lineHeight: 1.7,
            }}>
              <div>
                <i className="ti ti-check" style={{ fontSize: "0.75rem", color: T.green }} /> {e.snapshots.length - 1}手を読み込みました
                {e.skipped > 0 && `（以降の${e.skipped}手は読み取れませんでした）`}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>先手：{a.senteName || "（記載なし）"}</span>
                <span>後手：{a.goteName || "（記載なし）"}</span>
              </div>
              <div>
                結果：{a.result === "draw" ? "引き分け"
                  : a.result === "sente" ? "先手の勝ち"
                  : a.result === "gote"  ? "後手の勝ち"
                  : "読み取れませんでした（中断など）"}
              </div>
              <div style={{ marginTop: 4 }}>
                <SidePicker entry={e} onChoose={handleChooseSide} />
              </div>
            </div>
          );
        })()}

        {/* ── 複数のとき：一覧で見せる ── */}
        {entries.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <SectionLabel style={{ marginBottom: 4 }}>読み込んだ棋譜（{readable.length}件）</SectionLabel>
            {unresolved > 0 && (
              <div style={{ fontSize: T.fontSize.sm, color: T.brown, fontFamily: T.fontSerif, marginBottom: 6, lineHeight: 1.7 }}>
                {unresolved}件であなたがどちらか分かりません。一度あなたの名前を選べば、同じ名前の棋譜はまとめて判定されます。
              </div>
            )}
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {entries.map((e) => (
                <EntryRow key={e.key} entry={e} onChoose={handleChooseSide} onRemove={handleRemove} />
              ))}
            </div>
          </div>
        )}

        {/* 名前は1件のときだけ編集できる（大量取り込みではファイル名をそのまま使う） */}
        {single && (
          <InputField label="棋譜の名前" value={singleName} onChange={setSingleName} placeholder="例：7/18 対局（先手番・中飛車）" />
        )}

        {/* 戦法タグ（ノード編集画面と同じタグを使う。ここで追加したタグはノード側でも選べる） */}
        {readable.length > 0 && (
          <div style={{ margin: "0 -16px" }}>
            <TagPickerField
              label={entries.length > 1 ? "戦法タグ（任意・全件に付きます）" : "戦法タグ（任意）"}
              text={tags}
              onSelectTag={(next) => setTags(next.join("、"))}
              groups={STRATEGY_GROUPS}
              customTags={customTags}
              onAddCustomTag={onAddCustomTag}
            />
          </div>
        )}

        <ModalActionButtons
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={
            saving ? `保存中… ${progress}/${readable.length}`
            : readable.length > 1 ? `${readable.length}件を保存する`
            : "保存する"
          }
          disabled={readable.length === 0 || saving || (single && !singleName.trim())}
        />
      </div>
    </div>
  );
}

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

// 既定の記録日。手入力は「今日指した対局」を残すのが大半なので今日にする
function todayInputValue() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 記録日から作る既定の棋譜名。日付を変えたら名前も追いかける（下記 nameEdited）。
// 道場の対局を後日まとめて入力すると、名前だけ入力日のままになって
// 一覧で「8/3 の対局」が並び、どれがどれだか分からなくなる
function defaultNameFor(dateValue) {
  const [, m, d] = (dateValue || "").split("-");
  if (!m || !d) return "手入力の対局";
  return `${Number(m)}/${Number(d)} の対局`;
}

function RecordKifuModal({ onClose, onSave, customTags, onAddCustomTag }) {
  const [snapshots, setSnapshots] = useState(null);  // null = まだ記録中
  const [touched,   setTouched]   = useState(false); // 1手でも動かしたか（閉じる前の確認に使う）
  const [emptyWarn, setEmptyWarn] = useState(false); // 0手のまま「記録を終わる」を押した
  const [boardSeq,  setBoardSeq]  = useState(0);     // やり直しのたびに盤を作り直すためのキー

  const [playedAt, setPlayedAt] = useState(todayInputValue);
  const [name,     setName]     = useState(() => defaultNameFor(todayInputValue()));
  // 名前を手で触ったか。触った後に日付を変えても、書いた名前を上書きしない
  const [nameEdited, setNameEdited] = useState(false);
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

  // 結果は「自分の側を選んだとき」だけ必須。傾向分析は勝敗の付いた棋譜しか数えないので
  //（toAnalysisGame が null を返す）、ここで飛ばすと分析に載らない棋譜が黙って出来る。
  // 勝敗を残したくない場合の逃げ道は「記録しない」＝ outcome:"none" で、
  // 選ばせること自体は省かない（省くと「選び忘れ」と「残さない意思」が区別できない）
  const needsOutcome = !!side && !outcome;

  // 保存できない理由（先に出会うものから1つだけ出す）
  const blocker =
    !snapshots       ? "盤に並べて「記録を終わる」を押すと保存できます"
    : !mySide        ? "「あなたはどちら」を選ぶと保存できます。あとから思い出せない項目なので、ここで聞いています"
    : needsOutcome   ? "「結果」を選ぶと保存できます。勝敗の無い棋譜は傾向分析に入りません（残さないなら「記録しない」）"
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

        {/* 記録は止まっていない（ShogiBoard 側で 0手のときは終わらせない）ので、
            「もう一度始めてください」とは言わない。そのまま並べれば記録される */}
        {emptyWarn && (
          <div style={{ marginTop: 10, fontSize: T.fontSize.sm, color: T.red, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
            まだ1手も動かしていません。初手から順に駒を動かしてください（記録は続いています）。
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
        <InputField
          label="棋譜の名前"
          value={name}
          onChange={(v) => { setName(v); setNameEdited(true); }}
          placeholder="例：7/18 道場での対局"
        />

        {/* 記録日と「あなたはどちら」は横並び。日付は幅を取らないので、
            この2つを1行に収めると盤と保存ボタンの距離が縮む */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <SectionLabel style={{ marginBottom: 5 }}>記録日</SectionLabel>
            <input
              type="date"
              value={playedAt}
              // 名前をまだ触っていなければ、既定の名前を新しい日付に合わせ直す
              onChange={(e) => {
                setPlayedAt(e.target.value);
                if (!nameEdited) setName(defaultNameFor(e.target.value));
              }}
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
          disabled={!snapshots || !name.trim() || !mySide || needsOutcome || saving}
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
      ["自分の戦法", f.myStrategy],
      ["相手の戦法", f.oppStrategy],
      ["自分の囲い", castle(f.myCastle)],
      ["相手の囲い", castle(f.oppCastle)],
      ["角交換",     f.bishopExchanged ? "あり" : "なし"],
      ["飛車を振った手", f.swingPly ? `${f.swingPly}手目（${f.swingSpeed}・${f.swingTiming === "先発" ? "自分から決めた" : "相手を見てから決めた"}）` : "振っていません（居飛車）"],
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
          上の「あなた」であなたの名前を選ぶと、その名前を覚えて他の棋譜にも適用されます。
        </div>
      )}
    </div>
  );
}

function KifuPreviewModal({ kifu, onClose, onSetSide, trees = [], onSendToInbox }) {
  // 送り先のツリーを選ぶ状態。ツリーが1つでも選ばせる（誤爆を避ける）
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending,    setSending]    = useState(false);

  const send = async (treeId) => {
    if (sending) return;
    setSending(true);
    await onSendToInbox?.(treeId, kifu);
    setSending(false);
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "90%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink }}>
            {kifu.name}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1.125rem", padding: 2 }}>
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
            置き場所を決めるのは後で良い、という前提で「とりあえず」へ入れる */}
        {onSendToInbox && trees.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {!pickerOpen ? (
              <button
                onClick={() => setPickerOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, width: "100%",
                  padding: "9px 12px", borderRadius: T.radius.md,
                  border: `0.5px dashed ${T.gold}`, background: "transparent",
                  color: T.gold, cursor: "pointer", fontSize: T.fontSize.base, fontFamily: T.fontSerif,
                }}
              >
                <i className="ti ti-git-branch" style={{ fontSize: "0.875rem" }} />
                ツリーの「とりあえず」に入れる
              </button>
            ) : (
              <div>
                <SectionLabel style={{ marginBottom: 6 }}>どのツリーに入れますか</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {trees.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => send(t.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "9px 12px", borderRadius: T.radius.sm,
                        border: `0.5px solid ${T.inkLine}`, background: T.cream,
                        cursor: sending ? "default" : "pointer", opacity: sending ? 0.6 : 1,
                        fontSize: T.fontSize.base, color: T.ink,
                      }}
                    >
                      <i className="ti ti-plant-2" style={{ fontSize: "0.875rem", color: T.gold, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                      <i className="ti ti-chevron-right" style={{ fontSize: "0.8125rem", color: T.gray }} />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 6, fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
                  この棋譜からノードを作り、選んだツリーの「とりあえず」に入れます。置き場所は後から動かせます。
                </div>
              </div>
            )}
          </div>
        )}

        <KifuPreviewBoard snapshots={kifu.snapshots} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// EditKifuModal: 棋譜の名前・戦法タグの変更
// ──────────────────────────────────────────
function EditKifuModal({ kifu, onClose, onSave, customTags, onAddCustomTag }) {
  const [name,   setName]   = useState(kifu.name);
  const [tags,   setTags]   = useState((kifu.tags || []).join("、"));
  const [memo,   setMemo]   = useState(kifu.memo || "");
  const [saving, setSaving] = useState(false);

  // 保存の完了（成否）を待ってから閉じる。待たずに閉じると、失敗時に
  // モーダルだけ閉じて一覧が古い名前のまま残ったように見えてしまう
  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    await onSave(kifu.id, { name: name.trim(), tags: parseTags(tags), memo: memo.trim() });
    setSaving(false);
    onClose();
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "85%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, marginBottom: 20 }}>
          棋譜を編集
        </div>
        <InputField label="棋譜の名前" value={name} onChange={setName} placeholder="例：7/18 対局（先手番・中飛車）" />
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
        <ModalActionButtons
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel={saving ? "保存中..." : "保存する"}
          disabled={!name.trim() || saving}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// KifuCard: 棋譜一覧の1行カード
// ══════════════════════════════════════════════════════════════════
function KifuCard({ kifu, onOpen, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const handleMenuToggle = (e) => { e.stopPropagation(); setMenuOpen((v) => !v); };
  const handleRename     = (e) => { e.stopPropagation(); setMenuOpen(false); onRename(kifu); };
  const handleDelete     = (e) => { e.stopPropagation(); setMenuOpen(false); onDelete(kifu); };

  return (
    <div style={{ position: "relative", marginBottom: 10 }}>
      <div
        onClick={() => onOpen(kifu)}
        style={{
          padding:      "14px 16px",
          borderRadius: T.radius.lg,
          border:       "0.5px solid rgba(200,169,110,0.35)",
          background:   T.goldBg,
          cursor:       "pointer",
          transition:   "all 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.gold)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(200,169,110,0.35)")}
      >
        {/* 1行目: 名前 + メニューボタン */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: T.fontSize.xxl, fontWeight: 600, color: T.ink, fontFamily: T.fontTitle, flex: 1 }}>
            {kifu.name}
          </span>
          <button
            onClick={handleMenuToggle}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1rem", padding: "2px 4px", borderRadius: 6, lineHeight: 1 }}
          >
            <i className="ti ti-dots-vertical" />
          </button>
        </div>

        {/* 2行目: 戦法タグ */}
        {(kifu.tags || []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
            {kifu.tags.map((tag) => (
              <span key={tag} style={{ fontSize: T.fontSize.sm, padding: "3px 9px", borderRadius: T.radius.sm, background: T.goldLight, color: T.gold, fontFamily: T.fontSerif }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 3行目: 勝敗 / 戦法 / 手数 / 保存日 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {(() => {
            const o = outcomeLabel(kifu);
            return o && (
              <span style={{
                fontSize: T.fontSize.sm, fontFamily: T.fontSerif, color: o.color,
                border: `0.5px solid ${o.color}`, borderRadius: T.radius.sm, padding: "1px 7px",
              }}>{o.text}</span>
            );
          })()}
          {/* 自動で読み取れた戦型。ここが埋まっている棋譜だけが傾向分析に載る */}
          {kifu.features && (
            <span style={{ fontSize: T.fontSize.sm, color: T.brown, fontFamily: T.fontSerif }}>
              {kifu.features.myStrategy} 対 {kifu.features.oppStrategy}
            </span>
          )}
          <span style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>
            <i className="ti ti-chess" style={{ fontSize: "0.625rem", marginRight: 3 }} />
            {kifu.moveCount}手
          </span>
          <span style={{ fontSize: T.fontSize.sm, color: T.inkFaint, marginLeft: "auto", fontFamily: T.fontSerif }}>
            {formatDate(kifu.playedAt || kifu.createdAt)}
          </span>
        </div>
      </div>

      {/* コンテキストメニュー */}
      {menuOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
          <div style={{
            position: "absolute", top: 10, right: 0, zIndex: 50,
            background: T.cream, borderRadius: T.radius.md,
            border: "0.5px solid rgba(200,169,110,0.5)",
            boxShadow: "0 6px 24px rgba(26,15,0,0.15)",
            overflow: "hidden", minWidth: 140,
          }}>
            <div
              onClick={handleRename}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", fontSize: T.fontSize.lg, cursor: "pointer", color: T.ink, fontFamily: T.fontSerif }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="ti ti-pencil" style={{ fontSize: "0.875rem", color: T.gold }} />名前・タグ・メモを編集
            </div>
            <div style={{ height: "0.5px", background: T.inkLineFaint }} />
            <div
              onClick={handleDelete}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", fontSize: T.fontSize.lg, cursor: "pointer", color: T.red, fontFamily: T.fontSerif }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.redBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="ti ti-trash" style={{ fontSize: "0.875rem" }} />削除
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// KifuList: 棋譜ライブラリ画面
// ══════════════════════════════════════════════════════════════════
export function KifuList({ userId, trees = [], onBack, onInsight, onSendToInbox }) {
  const [kifus,   setKifus]   = useState([]);
  const [loading, setLoading] = useState(true);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [previewTarget,   setPreviewTarget]   = useState(null); // snapshots込みの棋譜
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [editTarget,      setEditTarget]      = useState(null);
  const [deleteTarget,    setDeleteTarget]    = useState(null);
  // 戦法タグはノード編集画面と同じユーザー資産（profiles）を共有する
  const [customTags,      setCustomTags]      = useState(() => getCustomTagsByGroup());

  const handleAddCustomTag = (tag, group) => {
    addCustomTag(tag, group);
    setCustomTags(getCustomTagsByGroup());
    recordAction("customTag");
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchMyKifus(userId).then(({ data }) => {
      if (cancelled) return;
      setKifus((data || []).map(kifuRowToKifu));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // 取り込み（1件でも複数件でも同じ経路を通る）。
  // 保存できた件数を返し、途中で失敗しても残りの保存は続ける
  // （50件中1件のパースミスで全部やり直しになるのを避けるため）。
  const handleImportMany = async (items, onProgress) => {
    const saved = [];
    for (const it of items) {
      const { data, error } = await createKifu({
        userId,
        name:       it.name,
        tags:       it.tags,
        snapshots:  it.snapshots,
        sourceText: it.sourceText,
        // 取り込み時に解析済みの対局情報を一緒に保存する。
        // 特徴（features）は自分の側が決まって初めて計算できるので、
        // 側を手で選び直した場合に備えてここで計算し直す。
        senteName: it.analysis?.senteName,
        goteName:  it.analysis?.goteName,
        handicap:  it.analysis?.handicap,
        result:    it.analysis?.result ?? null,
        mySide:    it.analysis?.mySide ?? null,
        playedAt:  it.analysis?.playedAt ?? null,
        features:  recomputeFeatures({
          snapshots: it.snapshots,
          mySide:    it.analysis?.mySide ?? null,
          handicap:  it.analysis?.handicap,
        }),
        metaParsed: true,
      });
      if (!error && data) saved.push(kifuRowToKifu(data));
      onProgress?.(saved.length);
    }
    if (saved.length > 0) setKifus((prev) => [...saved, ...prev]);
    return saved.length;
  };

  // 盤に並べて作った棋譜を保存する（棋譜入力）。
  // 原文（sourceText）は無いが、対局情報は利用者が答えたものが揃っているので
  // metaParsed: true にする。false にすると「未解析の棋譜」として後追い解析に拾われ、
  // 空の原文を読み直した結果で先後や勝敗が消える。
  const handleSaveRecorded = async ({ name, tags, memo, snapshots, mySide, result, playedAt }) => {
    const { data, error } = await createKifu({
      userId, name, tags, memo, snapshots,
      // 手入力は初期配置から並べるので必ず平手（特徴を計算してよい）
      handicap: "平手",
      result, mySide, playedAt,
      features: recomputeFeatures({ snapshots, mySide, handicap: "平手" }),
      metaParsed: true,
    });
    if (error || !data) return false;
    setKifus((prev) => [kifuRowToKifu(data), ...prev]);
    // トロフィー「棋譜記録者（盤面に棋譜を記録する）」は、ノードの盤で録ったときと
    // 同じ達成なので、ここでも記録する
    recordAction("kifu");
    return true;
  };

  // 保存済み棋譜の先後を手で決める。
  // 選んだ名前を覚えるので、以降の取り込みと「まとめて解析する」でも同じ判定になる。
  const handleSetSide = async (kifu, side) => {
    const name = side === "sente" ? kifu.senteName : kifu.goteName;
    if (name) addKifuPlayerName(name);
    const features = recomputeFeatures({
      snapshots: kifu.snapshots, mySide: side, handicap: kifu.handicap,
    });
    const { error } = await updateKifu(kifu.id, { mySide: side, features });
    if (error) { alert("保存に失敗しました。もう一度お試しください。"); return; }
    const patch = { mySide: side, features };
    setKifus((prev) => prev.map((k) => (k.id === kifu.id ? { ...k, ...patch } : k)));
    setPreviewTarget((t) => (t && t.id === kifu.id ? { ...t, ...patch } : t));
  };

  // カードタップ → snapshots込みで取得して再生プレビューを開く
  const handleOpen = async (kifu) => {
    if (previewLoading) return;
    setPreviewLoading(true);
    const { data, error } = await fetchKifu(kifu.id);
    setPreviewLoading(false);
    if (error || !data) {
      alert("棋譜の読み込みに失敗しました。もう一度お試しください。");
      return;
    }
    setPreviewTarget(kifuRowToKifu(data));
  };

  const handleEdit = async (kifuId, patch) => {
    const { error } = await updateKifu(kifuId, patch);
    if (error) { alert("保存に失敗しました。もう一度お試しください。"); return; }
    setKifus((prev) => prev.map((k) => (k.id === kifuId ? { ...k, ...patch } : k)));
  };

  const handleDelete = async (kifuId) => {
    const { error } = await deleteKifu(kifuId);
    if (error) { alert("削除に失敗しました。もう一度お試しください。"); return; }
    setKifus((prev) => prev.filter((k) => k.id !== kifuId));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* ── ヘッダー ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 18px 12px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <button onClick={onBack} aria-label="ツリー一覧にもどる" style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2, lineHeight: 1 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: "1.125rem", color: T.ink, letterSpacing: "0.1em" }}>
          棋譜ライブラリ
        </div>
        {/* ためた棋譜の傾向を見る画面へ。読み取り専用で、ツリーには手を加えない */}
        <button
          onClick={onInsight}
          aria-label="棋譜の傾向"
          title="棋譜の傾向"
          style={{
            background: "none", border: "none", cursor: "pointer", color: T.gold,
            fontSize: "1.125rem", padding: 2, lineHeight: 1, marginRight: 4,
          }}
        >
          <i className="ti ti-chart-histogram" />
        </button>
        {/* 盤に並べて棋譜を作る。ヘッダーは横幅が足りないので絵だけのボタンにし、
            読み上げとテストから指せるよう aria-label で名前を付ける
            （アイコンフォントは ::before で文字を差し込むため title だけでは足りない） */}
        <button
          data-onboard="kifu-record"
          onClick={() => setShowRecordModal(true)}
          aria-label="棋譜入力"
          title="棋譜入力（盤に並べて作る）"
          style={{
            background: "none", border: "none", cursor: "pointer", color: T.gold,
            fontSize: "1.125rem", padding: 2, lineHeight: 1, marginRight: 4,
          }}
        >
          <i className="ti ti-record-mail" />
        </button>
        <button
          data-onboard="kifu-save"
          onClick={() => setShowImportModal(true)}
          style={{ background: T.gold, border: "none", cursor: "pointer", color: T.cream, fontSize: T.fontSize.lg, padding: "6px 14px", borderRadius: T.radius.md, fontFamily: T.fontSerif, display: "flex", alignItems: "center", gap: 4 }}
        >
          <i className="ti ti-plus" style={{ fontSize: "0.8125rem" }} /> 棋譜を保存
        </button>
      </div>

      {/* ── リスト ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.inkFaint, fontSize: T.fontSize.base }}>
            読み込み中...
          </div>
        ) : kifus.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.inkFaint, fontSize: T.fontSize.lg }}>
            <i className="ti ti-chess" style={{ fontSize: "2.5rem", display: "block", marginBottom: 12 }} />
            保存した棋譜がまだありません<br />
            <span style={{ fontSize: T.fontSize.md }}>「棋譜を保存」から実戦の棋譜を貯めておき、<br />ノード編集画面から研究に取り込めます</span>
            {/* 棋譜ファイルが手に入らない対局（道場・大会・棋書）はここから作れる。
                ヘッダーの絵だけのボタンでは気づけないので、空のときは言葉で出す */}
            <button
              onClick={() => setShowRecordModal(true)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                margin: "20px auto 0", padding: "9px 16px", borderRadius: T.radius.md,
                border: `0.5px dashed ${T.gold}`, background: "transparent",
                color: T.gold, cursor: "pointer", fontSize: T.fontSize.base, fontFamily: T.fontSerif,
              }}
            >
              <i className="ti ti-record-mail" style={{ fontSize: "0.875rem" }} />
              棋譜ファイルが無いときは、盤に並べて入力する
            </button>
          </div>
        ) : (
          kifus.map((k) => (
            <KifuCard key={k.id} kifu={k} onOpen={handleOpen} onRename={setEditTarget} onDelete={setDeleteTarget} />
          ))
        )}
      </div>

      {/* ── モーダル群 ── */}
      {showImportModal && (
        <ImportKifuModal
          onClose={() => setShowImportModal(false)}
          onImportMany={handleImportMany}
          customTags={customTags}
          onAddCustomTag={handleAddCustomTag}
        />
      )}
      {showRecordModal && (
        <RecordKifuModal
          onClose={() => setShowRecordModal(false)}
          onSave={handleSaveRecorded}
          customTags={customTags}
          onAddCustomTag={handleAddCustomTag}
        />
      )}
      {previewTarget && (
        <KifuPreviewModal
          kifu={previewTarget}
          onClose={() => setPreviewTarget(null)}
          // onSetSide / trees / onSendToInbox を渡し忘れると、モーダル側は
          // 「ツリーへ送る」を丸ごと出さず（onSendToInbox && trees.length > 0 で判定）、
          // 先後の選択ボタンも onSetSide?.() が no-op になって黙って効かなくなる。
          // 見た目が壊れないぶん気づきにくいので、消さないこと。
          onSetSide={(side) => handleSetSide(previewTarget, side)}
          trees={trees}
          onSendToInbox={onSendToInbox}
        />
      )}
      {editTarget && (
        <EditKifuModal
          kifu={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
          customTags={customTags}
          onAddCustomTag={handleAddCustomTag}
        />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          title={`「${deleteTarget.name}」を削除しますか？`}
          message={<>ノードに取り込み済みの棋譜には影響しません。<br />この操作は取り消せません。</>}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget.id)}
        />
      )}
    </div>
  );
}
