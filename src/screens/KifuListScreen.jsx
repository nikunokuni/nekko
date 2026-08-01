// ══════════════════════════════════════════════════════════════════
// KifuListScreen.jsx  ―  棋譜ライブラリ画面
//   KifuCard / KifuList / ImportKifuModal / KifuPreviewModal /
//   EditKifuModal / DeleteKifuModal
//   棋譜（kifus テーブル）の一覧・インポート・再生・削除を行う。
//   ノードへの取り込みはノード編集画面側（KifuPickerModal）から行う。
// ══════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { T, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE, parseTags } from "../theme";
import { InputField, SectionLabel, ModalActionButtons, ConfirmDeleteModal, KifuPreviewBoard, TagPickerField } from "../components/uiParts";
import { STRATEGY_GROUPS } from "../data";
import { recordAction, getCustomTagsByGroup, addCustomTag, getKifuPlayerNames, addKifuPlayerName } from "../rewards";
import { importKifuText } from "../kifuParser";
import { readKifuFile } from "../kifuFile";
import { analyzeKifu, recomputeFeatures, resolveMySide, outcomeFor } from "../kifuAnalyze";
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

function KifuPreviewModal({ kifu, onClose, onSetSide }) {
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
  const [saving, setSaving] = useState(false);

  // 保存の完了（成否）を待ってから閉じる。待たずに閉じると、失敗時に
  // モーダルだけ閉じて一覧が古い名前のまま残ったように見えてしまう
  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    await onSave(kifu.id, { name: name.trim(), tags: parseTags(tags) });
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
              <i className="ti ti-pencil" style={{ fontSize: "0.875rem", color: T.gold }} />名前・タグを編集
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
export function KifuList({ userId, onBack, onInsight }) {
  const [kifus,   setKifus]   = useState([]);
  const [loading, setLoading] = useState(true);

  const [showImportModal, setShowImportModal] = useState(false);
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
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2, lineHeight: 1 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: "1.125rem", color: T.ink, letterSpacing: "0.1em" }}>
          棋譜ライブラリ
        </div>
        {/* ためた棋譜の傾向を見る画面へ。読み取り専用で、ツリーには手を加えない */}
        <button
          onClick={onInsight}
          title="棋譜の傾向"
          style={{
            background: "none", border: "none", cursor: "pointer", color: T.gold,
            fontSize: "1.125rem", padding: 2, lineHeight: 1, marginRight: 4,
          }}
        >
          <i className="ti ti-chart-histogram" />
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
      {previewTarget && (
        <KifuPreviewModal kifu={previewTarget} onClose={() => setPreviewTarget(null)} />
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
