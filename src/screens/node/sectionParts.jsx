// ══════════════════════════════════════════════════════════════════
// sectionParts.jsx  ―  ノード詳細画面の中で使う小さな見出しパーツ
//   「きほん」「ついか」などのセクションを区切るためだけの部品。
//   他の画面では使わないので components/ ではなく screens/node/ に置く。
// ══════════════════════════════════════════════════════════════════
import { T } from "../../theme";

/** セクション見出し（アイコン付き） */
export function SectionHeader({ icon, children, dataOnboard }) {
  return (
    <div data-onboard={dataOnboard} style={{ display: "flex", alignItems: "center", gap: 6, padding: "14px 16px 8px", fontSize: T.fontSize.base, fontWeight: 600, color: T.inkMid, letterSpacing: "0.04em", fontFamily: T.fontSerif }}>
      <i className={`ti ${icon}`} style={{ fontSize: "0.8125rem", color: T.gold }} />{children}
    </div>
  );
}

/** セクション間の太い区切り線 */
export function SectionDivider() {
  return <div style={{ height: 3, background: "rgba(26,15,0,0.18)" }} />;
}
