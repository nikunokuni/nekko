// ══════════════════════════════════════════════════════════════════
// TurnEvalSection.jsx  ―  手番と評価値の入力
//   盤面を表示しているときだけ出す。どちらも「その局面に紐づく情報」なので
//   盤面の直下に置く。評価値は設定でOFFにできる（手番は常に出す）。
// ══════════════════════════════════════════════════════════════════
import { T, focusBorder, blurBorder } from "../../theme";
import { SectionLabel } from "../../components/uiParts";

// 手番チップ：[値, ラベル, 文字色, 背景色]
const TURNS = [
  ["sente", "先手番", T.blue,    T.blueBg],
  ["gote",  "後手番", T.redDark, T.redBg],
];

// 評価値の符号チップ：[符号, 文字色, 背景色]
const SIGNS = [
  ["+", T.blue,    T.blueBg],
  ["-", T.redDark, T.redBg],
];

/**
 * 評価値の入力を「数字と小数点のみ・小数点1個・整数部4桁・小数第1位まで」に整形する。
 * 評価値の形式はソフトによって異なるため、±9999.9 の範囲で自由に記録できるようにする。
 */
export function sanitizeEvalInput(raw) {
  const v = raw.replace(/[^0-9.]/g, "");
  const dot = v.indexOf(".");
  if (dot === -1) return v.slice(0, 4);
  return v.slice(0, dot).slice(0, 4) + "." + v.slice(dot + 1).replace(/\./g, "").slice(0, 1);
}

/** 選択中／非選択でチップの見た目を切り替える */
const chipStyle = (selected, color, bg, extra = {}) => ({
  borderRadius: T.radius.md,
  cursor:       "pointer",
  fontSize:     T.fontSize.base,
  fontFamily:   T.fontSerif,
  transition:   "all 0.15s",
  border:       selected ? `1.5px solid ${color}` : `0.5px solid ${T.inkLine}`,
  background:   selected ? bg : T.cream,
  color:        selected ? color : T.inkMid,
  fontWeight:   selected ? 600 : 400,
  ...extra,
});

export function TurnEvalSection({
  turn, onTurnSelect,
  showEvaluation, evalSign, evalValue, onEvalChange, onEvalEnd,
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", padding: "0 16px 12px" }}>
      {/* 手番 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <SectionLabel>手番</SectionLabel>
        {TURNS.map(([val, lbl, color, bg]) => (
          <div
            key={val}
            onClick={() => onTurnSelect(val)}
            style={chipStyle(turn === val, color, bg, { padding: "5px 12px" })}
          >
            {lbl}
          </div>
        ))}
      </div>

      {/* 評価値（符号は選択式・数値は入力）。設定でOFFにできる（手番は残る） */}
      {showEvaluation && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <SectionLabel>評価値</SectionLabel>
          {SIGNS.map(([sign, color, bg]) => (
            <div
              key={sign}
              onClick={() => onEvalChange(sign, evalValue)}
              title={sign === "+" ? "先手良し" : "後手良し"}
              style={chipStyle(evalSign === sign, color, bg, {
                width: 28, height: 28, fontSize: T.fontSize.lg, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center",
              })}
            >
              {sign === "+" ? "＋" : "－"}
            </div>
          ))}
          <input
            value={evalValue}
            inputMode="decimal"
            onChange={(e) => onEvalChange(evalSign, sanitizeEvalInput(e.target.value))}
            onBlur={(e) => { blurBorder(e); onEvalEnd(); }}
            onFocus={focusBorder}
            placeholder="300"
            style={{
              width: 64, boxSizing: "border-box", border: `0.5px solid ${T.inkLine}`,
              borderRadius: T.radius.md, padding: "5px 10px", fontSize: T.fontSize.base,
              color: T.ink, background: T.cream, fontFamily: T.fontSerif, outline: "none",
            }}
          />
        </div>
      )}
    </div>
  );
}
