// ══════════════════════════════════════════════════════════════════
// screens/kifu/EditKifuModal.jsx  ―  棋譜の名前・戦法タグの変更
//   棋譜ライブラリ（KifuListScreen）から開く。
// ══════════════════════════════════════════════════════════════════
import { useState } from "react";
import { T, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE, parseTags } from "../../theme";
import { InputField, SectionLabel, ModalActionButtons, TagPickerField } from "../../components/uiParts";
import { STRATEGY_GROUPS } from "../../data";

// ──────────────────────────────────────────
// EditKifuModal: 棋譜の名前・戦法タグの変更
// ──────────────────────────────────────────
export function EditKifuModal({ kifu, onClose, onSave, customTags, onAddCustomTag }) {
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
