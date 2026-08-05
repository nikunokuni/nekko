// ══════════════════════════════════════════════════
// toast.jsx  ―  失敗を伝える通知（押させない知らせ）
//
//   以前は失敗のたびに alert() を出していた。alert は画面を止めてOKを
//   押させるが、「保存に失敗しました。もう一度お試しください」に対して
//   利用者ができることは "もう一度押す" しかない。**押させるためだけの
//   ボタン**が、一番うまくいっていない瞬間に一手増えていた。
//   そこで、伝えるだけの知らせは押さずに消えるトーストにした。
//
//   ただし読み込みの失敗だけは別で、利用者は画面を開き直す以外に
//   手が無くなる（一覧が空のまま固まって見える）。ここには
//   「もう一度読む」を添えて、次にすべきことまで示す。
//
//   ── なぜ Context ではなくモジュール変数か ──
//   呼び出し元には useTreeData のようなフックもあり、Provider の下に
//   居るとは限らない。どこからでも1行で呼べることを優先している。
//   代わりに ToastLayer は App に1つだけ置く（複数置くと二重に出る）。
// ══════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { T } from "./theme";

// 伝えるだけの知らせが消えるまで。読み終えるには足りて、
// 次の操作の邪魔にはならない長さ
const AUTO_DISMISS_MS = 5000;

let seq = 0;
let listeners = [];
let items = [];

function emit() {
  for (const fn of listeners) fn(items);
}

/**
 * 失敗を知らせる。
 * @param {string} message 利用者に見せる文（日本語）
 * @param {Object} [opts]
 * @param {{label: string, onClick: Function}} [opts.action]
 *   次にすべきことがあるときだけ渡す。付けた知らせは自動では消えない
 *   （消えたら押せなくなり、案内した意味が無くなるため）
 */
export function showToast(message, opts = {}) {
  const id = ++seq;
  items = [...items, { id, message, action: opts.action || null }];
  emit();
  if (!opts.action) setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
  return id;
}

export function dismissToast(id) {
  items = items.filter((t) => t.id !== id);
  emit();
}

// テストや画面遷移で残骸を消したいとき用
export function clearToasts() {
  items = [];
  emit();
}

// ── 表示レイヤ（App に1つだけ置く）──────────────
export function ToastLayer() {
  const [list, setList] = useState(items);
  useEffect(() => {
    listeners.push(setList);
    return () => { listeners = listeners.filter((fn) => fn !== setList); };
  }, []);

  if (list.length === 0) return null;

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9000,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      padding: "0 12px calc(16px + env(safe-area-inset-bottom))",
      // 画面の下半分を覆って操作を吸わないよう、トースト自体だけを当たり判定にする
      pointerEvents: "none",
    }}>
      {list.map((t) => (
        <div
          key={t.id}
          role="alert"
          style={{
            pointerEvents: "auto",
            width: "100%", maxWidth: 420, boxSizing: "border-box",
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "11px 12px", borderRadius: T.radius.md,
            border: `0.5px solid ${T.red}`, background: T.redBg,
            boxShadow: "0 6px 24px rgba(26,15,0,0.15)",
            fontSize: T.fontSize.lg, color: T.ink, fontFamily: T.fontSerif, lineHeight: 1.7,
          }}
        >
          <i className="ti ti-alert-circle" style={{ color: T.red, marginTop: 3, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>{t.message}</span>
          {t.action && (
            <button
              onClick={() => { dismissToast(t.id); t.action.onClick(); }}
              style={{
                flexShrink: 0, padding: "3px 10px", borderRadius: T.radius.sm,
                border: `0.5px solid ${T.red}`, background: "transparent",
                color: T.red, cursor: "pointer", fontSize: T.fontSize.base, fontFamily: T.fontSerif,
              }}
            >{t.action.label}</button>
          )}
          {/* 自動で消えない知らせにだけ、閉じる手段が要る */}
          {t.action && (
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="この知らせを閉じる"
              style={{
                flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                color: T.inkFaint, fontSize: "0.875rem", padding: "2px 0 2px 2px", lineHeight: 1,
              }}
            >
              <i className="ti ti-x" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
