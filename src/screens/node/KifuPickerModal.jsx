// ══════════════════════════════════════════════════════════════════
// KifuPickerModal.jsx  ―  棋譜ライブラリから1件選んでノードに取り込む
//   一覧（メタデータのみ）→ タップで snapshots 込み取得 → プレビュー再生 → 取り込み
//   一覧は「同じタグの棋譜」「その他の棋譜」の2段に分けて表示する
//   （研究中の戦法の棋譜から選びやすくする）
// ══════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from "react";
import { T, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE } from "../../theme";
import { KifuPreviewBoard, SectionLabel } from "../../components/uiParts";
import { fetchMyKifus, fetchKifu, kifuRowToKifu } from "../../db";

export function KifuPickerModal({ userId, nodeTags = [], hasExistingKifu, onClose, onImport }) {
  const [kifus,     setKifus]     = useState(null); // null = 読み込み中
  const [selected,  setSelected]  = useState(null); // snapshots込みの棋譜（プレビュー表示中）
  const [fetching,  setFetching]  = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyKifus(userId).then(({ data }) => {
      if (!cancelled) setKifus((data || []).map(kifuRowToKifu));
    });
    return () => { cancelled = true; };
  }, [userId]);

  // タグの一致で「同じタグ」「その他」の2グループに分ける（空のグループは出さない）。
  // その他の中はタグなしを先に、ほかのタグが付いた棋譜を後ろに並べる
  const kifuGroups = useMemo(() => {
    const want = new Set(nodeTags);
    const matched = [], untagged = [], others = [];
    for (const k of kifus || []) {
      const tags = k.tags || [];
      if (tags.length === 0)                    untagged.push(k);
      else if (tags.some((t) => want.has(t)))   matched.push(k);
      else                                      others.push(k);
    }
    return [
      { key: "matched", label: "同じタグの棋譜", items: matched },
      { key: "others",  label: "その他の棋譜",   items: [...untagged, ...others] },
    ].filter((g) => g.items.length > 0);
  }, [kifus, nodeTags]);

  const handlePick = async (kifu) => {
    if (fetching) return;
    setFetching(true);
    const { data, error } = await fetchKifu(kifu.id);
    setFetching(false);
    if (error || !data) {
      alert("棋譜の読み込みに失敗しました。もう一度お試しください。");
      return;
    }
    setSelected(kifuRowToKifu(data));
  };

  const handleImport = async () => {
    if (!selected || importing) return;
    setImporting(true);
    await onImport(selected);
    setImporting(false);
    onClose();
  };

  const snaps = selected?.snapshots || [];
  const last  = snaps.length > 0 ? snaps[snaps.length - 1] : null;

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "90%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          {selected && (
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2, lineHeight: 1 }}>
              <i className="ti ti-chevron-left" />
            </button>
          )}
          <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink }}>
            {selected ? selected.name : "保存済み棋譜から選ぶ"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1.125rem", padding: 2 }}>
            <i className="ti ti-x" />
          </button>
        </div>

        {!selected ? (
          // ── 一覧 ──
          kifus === null ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: T.inkFaint, fontSize: T.fontSize.base }}>
              読み込み中...
            </div>
          ) : kifus.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: T.inkFaint, fontSize: T.fontSize.base, lineHeight: 1.8 }}>
              保存した棋譜がまだありません<br />
              ツリー一覧の「棋譜ライブラリ」から棋譜を保存できます
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {kifuGroups.map((g) => (
                <div key={g.key}>
                  {/* グループが1つだけのときは見出しを出さない（並べ替える意味がないため） */}
                  {kifuGroups.length > 1 && (
                    <SectionLabel style={{ marginBottom: 6 }}>{g.label}</SectionLabel>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {g.items.map((k) => (
                      <div
                        key={k.id}
                        onClick={() => handlePick(k)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${g.key === "matched" ? T.gold : T.inkLine}`, background: T.cream, cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = T.cream)}
                      >
                        <i className="ti ti-chess" style={{ fontSize: "0.875rem", color: T.gold }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: T.fontSize.base, color: T.ink }}>{k.name}</div>
                          {(k.tags || []).length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                              {k.tags.map((tag) => (
                                <span key={tag} style={{ fontSize: T.fontSize.sm, padding: "2px 7px", borderRadius: T.radius.sm, background: T.goldLight, color: T.gold, fontFamily: T.fontSerif }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>{k.moveCount}手</span>
                        <i className="ti ti-chevron-right" style={{ fontSize: "0.875rem", color: T.gray }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          // ── プレビュー + 取り込み ──
          <>
            <KifuPreviewBoard snapshots={snaps} />

            {hasExistingKifu && (
              <div style={{ marginTop: 10, fontSize: T.fontSize.sm, color: T.brown, fontFamily: T.fontSerif, lineHeight: 1.6 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: "0.75rem", marginRight: 3 }} />
                このノードには棋譜があります。取り込むと今の棋譜・盤面は上書きされます
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!last || importing}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                width: "100%", marginTop: 10, padding: "11px 12px", borderRadius: T.radius.lg,
                border: "none", background: (!last || importing) ? T.gray : T.gold, color: T.cream,
                fontSize: T.fontSize.lg, fontWeight: 600, cursor: (!last || importing) ? "default" : "pointer",
                fontFamily: T.fontSerif,
              }}
            >
              <i className="ti ti-download" style={{ fontSize: "0.875rem" }} />
              {importing ? "取り込み中..." : "このノードに取り込む"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
