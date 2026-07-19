// ══════════════════════════════════════════════════════════════════
// NodeSearchScreen.jsx  ―  全ノード横断の検索・絞り込み・並び替え画面
//   「ノード名を次の一手にすると後から探しにくい」問題への出口。
//   全ツリーのノードをテキスト・戦法タグ・ステータスで絞り込み、
//   勝率・好き度・頻度で並び替えて、該当ノードへ直接ジャンプする。
//   （入力した勝率・好き度・タグを“見返す場所”でもある）
// ══════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from "react";
import { T } from "../theme";
import { BackBtn, StatusChip } from "../components";
import { USAGE_META, LIKE_LEVELS } from "../data";
import { fetchAllMyNodes } from "../db";

const SORT_OPTIONS = [
  { key: "recent",     label: "新しい順" },
  { key: "winRate",    label: "勝率順",   icon: "ti-trophy" },
  { key: "likeLevel",  label: "好き度順", icon: "ti-heart" },
  { key: "usageLevel", label: "頻度順",   icon: "ti-flame" },
];

const STATUS_KEYS = ["done", "wip", "todo"];

// ── 検索結果1行に出す小さな評価バッジ（P1のアイコン言語と揃える）──
function MiniStat({ icon, color, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: T.fontSize.sm, color, fontFamily: T.fontSerif, flexShrink: 0 }}>
      <i className={`ti ${icon}`} style={{ fontSize: "0.6875rem" }} />
      {children}
    </span>
  );
}

export function NodeSearch({ userId, trees, onBack, onOpenNode }) {
  const [nodes,        setNodes]        = useState(null); // null = 読み込み中
  const [query,        setQuery]        = useState("");
  const [statusFilter, setStatusFilter] = useState([]);   // 空 = 全ステータス
  const [tagFilter,    setTagFilter]    = useState([]);   // 空 = 全タグ
  const [sortKey,      setSortKey]      = useState("recent");
  const [tagsOpen,     setTagsOpen]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllMyNodes(userId).then(({ data }) => { if (!cancelled) setNodes(data || []); });
    return () => { cancelled = true; };
  }, [userId]);

  // ツリーID → ツリー名（結果行の所属表示用）
  const treeName = useMemo(() => {
    const m = new Map();
    (trees || []).forEach((t) => m.set(t.id, t.name));
    return m;
  }, [trees]);

  // 実際に使われている戦法タグ（相手・自分の両方）だけをフィルタ候補にする
  const allTags = useMemo(() => {
    const set = new Set();
    (nodes || []).forEach((n) => {
      (n.situation   || []).forEach((t) => set.add(t));
      (n.my_approach || []).forEach((t) => set.add(t));
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ja"));
  }, [nodes]);

  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const results = useMemo(() => {
    if (!nodes) return [];
    const q = query.trim().toLowerCase();
    let list = nodes.filter((n) => {
      if (statusFilter.length > 0 && !statusFilter.includes(n.status)) return false;
      if (tagFilter.length > 0) {
        const tags = [...(n.situation || []), ...(n.my_approach || [])];
        if (!tagFilter.some((t) => tags.includes(t))) return false;
      }
      if (q) {
        const hay = [
          n.label, n.memo,
          ...(n.situation || []), ...(n.my_approach || []),
          treeName.get(n.tree_id) || "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // 未設定(null)は常に末尾へ。recent は取得時の created_at 降順のまま
    const val = (v) => (v == null ? -Infinity : v);
    if (sortKey === "winRate")    list = [...list].sort((a, b) => val(b.win_rate)    - val(a.win_rate));
    if (sortKey === "likeLevel")  list = [...list].sort((a, b) => val(b.like_level)  - val(a.like_level));
    if (sortKey === "usageLevel") list = [...list].sort((a, b) => val(b.usage_level) - val(a.usage_level));
    return list;
  }, [nodes, query, statusFilter, tagFilter, sortKey, treeName]);

  const filterChipStyle = (selected, color = T.gold, bg = T.goldLight) => ({
    padding: "4px 10px", borderRadius: 20, cursor: "pointer",
    fontSize: T.fontSize.sm, fontFamily: T.fontSerif, transition: "all 0.12s",
    border: selected ? `1.5px solid ${color}` : `0.5px solid ${T.inkLine}`,
    background: selected ? bg : T.cream,
    color: selected ? color : T.inkMid,
    fontWeight: selected ? 600 : 400,
    display: "inline-flex", alignItems: "center", gap: 4,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* ── ヘッダー ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <BackBtn onClick={onBack} />
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, flex: 1 }}>
          ノード検索
        </div>
        {nodes !== null && (
          <span style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>
            {results.length} / {nodes.length} 件
          </span>
        )}
      </div>

      {/* ── 検索・絞り込み ── */}
      <div style={{ padding: "10px 14px 8px", borderBottom: `0.5px solid ${T.inkLineFaint}` }}>
        {/* テキスト検索 */}
        <div style={{ position: "relative", marginBottom: 8 }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.8125rem", color: T.inkFaint }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ノード名・メモ・戦法名で検索"
            style={{
              width: "100%", boxSizing: "border-box",
              border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.md,
              padding: "9px 12px 9px 30px", fontSize: T.fontSize.base,
              color: T.ink, background: T.cream, fontFamily: T.fontSerif, outline: "none",
            }}
            onFocus={(e) => (e.target.style.borderColor = T.gold)}
            onBlur={(e)  => (e.target.style.borderColor = T.inkLine)}
          />
        </div>

        {/* ステータス絞り込み（複数選択可・未選択 = 全部） */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          {STATUS_KEYS.map((s) => (
            <StatusChip
              key={s}
              status={s}
              active={statusFilter.includes(s)}
              onClick={() => setStatusFilter((prev) => toggleIn(prev, s))}
            />
          ))}

          {/* 並び替え */}
          <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
            {SORT_OPTIONS.map((o) => (
              <div key={o.key} onClick={() => setSortKey(o.key)} style={filterChipStyle(sortKey === o.key)}>
                {o.icon && <i className={`ti ${o.icon}`} style={{ fontSize: "0.6875rem" }} />}
                {o.label}
              </div>
            ))}
          </div>
        </div>

        {/* 戦法タグ絞り込み（使われているタグのみ表示・折りたたみ式） */}
        {allTags.length > 0 && (
          <div>
            <div
              onClick={() => setTagsOpen((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", color: T.inkMid, fontSize: T.fontSize.sm, fontFamily: T.fontSerif, padding: "2px 0" }}
            >
              <i className={`ti ti-chevron-${tagsOpen ? "up" : "right"}`} style={{ fontSize: "0.6875rem" }} />
              戦法タグで絞り込み
              {tagFilter.length > 0 && (
                <span style={{ color: T.gold, fontWeight: 600 }}>（{tagFilter.length}件選択中）</span>
              )}
            </div>
            {tagsOpen && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {allTags.map((t) => (
                  <div key={t} onClick={() => setTagFilter((prev) => toggleIn(prev, t))} style={filterChipStyle(tagFilter.includes(t))}>
                    {t}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 結果一覧 ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
        {nodes === null ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: T.inkFaint, fontSize: T.fontSize.base }}>
            読み込み中...
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: T.inkFaint, fontSize: T.fontSize.base, lineHeight: 1.8 }}>
            <i className="ti ti-search-off" style={{ fontSize: "1.5rem", display: "block", marginBottom: 8 }} />
            {nodes.length === 0 ? "ノードがまだありません" : "条件に合うノードがありません"}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {results.map((n) => {
              const tags = [...(n.situation || []), ...(n.my_approach || [])];
              return (
                <div
                  key={n.id}
                  onClick={() => onOpenNode(n.tree_id, n.id)}
                  style={{ padding: "9px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLine}`, background: T.cream, cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = T.cream)}
                >
                  {/* 1行目: 所属ツリー名 */}
                  <div style={{ fontSize: T.fontSize.sm, color: T.gold, fontFamily: T.fontSerif, marginBottom: 2 }}>
                    <i className="ti ti-plant" style={{ fontSize: "0.625rem", marginRight: 3 }} />
                    {treeName.get(n.tree_id) || "（不明なツリー）"}
                  </div>
                  {/* 2行目: ノード名 + ステータス */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: T.fontSize.base, color: T.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {n.label}
                    </span>
                    <StatusChip status={n.status} />
                    <i className="ti ti-chevron-right" style={{ fontSize: "0.875rem", color: T.gray, flexShrink: 0 }} />
                  </div>
                  {/* 3行目: タグ + 評価バッジ（設定済みのものだけ表示） */}
                  {(tags.length > 0 || n.win_rate != null || n.like_level != null || n.usage_level != null) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                      {tags.slice(0, 4).map((t) => (
                        <span key={t} style={{ fontSize: T.fontSize.xs, padding: "1px 6px", borderRadius: T.radius.sm, background: "rgba(26,15,0,0.06)", color: T.inkMid, fontFamily: T.fontSerif }}>
                          {t}
                        </span>
                      ))}
                      <span style={{ display: "inline-flex", gap: 8, marginLeft: "auto" }}>
                        {n.usage_level != null && n.usage_level !== 2 && (
                          <MiniStat icon="ti-flame" color={T.gold}>{USAGE_META[n.usage_level]?.label}</MiniStat>
                        )}
                        {n.win_rate != null && (
                          <MiniStat icon="ti-trophy" color={T.green}>{n.win_rate}割</MiniStat>
                        )}
                        {n.like_level != null && (
                          <MiniStat icon="ti-heart" color={T.red}>{LIKE_LEVELS.find((l) => l.value === n.like_level)?.label}</MiniStat>
                        )}
                      </span>
                    </div>
                  )}
                  {/* 4行目: メモの冒頭（あれば1行だけ） */}
                  {n.memo && (
                    <div style={{ fontSize: T.fontSize.sm, color: T.inkMid, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: T.fontSerif }}>
                      {n.memo}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
