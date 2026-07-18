// ══════════════════════════════════════════════════════════════════
// KifuListScreen.jsx  ―  棋譜ライブラリ画面
//   KifuCard / KifuList / ImportKifuModal / KifuPreviewModal /
//   RenameKifuModal / DeleteKifuModal
//   棋譜（kifus テーブル）の一覧・インポート・再生・削除を行う。
//   ノードへの取り込みはノード編集画面側（KifuPickerModal）から行う。
// ══════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { T, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE } from "../theme";
import { InputField, SectionLabel, ModalActionButtons } from "../components/uiParts";
import { importKifuText } from "../kifuParser";
import { readKifuFile } from "../kifuFile";
import { fetchMyKifus, fetchKifu, createKifu, updateKifu, deleteKifu, kifuRowToKifu } from "../db";
import ShogiBoard from "../ShogiBoard";

// 一覧カードの日付表示（例: 2026/7/18）
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// ──────────────────────────────────────────
// ImportKifuModal: ファイル選択 or テキスト貼り付けで棋譜を登録
// ──────────────────────────────────────────
function ImportKifuModal({ onClose, onImport }) {
  const [name,      setName]      = useState("");
  const [fileName,  setFileName]  = useState("");
  const [pasteText, setPasteText] = useState("");
  const [snapshots, setSnapshots] = useState(null);
  const [sourceText, setSourceText] = useState("");
  const [error,     setError]     = useState("");
  const [saving,    setSaving]    = useState(false);

  // KIF/CSAテキストをパースして読み込み結果を反映する（ファイル・貼り付け共通）
  const applyText = (text, defaultName) => {
    setError("");
    setSnapshots(null);
    const result = importKifuText(text);
    if (!result) {
      setError("棋譜を読み取れませんでした（KIF/CSA形式のテキストか確認してください）");
      return;
    }
    if (result.skipped > 0) {
      setError(`途中に読み取れない手があったため、第${result.snapshots.length - 1}手までを読み込みました（以降の${result.skipped}手は反映されません）`);
    }
    setSnapshots(result.snapshots);
    setSourceText(text);
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
    const ok = await onImport(name.trim(), snapshots, sourceText);
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
        {error && (
          <div style={{ marginBottom: 14, fontSize: T.fontSize.sm, color: T.red, fontFamily: T.fontSerif }}>
            {error}
          </div>
        )}

        <InputField label="棋譜の名前" value={name} onChange={setName} placeholder="例：7/18 対局（先手番・中飛車）" />

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
  const snaps = kifu.snapshots || [];
  const last  = snaps.length > 0 ? snaps[snaps.length - 1] : null;
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
        {last ? (
          // 閲覧専用の盤面 + 既存の棋譜再生ナビをそのまま使う
          <ShogiBoard
            board={last.board}
            handSente={last.handSente}
            handGote={last.handGote}
            kifu={snaps}
            readOnly
          />
        ) : (
          <div style={{ padding: "24px 0", textAlign: "center", color: T.inkFaint, fontSize: T.fontSize.base }}>
            この棋譜には局面がありません
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// RenameKifuModal: 棋譜の名前変更
// ──────────────────────────────────────────
function RenameKifuModal({ kifu, onClose, onSave }) {
  const [name, setName] = useState(kifu.name);
  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={MODAL_SHEET_STYLE} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, marginBottom: 20 }}>
          棋譜の名前を変更
        </div>
        <InputField label="棋譜の名前" value={name} onChange={setName} placeholder="例：7/18 対局（先手番・中飛車）" />
        <ModalActionButtons
          onCancel={onClose}
          onConfirm={() => { onSave(kifu.id, name.trim()); onClose(); }}
          confirmLabel="保存する"
          disabled={!name.trim()}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// DeleteKifuModal: 棋譜削除確認
// ──────────────────────────────────────────
function DeleteKifuModal({ kifu, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const handleConfirm = async () => {
    setDeleting(true);
    await onConfirm(kifu.id);
    setDeleting(false);
    onClose();
  };
  return (
    <div
      style={{
        position: "absolute", inset: 0, background: "rgba(26,15,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 360, background: T.cream, borderRadius: T.radius.xl, padding: "28px 24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: T.redBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-trash" style={{ fontSize: "1.375rem", color: T.red }} />
          </div>
        </div>
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.xxl, color: T.ink, textAlign: "center", marginBottom: 8 }}>
          「{kifu.name}」を削除しますか？
        </div>
        <div style={{ fontSize: T.fontSize.base, color: "rgba(26,15,0,0.45)", textAlign: "center", marginBottom: 24, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
          ノードに取り込み済みの棋譜には影響しません。<br />この操作は取り消せません。
        </div>
        <ModalActionButtons
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel={deleting ? "削除中..." : "削除する"}
          disabled={deleting}
          danger
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

        {/* 2行目: 手数 / 保存日 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>
            <i className="ti ti-chess" style={{ fontSize: "0.625rem", marginRight: 3 }} />
            {kifu.moveCount}手
          </span>
          <span style={{ fontSize: T.fontSize.sm, color: T.inkFaint, marginLeft: "auto", fontFamily: T.fontSerif }}>
            {formatDate(kifu.createdAt)}
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
              <i className="ti ti-pencil" style={{ fontSize: "0.875rem", color: T.gold }} />名前を変更
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
export function KifuList({ userId, onBack }) {
  const [kifus,   setKifus]   = useState([]);
  const [loading, setLoading] = useState(true);

  const [showImportModal, setShowImportModal] = useState(false);
  const [previewTarget,   setPreviewTarget]   = useState(null); // snapshots込みの棋譜
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [renameTarget,    setRenameTarget]    = useState(null);
  const [deleteTarget,    setDeleteTarget]    = useState(null);

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

  const handleImport = async (name, snapshots, sourceText) => {
    const { data, error } = await createKifu({ userId, name, snapshots, sourceText });
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

  const handleRename = async (kifuId, name) => {
    const { error } = await updateKifu(kifuId, { name });
    if (error) { alert("保存に失敗しました。もう一度お試しください。"); return; }
    setKifus((prev) => prev.map((k) => (k.id === kifuId ? { ...k, name } : k)));
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
        <button
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
            <KifuCard key={k.id} kifu={k} onOpen={handleOpen} onRename={setRenameTarget} onDelete={setDeleteTarget} />
          ))
        )}
      </div>

      {/* ── モーダル群 ── */}
      {showImportModal && (
        <ImportKifuModal onClose={() => setShowImportModal(false)} onImport={handleImport} />
      )}
      {previewTarget && (
        <KifuPreviewModal kifu={previewTarget} onClose={() => setPreviewTarget(null)} />
      )}
      {renameTarget && (
        <RenameKifuModal kifu={renameTarget} onClose={() => setRenameTarget(null)} onSave={handleRename} />
      )}
      {deleteTarget && (
        <DeleteKifuModal kifu={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
      )}
    </div>
  );
}
