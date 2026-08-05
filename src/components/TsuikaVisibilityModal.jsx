// ══════════════════════════════════════════════════════════════════
// TsuikaVisibilityModal.jsx  ―  ノード編集画面に出す項目のON/OFF
//
//   以前は設定画面のアコーディオンの中にあった。
//   「入力欄が多くて疲れる」を解消するための設定なのに、そこへ行くには
//   ツリー一覧へ戻る → 設定 → アコーディオンを開く、の3手が要り、
//   一番それを求めている場面（ノードを編集していて欄が多いと感じた瞬間）から
//   一番遠い所に置かれていた。今は「ついか」見出しの歯車から直接開く。
//
//   OFFにしても入力済みのデータは消えない（表示を止めるだけ）。
//   保存先は profiles の tsuika_visibility 列（rewards.js が持つ）。
// ══════════════════════════════════════════════════════════════════
import { useState } from "react";
import { T, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE } from "../theme";
import { TSUIKA_ITEMS } from "../data";
import { isTsuikaVisible, setTsuikaVisible } from "../rewards";

// ── Toggle: ON/OFFスイッチ（設定画面から一緒に移してきた）──
function Toggle({ on, onChange, label }) {
  return (
    <div
      onClick={onChange}
      role="switch"
      aria-checked={on}
      // 見た目だけのスイッチなので、隣の項目名を名前として与える。
      // 無いと読み上げでは「スイッチ」としか読まれず、どの項目のものか分からない
      // （E2Eからも項目名で指せるようになる）
      aria-label={label}
      style={{
        width: 40, height: 22, borderRadius: 11, flexShrink: 0,
        background: on ? T.gold : "rgba(26,15,0,0.15)",
        position: "relative", cursor: "pointer", transition: "background 0.15s",
      }}
    >
      <div style={{
        position: "absolute", top: 2, left: on ? 20 : 2,
        width: 18, height: 18, borderRadius: "50%",
        background: T.cream, transition: "left 0.15s",
        boxShadow: "0 1px 3px rgba(26,15,0,0.25)",
      }} />
    </div>
  );
}

/**
 * @param {() => void} onClose  閉じる
 * @param {() => void} [onChange] 1項目切り替えるたびに呼ぶ。
 *   表示可否は rewards のキャッシュ（Reactの外）にあるので、これを受けて
 *   親が再描画しないと、モーダルを閉じるまで編集画面に反映されない
 */
export function TsuikaVisibilityModal({ onClose, onChange }) {
  const [vis, setVis] = useState(() =>
    Object.fromEntries(TSUIKA_ITEMS.map((it) => [it.key, isTsuikaVisible(it.key)]))
  );

  const toggle = (key) => {
    const next = !vis[key];
    setVis((prev) => ({ ...prev, [key]: next }));
    setTsuikaVisible(key, next);
    onChange?.();
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div
        style={{ ...MODAL_SHEET_STYLE, maxHeight: "85%", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="ノード編集画面に表示する項目"
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink }}>
            表示する項目
          </div>
          <button onClick={onClose} aria-label="閉じる"
            style={{ background: "none", border: "none", cursor: "pointer", color: T.inkMid, fontSize: "1rem", padding: 2 }}>
            <i className="ti ti-x" />
          </button>
        </div>

        <div style={{ borderRadius: T.radius.md, border: `0.5px solid ${T.inkLine}`, overflow: "hidden" }}>
          {TSUIKA_ITEMS.map((it, i) => (
            <div
              key={it.key}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "13px 16px",
                borderBottom: i < TSUIKA_ITEMS.length - 1 ? `0.5px solid ${T.inkLineFaint}` : "none",
              }}
            >
              <i className={`ti ${it.icon}`} style={{ fontSize: "1rem", color: vis[it.key] ? T.gold : T.gray }} />
              <span style={{ flex: 1, fontSize: T.fontSize.lg, color: vis[it.key] ? T.ink : T.inkMid, fontFamily: T.fontSerif }}>
                {it.label}
              </span>
              <Toggle on={vis[it.key]} onChange={() => toggle(it.key)} label={it.label} />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10, fontSize: T.fontSize.base, color: T.inkFaint, lineHeight: 1.7 }}>
          <i className="ti ti-info-circle" style={{ marginTop: 3, flexShrink: 0 }} />
          <span>OFFにしても入力済みのデータは消えません。ONに戻すとそのまま再表示されます。</span>
        </div>
      </div>
    </div>
  );
}
