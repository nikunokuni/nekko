// ══════════════════════════════════════════════════════════════════
// ChildrenSection.jsx  ―  ノード詳細画面の「子ノード」セクション
//   子の一覧 / 分岐を追加 / 「とりあえず」の作り直し /
//   分岐のコツ / 実戦で当たった相手から選ぶ / 合流・子の移動
// ══════════════════════════════════════════════════════════════════
import { T } from "../../theme";
import { STATUS_META } from "../../data";
import { StatusChip, MergeTag } from "../../components";
import { MergeLinkList, LinkPicker } from "../../components/uiParts";

// 一覧の行・追加ボタンで共通のカード見た目
const ROW_STYLE = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "9px 12px", borderRadius: T.radius.sm,
  border: `0.5px solid ${T.inkLine}`, background: T.cream, cursor: "pointer",
};

// 「まだ無いものを足す」ボタン（点線枠）
const ADD_ROW_STYLE = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "8px 12px", borderRadius: T.radius.sm,
  border: `0.5px dashed ${T.inkLine}`, cursor: "pointer", fontSize: T.fontSize.base,
};

// 折りたたみの見出し（「その他の操作」「実戦で当たった相手から選ぶ」）
const TOGGLE_STYLE = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "4px 4px", marginTop: 2, cursor: "pointer",
  color: T.inkFaint, fontSize: T.fontSize.sm, fontFamily: T.fontSerif,
};

// ホバーで背景色を変える（一覧の行・追加ボタン共通）
const hoverBg = (bg) => ({
  onMouseEnter: (e) => (e.currentTarget.style.background = T.goldLight),
  onMouseLeave: (e) => (e.currentTarget.style.background = bg),
});

/** 開閉の三角。開いているときだけ90度回す */
function Caret({ open }) {
  return (
    <i className="ti ti-chevron-right" style={{ fontSize: "0.6875rem", transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "none" }} />
  );
}

export function ChildrenSection({
  nodes, onOpenChild, onAddBranch,
  isRoot, showInboxButton, onCreateInbox,
  // 実戦で当たった相手から選ぶ
  showCandidates, candidatesOpen, onToggleCandidates, candidatesLoading, branch, onPickCandidate,
  // 合流・子の移動
  showMerge, detailsOpen, onToggleDetails,
  mergeChildren, mergeCandidates, mergePickerOpen, setMergePickerOpen, onAddMergeChild, onRemoveMergeChild,
  onMoveChild, movePickerOpen, setMovePickerOpen,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {nodes.map((child) => {
        const m = STATUS_META[child.status] || STATUS_META.todo;
        const childWhenToUse = (child.whenToUse || "").trim();
        return (
          <div key={child.id} onClick={() => onOpenChild(child.id)} style={ROW_STYLE} {...hoverBg(T.cream)}>
            <div style={{ width: 2, height: childWhenToUse ? 30 : 20, borderRadius: 1, flexShrink: 0, background: m.dashed ? "transparent" : m.dot, border: m.dashed ? "0.5px dashed #B4B2A9" : "none" }} />
            {/* いつ使うメモがあれば、ノード名の下に小さく表示する */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: T.fontSize.base, color: T.ink }}>{child.label}</span>
              {childWhenToUse && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>
                  <i className="ti ti-player-play" style={{ fontSize: "0.625rem", color: T.gold, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{childWhenToUse}</span>
                </div>
              )}
            </div>
            {child.isMergeTarget && <MergeTag />}
            <StatusChip status={child.status} />
            <i className="ti ti-chevron-right" style={{ fontSize: "0.875rem", color: T.gray }} />
          </div>
        );
      })}

      {/* 分岐追加ボタン */}
      <div onClick={onAddBranch} style={{ ...ADD_ROW_STYLE, color: T.gold }} {...hoverBg("transparent")}>
        <i className="ti ti-git-branch" style={{ fontSize: "0.875rem" }} />ここから分岐を追加
      </div>

      {/* ── 「とりあえず」を作り直す ──
          ルートにだけ出す。置き場を消してしまったときの復活手段 */}
      {isRoot && showInboxButton && (
        <div onClick={onCreateInbox} style={{ ...ADD_ROW_STYLE, color: T.grayText }} {...hoverBg("transparent")}>
          <i className="ti ti-inbox" style={{ fontSize: "0.875rem" }} />
          「とりあえず」を作る（置き場）
        </div>
      )}

      {/* ── 分岐のコツ（子ノードがまだ無いときだけ）──
          分岐で手が止まるのは「自分の指し手」を並べようとしたときなので、
          その一点だけをここで伝える。詳しい説明は使い方トーストに置く */}
      {nodes.length === 0 && (
        <div style={{ display: "flex", gap: 6, padding: "2px 4px", fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
          <i className="ti ti-bulb" style={{ marginTop: 3, flexShrink: 0 }} />
          <span>分岐は「相手がどう来たか」で分けると迷いません。自分の指し手はこの枝の中身になります。</span>
        </div>
      )}

      {/* ── 実戦で当たった相手から選ぶ ──
          ここが「補助」の本体。押さなければ何も起きず、棋譜も読まない */}
      {showCandidates && (
        <>
          <div onClick={onToggleCandidates} style={TOGGLE_STYLE}>
            <Caret open={candidatesOpen} />
            実戦で当たった相手から選ぶ
          </div>

          {candidatesOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
              {candidatesLoading ? (
                <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, padding: "4px 0" }}>棋譜を読み込み中…</div>
              ) : branch.candidates.length === 0 ? (
                <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, padding: "4px 0", lineHeight: 1.7 }}>
                  {branch.matchedGames === 0
                    ? "このノードのタグに一致する棋譜がまだありません。"
                    : "当たった相手はすべて枝になっています。"}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: T.fontSize.xs, color: T.inkFaint, fontFamily: T.fontSerif }}>
                    {branch.matchedGames}局から、{branch.axisLabel}べつに数えました
                  </div>
                  {branch.candidates.map((c) => (
                    <div
                      key={c.name}
                      onClick={() => onPickCandidate(c)}
                      style={{ ...ROW_STYLE, border: `0.5px dashed ${T.gold}`, background: "transparent" }}
                      {...hoverBg("transparent")}
                    >
                      <i className="ti ti-plus" style={{ fontSize: "0.75rem", color: T.gold, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: T.fontSize.base, color: T.ink }}>{c.name}</span>
                      <span style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif, whiteSpace: "nowrap" }}>
                        {c.games}局 {c.wins}勝{c.losses}敗{c.draws ? `${c.draws}分` : ""}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* その他の操作（合流・子の変更）── デフォルト非表示 */}
      {(onAddMergeChild || onMoveChild) && (
        <div onClick={onToggleDetails} style={TOGGLE_STYLE}>
          <Caret open={detailsOpen} />
          その他の操作（{showMerge ? "合流・子の移動" : "子の移動"}）
        </div>
      )}

      {detailsOpen && (
        <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
          {showMerge && !isRoot && onAddMergeChild && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <MergeLinkList
                items={mergeChildren}
                candidates={mergeCandidates}
                pickerOpen={mergePickerOpen}
                setPickerOpen={setMergePickerOpen}
                onAdd={onAddMergeChild}
                onRemove={onRemoveMergeChild}
                addLabel="合流する子を追加"
                pickLabel="子にするノードを選択"
              />
            </div>
          )}
          {onMoveChild && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <LinkPicker
                candidates={mergeCandidates}
                pickerOpen={movePickerOpen}
                setPickerOpen={setMovePickerOpen}
                onPick={onMoveChild}
                label="既存ノードを子に移動"
                pickLabel="子にするノードを選択"
                icon="ti-arrows-exchange"
                color={T.blue}
                hoverBg={T.blueBg}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
