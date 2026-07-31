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
import { recordAction, getCustomTagsByGroup, addCustomTag, getKifuPlayerNames } from "../rewards";
import { importKifuText } from "../kifuParser";
import { readKifuFile } from "../kifuFile";
import { analyzeKifu, recomputeFeatures, outcomeFor } from "../kifuAnalyze";
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
// ──────────────────────────────────────────
function ImportKifuModal({ onClose, onImport, customTags, onAddCustomTag }) {
  const [name,      setName]      = useState("");
  const [tags,      setTags]      = useState("");   // 「、」区切りの戦法タグ（TagPickerField の形式）
  const [fileName,  setFileName]  = useState("");
  const [pasteText, setPasteText] = useState("");
  const [snapshots, setSnapshots] = useState(null);
  const [sourceText, setSourceText] = useState("");
  const [analysis,  setAnalysis]  = useState(null);  // 読み取れた対局情報（確認表示用）
  const [error,     setError]     = useState("");
  const [saving,    setSaving]    = useState(false);
  // 自分の側の自動判定に対する利用者の上書き。
  //   null   … 上書きなし（自動判定に従う）
  //   "none" … 明示的に「分析しない」を選んだ（自動判定に戻さない）
  const [sideOverride, setSideOverride] = useState(null);
  const mySide = sideOverride === "none" ? null : (sideOverride ?? analysis?.mySide ?? null);

  // KIF/CSAテキストをパースして読み込み結果を反映する（ファイル・貼り付け共通）
  const applyText = (text, defaultName) => {
    setError("");
    setSnapshots(null);
    setAnalysis(null);
    setSideOverride(null);   // 別の棋譜を読み直したら側の手動指定はリセットする
    const result = importKifuText(text);
    // 1手も読めなかった場合（形式違い・全手が解析不能・指し手なし）は保存対象にしない。
    // 初期局面だけの棋譜（0手）を登録しても意味がないため
    if (!result || result.snapshots.length <= 1) {
      setError("棋譜の手を読み取れませんでした（KIF/CSA形式のテキストか確認してください）");
      return;
    }
    if (result.skipped > 0) {
      setError(`途中に読み取れない手があったため、第${result.snapshots.length - 1}手までを読み込みました（以降の${result.skipped}手は反映されません）`);
    }
    setSnapshots(result.snapshots);
    setSourceText(text);
    // 対局者名・勝敗・戦法をこの場で判定して見せる。
    // 自分の側の自動判定が外れていることに保存前に気づけるようにするため。
    setAnalysis(analyzeKifu({
      sourceText: text,
      snapshots:  result.snapshots,
      playerNames: getKifuPlayerNames(),
    }));
    if (defaultName && !name.trim()) setName(defaultName);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    // 同じファイルをもう一度選んでも change が発火するよう value をリセットする
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await readKifuFile(file);
      applyText(text, file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      console.error("棋譜の読み込みに失敗しました", err);
      setError("棋譜の読み込みに失敗しました");
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !snapshots || saving) return;
    setSaving(true);
    const ok = await onImport(name.trim(), snapshots, sourceText, parseTags(tags), { ...analysis, mySide });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "85%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, marginBottom: 20 }}>
          棋譜を保存
        </div>

        {/* ファイル選択 */}
        <div style={{ marginBottom: 14 }}>
          <SectionLabel style={{ marginBottom: 8 }}>ファイルから（KIF/CSA）</SectionLabel>
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
            {fileName || "KIF / CSA ファイルを選択"}
          </label>
          <input
            id="kifu-lib-file-input"
            type="file"
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
              onClick={() => { setFileName(""); applyText(pasteText); }}
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

        {/* 読み込み結果 */}
        {snapshots && (
          <div style={{ marginBottom: 14, fontSize: T.fontSize.sm, color: T.green, fontFamily: T.fontSerif }}>
            <i className="ti ti-check" style={{ fontSize: "0.75rem" }} /> {snapshots.length - 1}手の棋譜を読み込みました
          </div>
        )}

        {/* 読み取れた対局情報。傾向分析はここが埋まっている棋譜だけを対象にする */}
        {analysis && (
          <div style={{
            marginBottom: 14, padding: "10px 12px", borderRadius: T.radius.md,
            background: T.goldLight, fontSize: T.fontSize.sm, color: T.ink,
            fontFamily: T.fontSerif, lineHeight: 1.7,
          }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>先手：{analysis.senteName || "（記載なし）"}</span>
              <span>後手：{analysis.goteName || "（記載なし）"}</span>
            </div>
            <div>
              結果：{analysis.result === "draw" ? "引き分け"
                : analysis.result === "sente" ? "先手の勝ち"
                : analysis.result === "gote"  ? "後手の勝ち"
                : "読み取れませんでした（中断など）"}
            </div>
            {/* 自分がどちら側かは対局者名から自動判定する。
                設定に名前を登録していない・表記ゆれで外れた場合はここで直せる */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              <span>自分は</span>
              {[["sente", "先手"], ["gote", "後手"], ["none", "分析しない"]].map(([v, label]) => {
                const selected = v === "none" ? mySide === null : mySide === v;
                return (
                  <button
                    key={v}
                    onClick={() => setSideOverride(v)}
                    style={{
                      padding: "3px 10px", borderRadius: T.radius.sm, cursor: "pointer",
                      fontFamily: T.fontSerif, fontSize: T.fontSize.sm,
                      border: `0.5px solid ${selected ? T.gold : T.inkLine}`,
                      background: selected ? T.gold : "transparent",
                      color: selected ? T.cream : T.grayText,
                    }}
                  >{label}</button>
                );
              })}
            </div>
            {!analysis.mySide && sideOverride === null && (
              <div style={{ color: T.grayText, fontSize: T.fontSize.xs, marginTop: 2 }}>
                設定に「棋譜での自分の名前」を登録すると、次回から自動で判定します
              </div>
            )}
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 14, fontSize: T.fontSize.sm, color: T.red, fontFamily: T.fontSerif }}>
            {error}
          </div>
        )}

        <InputField label="棋譜の名前" value={name} onChange={setName} placeholder="例：7/18 対局（先手番・中飛車）" />

        {/* 戦法タグ（ノード編集画面と同じタグを使う。ここで追加したタグはノード側でも選べる） */}
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
          onConfirm={handleSave}
          confirmLabel={saving ? "保存中..." : "保存する"}
          disabled={!name.trim() || !snapshots || saving}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// KifuPreviewModal: 保存済み棋譜の再生ビュー
// ──────────────────────────────────────────
function KifuPreviewModal({ kifu, onClose }) {
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

  const handleImport = async (name, snapshots, sourceText, tags, analysis) => {
    const { data, error } = await createKifu({
      userId, name, tags, snapshots, sourceText,
      // 取り込み時に解析済みの対局情報を一緒に保存する。
      // 特徴（features）は自分の側が決まって初めて計算できるので、
      // 側を手で選び直した場合はここで計算し直す。
      senteName: analysis?.senteName,
      goteName:  analysis?.goteName,
      handicap:  analysis?.handicap,
      result:    analysis?.result ?? null,
      mySide:    analysis?.mySide ?? null,
      playedAt:  analysis?.playedAt ?? null,
      features:  recomputeFeatures({
        snapshots,
        mySide:   analysis?.mySide ?? null,
        handicap: analysis?.handicap,
      }),
      metaParsed: true,
    });
    if (error || !data) {
      alert("棋譜の保存に失敗しました。もう一度お試しください。");
      return false;
    }
    setKifus((prev) => [kifuRowToKifu(data), ...prev]);
    return true;
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
          onImport={handleImport}
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
