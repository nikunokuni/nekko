// ══════════════════════════════════════════════════
// useRecoveryCode.js  ―  リカバリーコードの発行管理
//   ログイン確定後、未発行ならサーバー側で発行して平文コードを受け取り、
//   スクリーンショット案内モーダル（RecoveryCodeModal）を表示させる。
//   平文コードはこの state 上にしか存在しない（DBはハッシュのみ）。
// ══════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import { hasRecoveryCode, generateRecoveryCode } from "../db";

export function useRecoveryCode(session) {
  const [newCode, setNewCode] = useState(null); // 発行直後の平文コード（モーダル表示中のみ保持）
  // 同一ユーザーでの二重チェック防止（StrictMode の effect 二重実行で generate が
  // 2回走ると、表示したコードとDBのハッシュがズレるため必ずガードする）
  const checkedFor = useRef(null);

  useEffect(() => {
    if (!session) { checkedFor.current = null; return; }
    if (checkedFor.current === session.user.id) return;
    checkedFor.current = session.user.id;
    (async () => {
      try {
        // 確認に失敗したときは発行しない（発行済みコードを意図せず上書きしないため）
        const has = await hasRecoveryCode();
        if (!has) {
          const code = await generateRecoveryCode();
          if (code) setNewCode(code);
        }
      } catch (e) {
        // マイグレーション未適用・オフライン等では静かに何もしない（アプリ動作は妨げない）
        console.error("recovery code init error:", e);
      }
    })();
  }, [session]);

  // 設定画面からの再発行（古いコードは無効になる）
  const regenerate = async () => {
    try {
      const code = await generateRecoveryCode();
      if (code) setNewCode(code);
      return !!code;
    } catch {
      alert("リカバリーコードの発行に失敗しました。通信環境を確認してください。");
      return false;
    }
  };

  const dismiss = () => setNewCode(null);

  return { newCode, regenerate, dismiss };
}
