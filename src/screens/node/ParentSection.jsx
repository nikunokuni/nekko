// ══════════════════════════════════════════════════════════════════
// ParentSection.jsx  ―  ノード詳細画面の「親ノード」セクション
//   親へのリンク / どこから分岐したかの説明 / 合流・親の変更
//
//   合流と親の変更は普段は使わないので「その他の操作」の中に畳んでおく
//   （合流が設定済みのノードでは開いた状態で表示する）。
//   ルートノードには親がいないので、このセクション自体を出さない。
// ══════════════════════════════════════════════════════════════════
import { T } from "../../theme";
import { MergeLinkList, LinkPicker } from "../../components/uiParts";
import { SectionHeader, SectionDivider } from "./sectionParts";

/**
 * 親のどこから分かれてきたかの説明文をつくる。
 * 範囲切り出しノード（棋譜を持つ）は盤面が終点の局面なので、
 * 「第n手から分岐」ではなく切り出した範囲を表示する。
 */
function branchDescription(node, parentLabel) {
  const start = node.branchFromMoveIndex;
  const startLabel = start === 0 ? "初期局面" : `第${start}手`;
  if ((node.kifu || []).length > 1) {
    const end = start + node.kifu.length - 1;
    return `「${parentLabel}」の${startLabel}〜第${end}手を切り出し`;
  }
  return `「${parentLabel}」の${startLabel}から分岐`;
}

export function ParentSection({
  node, parent, onOpenParent,
  detailsOpen, onToggleDetails,
  showMerge, mergeParents, mergeCandidates,
  mergePickerOpen, setMergePickerOpen, onAddMergeParent, onRemoveMergeParent,
  onReparent, reparentPickerOpen, setReparentPickerOpen,
}) {
  return (
    <>
      <SectionHeader icon="ti-corner-left-up">親ノード</SectionHeader>
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {parent && (
            <div
              onClick={onOpenParent}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLine}`, background: T.cream, cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
              onMouseLeave={(e) => (e.currentTarget.style.background = T.cream)}
            >
              <i className="ti ti-corner-left-up" style={{ fontSize: "0.875rem", color: T.gray }} />
              <span style={{ fontSize: T.fontSize.base, color: T.ink, flex: 1 }}>{parent.label}</span>
              <i className="ti ti-chevron-right" style={{ fontSize: "0.875rem", color: T.gray }} />
            </div>
          )}

          {parent && node.branchFromMoveIndex != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px" }}>
              <i className="ti ti-git-branch" style={{ fontSize: "0.8125rem", color: T.gray }} />
              <span style={{ fontSize: T.fontSize.sm, color: T.gray }}>
                {branchDescription(node, parent.label)}
              </span>
            </div>
          )}

          {/* その他の操作（合流・親の変更）── デフォルト非表示 */}
          <div
            onClick={onToggleDetails}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 4px", marginTop: 2, cursor: "pointer", color: T.inkFaint, fontSize: T.fontSize.sm, fontFamily: T.fontSerif }}
          >
            <i className="ti ti-chevron-right" style={{ fontSize: "0.6875rem", transition: "transform 0.15s", transform: detailsOpen ? "rotate(90deg)" : "none" }} />
            その他の操作（{showMerge ? "合流・親の変更" : "親の変更"}）
          </div>

          {detailsOpen && (
            <div style={{ display: "flex", flexDirection: "row", gap: 8, padding: "2px 0 0 4px" }}>
              {showMerge && onAddMergeParent && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <MergeLinkList
                    items={mergeParents}
                    candidates={mergeCandidates}
                    pickerOpen={mergePickerOpen}
                    setPickerOpen={setMergePickerOpen}
                    onAdd={onAddMergeParent}
                    onRemove={onRemoveMergeParent}
                    addLabel="合流元を追加"
                    pickLabel="親にするノードを選択"
                  />
                </div>
              )}
              {onReparent && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <LinkPicker
                    candidates={mergeCandidates}
                    pickerOpen={reparentPickerOpen}
                    setPickerOpen={setReparentPickerOpen}
                    onPick={onReparent}
                    label="親ノードを変更"
                    pickLabel="新しい親ノードを選択"
                    icon="ti-arrows-exchange"
                    color={T.blue}
                    hoverBg={T.blueBg}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <SectionDivider />
    </>
  );
}
