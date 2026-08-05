// ══════════════════════════════════════════════════════════════════
// KifuListScreen.jsx  ―  棋譜ライブラリ画面
//   棋譜（kifus テーブル）の一覧・保存・更新・削除と、各モーダルの開け閉め。
//   ノードへの取り込みはノード編集画面側（KifuPickerModal）から行う。
//
//   モーダルは4つとも1画面で完結する独立した機能なので、screens/kifu/ に
//   1ファイルずつ分けてある（この画面が持つのは「どれを開いているか」だけ）。
//     ImportKifuModal … ファイル／テキストの取り込み
//     RecordKifuModal … 盤に並べて棋譜を作る
//     KifuPreviewModal… 保存済み棋譜の再生
//     EditKifuModal   … 名前・タグ・メモの変更
// ══════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { T } from "../theme";
import { ConfirmDeleteModal } from "../components/uiParts";
import { recordAction, getCustomTagsByGroup, addCustomTag, addKifuPlayerName } from "../rewards";
import { recomputeFeatures } from "../kifuAnalyze";
import { fetchMyKifus, fetchKifu, createKifu, updateKifu, deleteKifu, kifuRowToKifu } from "../db";
import { outcomeLabel } from "./kifu/shared";
import { ImportKifuModal } from "./kifu/ImportKifuModal";
import { RecordKifuModal } from "./kifu/RecordKifuModal";
import { KifuPreviewModal } from "./kifu/KifuPreviewModal";
import { EditKifuModal } from "./kifu/EditKifuModal";

// 一覧カードの日付表示（例: 2026/7/18）
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}


// ══════════════════════════════════════════════════════════════════
// KifuCard: 棋譜一覧の1行カード
// ══════════════════════════════════════════════════════════════════
function KifuCard({ kifu, onOpen, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const handleMenuToggle = (e) => { e.stopPropagation(); setMenuOpen((v) => !v); };
  const handleRename     = (e) => { e.stopPropagation(); setMenuOpen(false); onRename(kifu); };
  const handleDelete     = (e) => { e.stopPropagation(); setMenuOpen(false); onDelete(kifu); };

  return (
    <div style={{ position: "relative", marginBottom: 10 }}>
      <div
        onClick={() => onOpen(kifu)}
        style={{
          padding:      "14px 16px",
          borderRadius: T.radius.lg,
          border:       "0.5px solid rgba(200,169,110,0.35)",
          background:   T.goldBg,
          cursor:       "pointer",
          transition:   "all 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.gold)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(200,169,110,0.35)")}
      >
        {/* 1行目: 名前 + メニューボタン */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: T.fontSize.xxl, fontWeight: 600, color: T.ink, fontFamily: T.fontTitle, flex: 1 }}>
            {kifu.name}
          </span>
          <button
            onClick={handleMenuToggle}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1rem", padding: "2px 4px", borderRadius: 6, lineHeight: 1 }}
          >
            <i className="ti ti-dots-vertical" />
          </button>
        </div>

        {/* 2行目: 戦法タグ */}
        {(kifu.tags || []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
            {kifu.tags.map((tag) => (
              <span key={tag} style={{ fontSize: T.fontSize.sm, padding: "3px 9px", borderRadius: T.radius.sm, background: T.goldLight, color: T.gold, fontFamily: T.fontSerif }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 3行目: 勝敗 / 戦法 / 手数 / 保存日 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {(() => {
            const o = outcomeLabel(kifu);
            return o && (
              <span style={{
                fontSize: T.fontSize.sm, fontFamily: T.fontSerif, color: o.color,
                border: `0.5px solid ${o.color}`, borderRadius: T.radius.sm, padding: "1px 7px",
              }}>{o.text}</span>
            );
          })()}
          {/* 自動で読み取れた戦型。ここが埋まっている棋譜だけが傾向分析に載る */}
          {kifu.features && (
            <span style={{ fontSize: T.fontSize.sm, color: T.brown, fontFamily: T.fontSerif }}>
              {kifu.features.myStrategy} 対 {kifu.features.oppStrategy}
            </span>
          )}
          <span style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>
            <i className="ti ti-chess" style={{ fontSize: "0.625rem", marginRight: 3 }} />
            {kifu.moveCount}手
          </span>
          <span style={{ fontSize: T.fontSize.sm, color: T.inkFaint, marginLeft: "auto", fontFamily: T.fontSerif }}>
            {formatDate(kifu.playedAt || kifu.createdAt)}
          </span>
        </div>
      </div>

      {/* コンテキストメニュー */}
      {menuOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
          <div style={{
            position: "absolute", top: 10, right: 0, zIndex: 50,
            background: T.cream, borderRadius: T.radius.md,
            border: "0.5px solid rgba(200,169,110,0.5)",
            boxShadow: "0 6px 24px rgba(26,15,0,0.15)",
            overflow: "hidden", minWidth: 140,
          }}>
            <div
              onClick={handleRename}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", fontSize: T.fontSize.lg, cursor: "pointer", color: T.ink, fontFamily: T.fontSerif }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="ti ti-pencil" style={{ fontSize: "0.875rem", color: T.gold }} />名前・タグ・メモを編集
            </div>
            <div style={{ height: "0.5px", background: T.inkLineFaint }} />
            <div
              onClick={handleDelete}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", fontSize: T.fontSize.lg, cursor: "pointer", color: T.red, fontFamily: T.fontSerif }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.redBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="ti ti-trash" style={{ fontSize: "0.875rem" }} />削除
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// KifuList: 棋譜ライブラリ画面
// ══════════════════════════════════════════════════════════════════
export function KifuList({ userId, trees = [], onBack, onInsight, onGoSettings, onSendToInbox }) {
  const [kifus,   setKifus]   = useState([]);
  const [loading, setLoading] = useState(true);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [previewTarget,   setPreviewTarget]   = useState(null); // snapshots込みの棋譜
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [editTarget,      setEditTarget]      = useState(null);
  const [deleteTarget,    setDeleteTarget]    = useState(null);
  // 戦法タグはノード編集画面と同じユーザー資産（profiles）を共有する
  const [customTags,      setCustomTags]      = useState(() => getCustomTagsByGroup());

  const handleAddCustomTag = (tag, group) => {
    addCustomTag(tag, group);
    setCustomTags(getCustomTagsByGroup());
    recordAction("customTag");
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchMyKifus(userId).then(({ data }) => {
      if (cancelled) return;
      setKifus((data || []).map(kifuRowToKifu));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // 取り込み（1件でも複数件でも同じ経路を通る）。
  // 保存できた件数を返し、途中で失敗しても残りの保存は続ける
  // （50件中1件のパースミスで全部やり直しになるのを避けるため）。
  const handleImportMany = async (items, onProgress) => {
    const saved = [];
    for (const it of items) {
      const { data, error } = await createKifu({
        userId,
        name:       it.name,
        tags:       it.tags,
        snapshots:  it.snapshots,
        sourceText: it.sourceText,
        // 取り込み時に解析済みの対局情報を一緒に保存する。
        // 特徴（features）は自分の側が決まって初めて計算できるので、
        // 側を手で選び直した場合に備えてここで計算し直す。
        senteName: it.analysis?.senteName,
        goteName:  it.analysis?.goteName,
        handicap:  it.analysis?.handicap,
        result:    it.analysis?.result ?? null,
        mySide:    it.analysis?.mySide ?? null,
        playedAt:  it.analysis?.playedAt ?? null,
        features:  recomputeFeatures({
          snapshots: it.snapshots,
          mySide:    it.analysis?.mySide ?? null,
          handicap:  it.analysis?.handicap,
        }),
        metaParsed: true,
      });
      if (!error && data) saved.push(kifuRowToKifu(data));
      onProgress?.(saved.length);
    }
    if (saved.length > 0) setKifus((prev) => [...saved, ...prev]);
    return saved.length;
  };

  // 盤に並べて作った棋譜を保存する（棋譜入力）。
  // 原文（sourceText）は無いが、対局情報は利用者が答えたものが揃っているので
  // metaParsed: true にする。false にすると「未解析の棋譜」として後追い解析に拾われ、
  // 空の原文を読み直した結果で先後や勝敗が消える。
  const handleSaveRecorded = async ({ name, tags, memo, snapshots, mySide, result, playedAt }) => {
    const { data, error } = await createKifu({
      userId, name, tags, memo, snapshots,
      // 手入力は初期配置から並べるので必ず平手（特徴を計算してよい）
      handicap: "平手",
      result, mySide, playedAt,
      features: recomputeFeatures({ snapshots, mySide, handicap: "平手" }),
      metaParsed: true,
    });
    if (error || !data) return false;
    setKifus((prev) => [kifuRowToKifu(data), ...prev]);
    // トロフィー「棋譜記録者（盤面に棋譜を記録する）」は、ノードの盤で録ったときと
    // 同じ達成なので、ここでも記録する
    recordAction("kifu");
    return true;
  };

  // 保存済み棋譜の先後を手で決める。
  // 選んだ名前を覚えるので、以降の取り込みと「まとめて解析する」でも同じ判定になる。
  const handleSetSide = async (kifu, side) => {
    const name = side === "sente" ? kifu.senteName : kifu.goteName;
    if (name) addKifuPlayerName(name);
    const features = recomputeFeatures({
      snapshots: kifu.snapshots, mySide: side, handicap: kifu.handicap,
    });
    const { error } = await updateKifu(kifu.id, { mySide: side, features });
    if (error) { alert("保存に失敗しました。もう一度お試しください。"); return; }
    const patch = { mySide: side, features };
    setKifus((prev) => prev.map((k) => (k.id === kifu.id ? { ...k, ...patch } : k)));
    setPreviewTarget((t) => (t && t.id === kifu.id ? { ...t, ...patch } : t));
  };

  // カードタップ → snapshots込みで取得して再生プレビューを開く
  const handleOpen = async (kifu) => {
    if (previewLoading) return;
    setPreviewLoading(true);
    const { data, error } = await fetchKifu(kifu.id);
    setPreviewLoading(false);
    if (error || !data) {
      alert("棋譜の読み込みに失敗しました。もう一度お試しください。");
      return;
    }
    setPreviewTarget(kifuRowToKifu(data));
  };

  const handleEdit = async (kifuId, patch) => {
    const { error } = await updateKifu(kifuId, patch);
    if (error) { alert("保存に失敗しました。もう一度お試しください。"); return; }
    setKifus((prev) => prev.map((k) => (k.id === kifuId ? { ...k, ...patch } : k)));
  };

  const handleDelete = async (kifuId) => {
    const { error } = await deleteKifu(kifuId);
    if (error) { alert("削除に失敗しました。もう一度お試しください。"); return; }
    setKifus((prev) => prev.filter((k) => k.id !== kifuId));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* ── ヘッダー ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 18px 12px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <button onClick={onBack} aria-label="ツリー一覧にもどる" style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2, lineHeight: 1 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: "1.125rem", color: T.ink, letterSpacing: "0.1em" }}>
          棋譜ライブラリ
        </div>
        {/* ためた棋譜の傾向を見る画面へ。読み取り専用で、ツリーには手を加えない */}
        <button
          onClick={onInsight}
          aria-label="棋譜の傾向"
          title="棋譜の傾向"
          style={{
            background: "none", border: "none", cursor: "pointer", color: T.gold,
            fontSize: "1.125rem", padding: 2, lineHeight: 1, marginRight: 4,
          }}
        >
          <i className="ti ti-chart-histogram" />
        </button>
        {/* 盤に並べて棋譜を作る。ヘッダーは横幅が足りないので絵だけのボタンにし、
            読み上げとテストから指せるよう aria-label で名前を付ける
            （アイコンフォントは ::before で文字を差し込むため title だけでは足りない） */}
        <button
          data-onboard="kifu-record"
          onClick={() => setShowRecordModal(true)}
          aria-label="棋譜入力"
          title="棋譜入力（盤に並べて作る）"
          style={{
            background: "none", border: "none", cursor: "pointer", color: T.gold,
            fontSize: "1.125rem", padding: 2, lineHeight: 1, marginRight: 4,
          }}
        >
          <i className="ti ti-record-mail" />
        </button>
        <button
          data-onboard="kifu-save"
          onClick={() => setShowImportModal(true)}
          style={{ background: T.gold, border: "none", cursor: "pointer", color: T.cream, fontSize: T.fontSize.lg, padding: "6px 14px", borderRadius: T.radius.md, fontFamily: T.fontSerif, display: "flex", alignItems: "center", gap: 4 }}
        >
          <i className="ti ti-plus" style={{ fontSize: "0.8125rem" }} /> 棋譜を保存
        </button>
      </div>

      {/* ── リスト ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.inkFaint, fontSize: T.fontSize.base }}>
            読み込み中...
          </div>
        ) : kifus.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.inkFaint, fontSize: T.fontSize.lg }}>
            <i className="ti ti-chess" style={{ fontSize: "2.5rem", display: "block", marginBottom: 12 }} />
            保存した棋譜がまだありません<br />
            <span style={{ fontSize: T.fontSize.md }}>「棋譜を保存」から実戦の棋譜を貯めておき、<br />ノード編集画面から研究に取り込めます</span>
            {/* 棋譜ファイルが手に入らない対局（道場・大会・棋書）はここから作れる。
                ヘッダーの絵だけのボタンでは気づけないので、空のときは言葉で出す */}
            <button
              onClick={() => setShowRecordModal(true)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                margin: "20px auto 0", padding: "9px 16px", borderRadius: T.radius.md,
                border: `0.5px dashed ${T.gold}`, background: "transparent",
                color: T.gold, cursor: "pointer", fontSize: T.fontSize.base, fontFamily: T.fontSerif,
              }}
            >
              <i className="ti ti-record-mail" style={{ fontSize: "0.875rem" }} />
              棋譜ファイルが無いときは、盤に並べて入力する
            </button>
          </div>
        ) : (
          kifus.map((k) => (
            <KifuCard key={k.id} kifu={k} onOpen={handleOpen} onRename={setEditTarget} onDelete={setDeleteTarget} />
          ))
        )}
      </div>

      {/* ── モーダル群 ── */}
      {showImportModal && (
        <ImportKifuModal
          onClose={() => setShowImportModal(false)}
          onImportMany={handleImportMany}
          customTags={customTags}
          onAddCustomTag={handleAddCustomTag}
          onGoSettings={onGoSettings}
        />
      )}
      {showRecordModal && (
        <RecordKifuModal
          onClose={() => setShowRecordModal(false)}
          onSave={handleSaveRecorded}
          customTags={customTags}
          onAddCustomTag={handleAddCustomTag}
        />
      )}
      {previewTarget && (
        <KifuPreviewModal
          kifu={previewTarget}
          onClose={() => setPreviewTarget(null)}
          // onSetSide / trees / onSendToInbox を渡し忘れると、モーダル側は
          // 「ツリーへ送る」を丸ごと出さず（onSendToInbox && trees.length > 0 で判定）、
          // 先後の選択ボタンも onSetSide?.() が no-op になって黙って効かなくなる。
          // 見た目が壊れないぶん気づきにくいので、消さないこと。
          onSetSide={(side) => handleSetSide(previewTarget, side)}
          trees={trees}
          onSendToInbox={onSendToInbox}
        />
      )}
      {editTarget && (
        <EditKifuModal
          kifu={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
          customTags={customTags}
          onAddCustomTag={handleAddCustomTag}
        />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          title={`「${deleteTarget.name}」を削除しますか？`}
          message={<>ノードに取り込み済みの棋譜には影響しません。<br />この操作は取り消せません。</>}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget.id)}
        />
      )}
    </div>
  );
}
