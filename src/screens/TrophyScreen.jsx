// ══════════════════════════════════════════════════════════════════
// TrophyScreen.jsx  ―  トロフィー（バッジ）画面
// ══════════════════════════════════════════════════════════════════
import { BADGE_DEFS } from "../rewards";
import { T } from "../theme";

export function TrophyScreen({ onBack, treeCount, nodeCount, loginStats, extraStats = {} }) {
  const { totalDays = 0, streak = 0 } = loginStats || {};
  const stats = { treeCount, nodeCount, totalDays, streak, ...extraStats };

  const earnedIds  = new Set(BADGE_DEFS.filter((b) => b.check(stats)).map((b) => b.id));
  const earnedCount = earnedIds.size;

  const statItems = [
    { icon: "ti-binary-tree", label: "ツリー",      value: treeCount, unit: "個" },
    { icon: "ti-git-branch",  label: "ノード",      value: nodeCount, unit: "個" },
    { icon: "ti-calendar",    label: "累計ログイン", value: totalDays, unit: "日" },
    { icon: "ti-flame",       label: "連続ログイン", value: streak,    unit: "日" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 18px 12px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: 18, padding: 2, lineHeight: 1 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: 18, color: T.ink, letterSpacing: "0.1em" }}>
          トロフィー
        </div>
        <span style={{ fontSize: T.fontSize.base, color: T.gold, fontFamily: T.fontSerif }}>
          {earnedCount} / {BADGE_DEFS.length}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* スタッツ */}
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {statItems.map((s) => (
              <div key={s.label} style={{
                padding: "14px",
                borderRadius: T.radius.lg,
                background: T.goldLight,
                border: "0.5px solid rgba(200,169,110,0.35)",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: T.fontSize.md, color: T.inkMid }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize: 13, color: T.gold }} />{s.label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: T.ink, fontFamily: T.fontTitle, lineHeight: 1.1 }}>
                  {s.value}
                  <span style={{ fontSize: T.fontSize.md, fontWeight: 400, color: T.inkMid, marginLeft: 3 }}>{s.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* バッジ一覧 */}
        <div style={{ padding: "20px 16px 32px" }}>
          <div style={{ fontSize: T.fontSize.md, color: T.inkMid, marginBottom: 12, letterSpacing: "0.08em" }}>バッジ</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {BADGE_DEFS.map((b) => {
              const earned = earnedIds.has(b.id);
              return (
                <div key={b.id} style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                  padding: "14px 8px 12px",
                  borderRadius: T.radius.lg,
                  border: `0.5px solid ${earned ? "rgba(200,169,110,0.5)" : T.inkLineFaint}`,
                  background: earned ? T.goldLight : "rgba(26,15,0,0.03)",
                  opacity: earned ? 1 : 0.5,
                  position: "relative",
                }}>
                  {/* アイコン */}
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%",
                    background: earned ? b.color + "1a" : "rgba(26,15,0,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: earned ? `1.5px solid ${b.color}55` : "none",
                  }}>
                    <i className={`ti ${b.icon}`} style={{ fontSize: 22, color: earned ? b.color : T.gray }} />
                  </div>

                  {/* 未獲得ロック */}
                  {!earned && (
                    <div style={{ position: "absolute", top: 9, right: 9 }}>
                      <i className="ti ti-lock" style={{ fontSize: 10, color: T.gray }} />
                    </div>
                  )}
                  {/* 獲得チェック */}
                  {earned && (
                    <div style={{
                      position: "absolute", top: 8, right: 8,
                      width: 17, height: 17, borderRadius: "50%",
                      background: T.gold,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <i className="ti ti-check" style={{ fontSize: 9, color: T.cream }} />
                    </div>
                  )}

                  <div style={{ fontSize: T.fontSize.sm, fontWeight: 600, color: earned ? T.ink : T.grayText, textAlign: "center", lineHeight: 1.3, fontFamily: T.fontSerif }}>
                    {b.label}
                  </div>
                  <div style={{ fontSize: T.fontSize.xs, color: T.inkFaint, textAlign: "center", lineHeight: 1.4, fontFamily: T.fontSerif }}>
                    {b.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
