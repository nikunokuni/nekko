// ══════════════════════════════════════════════════
// onboarding.jsx  ―  初回オンボーディング（使い方トースト＋指さし）一式
//   文面定数 / 表示ロジック（useOnboarding）/ 表示レイヤ（OnboardingLayer）
//   をこのモジュールに集約する。App.jsx は接続するだけ。
// ══════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from "react";
import { shouldShowOnboard, markOnboardSeen } from "./rewards";

// 画面ごとの初回オンボーディング文面（その画面に初めて来たとき1度だけ表示する）
// 各画面は配列で、複数枚を順番に（連続で）表示する
export const ONBOARD_MESSAGES = {
  list: [
    <span><i className="ti ti-search" />ノード検索　全ツリーのノードをまとめて探せます</span>,
    <span><i className="ti ti-world" />みんなのツリー　公開されているツリーを見れます</span>,
    <span><i className="ti ti-trophy" />トロフィー　獲得したトロフィーを見れます</span>,
    <span><i className="ti ti-settings" />設定　文字サイズ変更、使い方はこちら</span>,
    <span>「<i className="ti ti-plus" />新規」から自分のツリーを作っていきましょう</span>,
  ],
  // ノード検索画面に初めて来たとき、絞り込み・並び替え・盤面サムネイルを案内する
  search: [
    <span><b>ノード検索</b>　名前・メモ・戦法で、全ツリーのノードをまとめて探せます</span>,
    <span>ステータスや戦法で<b>絞り込み</b>、勝率・好き度・頻度で<b>並び替え</b>。盤面のサムネイルからも探せます</span>,
  ],
  // 設定画面に初めて来たとき、追加した「表示項目カスタマイズ」を案内する
  settings: [
    <span><b>ノード編集画面に表示する項目</b>　使わない項目をオフにして、入力をすっきりできます</span>,
  ],
  map: [
    <span>ノードを<b>タップ</b>で編集</span>,
    <span><b>ドラッグ</b>で分岐のつなぎ替え</span>,
    <span>
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 2.5, verticalAlign: "middle", margin: "0 4px" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ display: "block", width: 3.5, height: 3.5, borderRadius: "50%", background: "#c8a96e" }} />
        ))}
      </span>
      　タップで目次を表示
    </span>,
  ],
  node: [
    <span><b>きほん</b>　相手の戦法と自分の戦法を入力</span>,
    <span><b>ついか</b>　さらに詳細を入力</span>,
    <span><b>子ノード</b>　「ここから分岐を追加」で次の分岐を作成できます</span>,
  ],
  // 盤面を初めて追加したとき、各ボタンの使い方を1つずつ指さしで案内する
  board: [
    <span><b>テンプレート</b>　定番の盤面をワンタップで呼び出せます</span>,
    <span><b>非表示</b>　盤面を非表示にできます（内容はそのまま残る）</span>,
    <span><b>元に戻す</b>　この画面を開いたときの盤面に戻します</span>,
    <span><b>盤面を削除</b>　盤面を消します（非表示と違い中身も消える）</span>,
    <span><b>動かす</b>　駒をタップ → 移動先をタップで駒を動かせます</span>,
    <span><b>スタンプ</b>　マスに目印をつけられます。矢印は始点 → 終点の順にタップ</span>,
    <span><b>消す</b>　つけたスタンプを消せます</span>,
    <span><b>棋譜を記録</b>　その間に動かした手順を記録し、あとで再生できます</span>,
  ],
};

// 各トーストが指さす対象（data-onboard 属性値）。null は指さし対象なし（トーストのみ）
export const ONBOARD_TARGETS = {
  list: ["search", "public", "trophy", "settings", "new"],
  // search / settings は指さし対象なし（中央にトーストのみ表示）
  map:  ["map-node", "map-node", "map-menu"],
  node: ["kihon", "tsuika", "children"],
  board: ["board-tmpl", "board-hide", "board-undo", "board-delete", "board-move", "board-stamp", "board-erase", "board-kifu"],
};

// 対象ごとの指さし設定。dir: 指の向き（up=下から上 / down=上から下）、block: スクロール位置
const ONBOARD_TARGET_OPTS = {
  tsuika:   { block: "start" },           // 「ついか」を画面上部に出す
  children: { block: "center", dir: "down" }, // 「子ノード」は下にあるので下向きの指で指す
};

// ── 表示ロジック ─────────────────────────────────
// screen / session / activeTree の変化を見て、初回だけトーストを順に表示する。
// 返り値: { onboard, fingerPos, advanceOnboard, startBoardOnboard }
export function useOnboarding({ screen, session, activeTree }) {
  const [onboard,   setOnboard]   = useState(null); // 表示中の初回トースト { screen, index }（null=非表示）
  const [fingerPos, setFingerPos] = useState(null); // 指さし（👆）の画面座標 { x, y, dir }。null=非表示
  const onboardTimer = useRef(null);

  // 画面に初めて来たら最初の1枚を表示。複数枚ある画面は順番に切り替える。
  useEffect(() => {
    if (!session) return;
    // map / node はツリーを開いてから表示する
    if ((screen === "map" || screen === "node") && !activeTree) return;
    if (!ONBOARD_MESSAGES[screen]) return;
    if (!shouldShowOnboard(screen)) return;

    // 「表示済み」は全枚数を見終えた時点で記録する（途中で閉じても次回また出す）
    setOnboard({ screen, index: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, session, activeTree]);

  // 盤面を初めて追加したときに、盤面ボタンの使い方トースト（8枚）を開始する
  const startBoardOnboard = useCallback(() => {
    if (!shouldShowOnboard("board")) return;
    setOnboard({ screen: "board", index: 0 });
  }, []);

  // 現在のトーストを次の1枚へ。最後まで見たら「表示済み」にして閉じる。
  const advanceOnboard = () => {
    if (!onboard) return;
    const msgs = ONBOARD_MESSAGES[onboard.screen] || [];
    if (onboard.index + 1 < msgs.length) {
      setOnboard({ ...onboard, index: onboard.index + 1 });
    } else {
      markOnboardSeen(onboard.screen);
      setOnboard(null);
    }
  };

  // 表示中のトーストを一定時間で自動的に次の1枚へ進める
  useEffect(() => {
    if (!onboard) return;
    const list  = ONBOARD_MESSAGES[onboard.screen] || [];
    const delay = list.length > 1 ? 4500 : 8000;
    if (onboardTimer.current) clearTimeout(onboardTimer.current);
    onboardTimer.current = setTimeout(advanceOnboard, delay);
    return () => { if (onboardTimer.current) clearTimeout(onboardTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboard]);

  // ── 指さし（👆）の位置を、対象要素の実際の位置から計算する ──
  useEffect(() => {
    if (!onboard) { setFingerPos(null); return; }
    const targetName = (ONBOARD_TARGETS[onboard.screen] || [])[onboard.index];
    if (!targetName) { setFingerPos(null); return; }
    const opt = ONBOARD_TARGET_OPTS[targetName] || {};
    const dir = opt.dir || "up";

    // 指を対象の上／下に置く（dir=up は真下から上向き、down は真上から下向き）。画面外なら出さない。
    const measure = () => {
      const el = document.querySelector(`[data-onboard="${targetName}"]`);
      if (!el) { setFingerPos(null); return; }
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) { setFingerPos(null); return; }
      // ノード詳細は見出し（きほん等）が左寄せなので、中央ではなく左の文字あたりを指す
      const x = onboard.screen === "node" ? r.left + 40 : r.left + r.width / 2;
      const y = dir === "down" ? r.top - 2 : r.bottom + 2;
      setFingerPos({ x, y, dir });
    };

    // トーストの文面が切り替わった瞬間に古い指を消す。これをしないと、新しい位置を
    // 計測し終えるまでの間だけ指が前のボタンを指したままになり、文面と指がズレて見える。
    setFingerPos(null);

    const el = document.querySelector(`[data-onboard="${targetName}"]`);
    // ノード詳細・盤面では対象（ついか／子ノードや各盤面ボタン）が画面に映るようスクロールしてから計測する
    const needsScroll = onboard.screen === "node" || onboard.screen === "board";
    if (needsScroll && el) el.scrollIntoView({ block: opt.block || "center", behavior: "smooth" });

    // 対象のレンダリング／スクロール完了を待ってから計測する。
    // 盤面は対象（ボタン群）が既に表示済みでスクロール量も小さいので短め、
    // ノード詳細は離れた見出しまでスクロールするため長めに待つ。
    const delay = onboard.screen === "node" ? 420 : needsScroll ? 180 : 60;
    const t = setTimeout(measure, delay);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [onboard]);

  return { onboard, fingerPos, advanceOnboard, startBoardOnboard };
}

// ── 表示レイヤ（トースト＋指さし）──────────────────
export function OnboardingLayer({ onboard, fingerPos, onAdvance }) {
  if (!onboard) return null;
  const msgs = ONBOARD_MESSAGES[onboard.screen] || [];
  if (!msgs[onboard.index]) return null;

  // 指さし対象があるカードは、指の位置が定まるまでトーストを出さない。
  // （切り替え直後の一瞬だけ fingerPos が null になり、中央に表示されてから
  //   指の位置へ移動する「ワープ」を防ぐ）
  const targetName = (ONBOARD_TARGETS[onboard.screen] || [])[onboard.index];
  const showToast  = !(targetName && !fingerPos);

  // 指さしの向きに合わせてトーストを置き、指・ボタンとの重なりを防ぐ。
  //  ・指が上向き(👆 ＝指は対象の下)：トーストは指の下
  //  ・指が下向き(👇 ＝指は対象の上)：トーストは指の上（下端を指の上端に合わせる）
  //  ・指さしが無いトースト：従来どおり画面中央
  let toastTop, toastTransform;
  if (!fingerPos) {
    toastTop = "50%";
    toastTransform = "translate(-50%, -50%)";
  } else if (fingerPos.dir === "down") {
    toastTop = Math.max(fingerPos.y - 48, 150);
    toastTransform = "translate(-50%, -100%)";
  } else {
    toastTop = Math.min(fingerPos.y + 48, window.innerHeight - 150);
    toastTransform = "translateX(-50%)";
  }
  const multi = msgs.length > 1;

  return (
    <>
      {showToast && (
        <div
          onClick={onAdvance}
          style={{
            position:     "fixed",
            top:          toastTop,
            left:         "50%",
            transform:    toastTransform,
            zIndex:       200,
            width:        "calc(100% - 32px)",
            maxWidth:     360,
            background:   "rgba(26,15,0,0.9)",
            color:        "#faf4e8",
            fontSize:     "0.8125rem",
            fontFamily:   "'Noto Serif JP', serif",
            lineHeight:   1.7,
            padding:      "12px 16px",
            borderRadius: 16,
            display:      "flex",
            flexDirection: "column",
            gap:          8,
            cursor:       "pointer",
            boxShadow:    "0 4px 20px rgba(26,15,0,0.3)",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <i className="ti ti-bulb" style={{ fontSize: "0.9375rem", color: "#c8a96e", flexShrink: 0, marginTop: 2 }} />
            <span style={{ flex: 1 }}>{msgs[onboard.index]}</span>
          </div>
          {multi && (
            <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
              {msgs.map((_, i) => (
                <span key={i} style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: i === onboard.index ? "#c8a96e" : "rgba(200,169,110,0.3)",
                }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 指さし：対象の上／下に表示し、対象を指す（dir=up は👆、down は👇）*/}
      {fingerPos && (
        <div
          style={{
            position:      "fixed",
            left:          fingerPos.x,
            top:           fingerPos.y,
            // up は指の上端を対象下端に、down は指の下端を対象上端に合わせる
            transform:     fingerPos.dir === "down" ? "translate(-50%, -100%)" : "translateX(-50%)",
            zIndex:        201,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              display:   "block",
              fontSize:  "1.75rem",
              filter:    "drop-shadow(0 2px 3px rgba(26,15,0,0.35))",
              animation: `${fingerPos.dir === "down" ? "nekko-finger-down" : "nekko-finger-up"} 0.9s ease-in-out infinite`,
            }}
          >
            {fingerPos.dir === "down" ? "👇" : "👆"}
          </span>
        </div>
      )}
    </>
  );
}
