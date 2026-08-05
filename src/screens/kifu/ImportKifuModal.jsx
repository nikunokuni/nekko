// ══════════════════════════════════════════════════════════════════
// screens/kifu/ImportKifuModal.jsx  ―  棋譜ファイル／テキストの取り込み
//   棋譜ライブラリ（KifuListScreen）から開く。1画面で完結するので
//   モーダル単位でファイルを分けてある。
// ══════════════════════════════════════════════════════════════════
import { useState } from "react";
import { T, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE, parseTags } from "../../theme";
import { InputField, SectionLabel, ModalActionButtons, TagPickerField } from "../../components/uiParts";
import { STRATEGY_GROUPS } from "../../data";
import { getKifuPlayerNames, addKifuPlayerName } from "../../rewards";
import { importKifuText } from "../../kifuParser";
import { readKifuFile } from "../../kifuFile";
import { analyzeKifu, resolveMySide } from "../../kifuAnalyze";
import { outcomeLabel } from "./shared";

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

// まだ「あなたはどちら？」を聞く必要があるか。
// 登録済みの名前と一致した棋譜は黙って確定させ、聞かない。
// 取り込みは何十件もまとめて行うので、答えの分かっていることまで並べて出すと
// 「全部に目を通して選ばないといけない画面」に見えてしまう。
function needsAsking(entry) {
  return !!entry.analysis && entry.sideOverride == null && !entry.analysis.mySide;
}

// 確定済みの側を「聞かずに」見せる行。押せば選び直せる（黙って決めた結果は必ず見せる）
function SideConfirmed({ entry, onReveal }) {
  const a = entry.analysis;
  const side = effectiveSide(entry);
  const label = side === "sente" ? `あなた：${a.senteName || "先手"}（先手）`
              : side === "gote"  ? `あなた：${a.goteName  || "後手"}（後手）`
              : "分析しない";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: T.fontSize.sm, color: T.grayText, fontFamily: T.fontSerif }}>
        {side && <i className="ti ti-check" style={{ fontSize: "0.75rem", color: T.green, marginRight: 4 }} />}
        {label}
      </span>
      <button
        onClick={() => onReveal(entry.key)}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
          color: T.gold, fontSize: T.fontSize.sm, fontFamily: T.fontSerif, textDecoration: "underline",
        }}
      >変更</button>
    </div>
  );
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
function EntryRow({ entry, onChoose, onRemove, revealed, onReveal }) {
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
        : (needsAsking(entry) || revealed)
          ? <SidePicker entry={entry} onChoose={onChoose} compact />
          : <SideConfirmed entry={entry} onReveal={onReveal} />}
    </div>
  );
}

export function ImportKifuModal({ onClose, onImportMany, customTags, onAddCustomTag, onGoSettings }) {
  const [entries,   setEntries]   = useState([]);
  const [tags,      setTags]      = useState("");   // 「、」区切りの戦法タグ（TagPickerField の形式）
  const [singleName, setSingleName] = useState(""); // 1件だけのときに編集できる名前
  const [pasteText, setPasteText] = useState("");
  const [error,     setError]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [progress,  setProgress]  = useState(0);
  // 覚えている対局者名。この場で新しく覚えたぶんも即座に反映する
  const [playerNames, setPlayerNames] = useState(() => getKifuPlayerNames());
  // 「変更」を押して選び直しに開いた棋譜。自動で決まったものは既定では聞かない
  const [revealed, setRevealed] = useState(() => new Set());
  const reveal = (key) => setRevealed((prev) => new Set(prev).add(key));

  const readable = entries.filter((e) => e.snapshots);
  const single   = entries.length === 1 && !entries[0].error;
  // 名前が分からず自分の側を決められていない棋譜（先に解決してほしいので数える）
  const unresolved = readable.filter((e) => effectiveSide(e) === null && e.sideOverride !== "none").length;
  // 自動で決まった棋譜（＝聞かずに済ませたぶん）。何件を黙って決めたかは必ず出す
  const autoResolved = readable.filter((e) => e.sideOverride == null && e.analysis?.mySide).length;

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
    // 答えた棋譜は選択肢を出したままにする。答えた瞬間にボタンが消えると
    // 「押せたのか」「取り消せるのか」が分からなくなるため
    reveal(key);
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
                {(needsAsking(e) || revealed.has(e.key))
                  ? <SidePicker entry={e} onChoose={handleChooseSide} />
                  : <SideConfirmed entry={e} onReveal={reveal} />}
              </div>
            </div>
          );
        })()}

        {/* 名前が一致せず聞くことになった棋譜がある＝別のアプリの名前が未登録の可能性が高い。
            その場で選べば覚えるが、設定に足しておけば次の取り込みから聞かれなくなる */}
        {unresolved > 0 && (
          <div style={{
            marginBottom: 14, padding: "10px 12px", borderRadius: T.radius.md,
            background: T.goldLight, fontSize: T.fontSize.sm, color: T.brown,
            fontFamily: T.fontSerif, lineHeight: 1.7,
          }}>
            {unresolved}件であなたがどちらか分かりません。名前を一度選べば、次からは自動で判定します。
            <div style={{ marginTop: 4, color: T.inkMid }}>
              将棋アプリごとに名前が違う場合は、
              {onGoSettings
                ? <button
                    onClick={onGoSettings}
                    style={{
                      background: "none", border: "none", padding: "0 2px", cursor: "pointer",
                      color: T.gold, fontSize: T.fontSize.sm, fontFamily: T.fontSerif, textDecoration: "underline",
                    }}
                  >設定の「棋譜での自分の名前」</button>
                : "設定の「棋譜での自分の名前」"}
              にすべての名前を登録しておくと、次からは聞かれません。
            </div>
          </div>
        )}

        {/* ── 複数のとき：一覧で見せる ── */}
        {entries.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <SectionLabel style={{ marginBottom: 4 }}>読み込んだ棋譜（{readable.length}件）</SectionLabel>
            {autoResolved > 0 && (
              <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, marginBottom: 6, lineHeight: 1.7 }}>
                <i className="ti ti-check" style={{ fontSize: "0.75rem", color: T.green, marginRight: 4 }} />
                {autoResolved}件は登録済みの名前と一致したので、先後を自動で決めました
              </div>
            )}
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {entries.map((e) => (
                <EntryRow
                  key={e.key} entry={e}
                  onChoose={handleChooseSide} onRemove={handleRemove}
                  revealed={revealed.has(e.key)} onReveal={reveal} />
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
