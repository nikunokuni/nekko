// ══════════════════════════════════════════════════
// db.js  ―  Supabase クライアント + 全 DB 操作
// ══════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";
// ノードの「キー名 ↔ DB列名 ↔ 既定値」の台帳。項目を増やすときはここだけを直す
import { nodeToInsertRow, nodePatchToRow, nodeRowToNode } from "./nodeFields";
// 棋譜の台帳。一覧で読む列（KIFU_META_COLUMNS）もここから生成される
import { kifuToInsertRow, kifuPatchToRow, kifuRowToKifu, KIFU_META_COLUMNS } from "./kifuFields";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── ユーティリティ ────────────────────────────────
// ユーザー名を架空のメールアドレスに変換（Supabase Auth は email 必須のため）
function idToFakeEmail(id) {
  const safe = id.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  return `${safe}@nekko.local`;
}

// ── Auth ──────────────────────────────────────────
export async function signUp({ username, password, displayName }) {
  const fakeEmail = idToFakeEmail(username);
  return supabase.auth.signUp({
    email: fakeEmail,
    password,
    options: { data: { username: username.trim(), display_name: displayName || username } },
  });
}

export async function signIn({ email, password }) {
  return supabase.auth.signInWithPassword({ email: idToFakeEmail(email), password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ── リカバリーコード ───────────────────────────────
// コードはサーバー側（SECURITY DEFINER 関数）で生成し、DBにはハッシュのみ保存される。
// 詳細は supabase/migrations/20260717_recovery_code.sql を参照。

/** ログイン中ユーザーがリカバリーコードを発行済みかどうか */
export async function hasRecoveryCode() {
  const { data, error } = await supabase.rpc("has_recovery_code");
  if (error) { console.error("has_recovery_code error:", error); throw error; }
  return !!data;
}

/** リカバリーコードを発行（再発行時は上書き）。平文コードはこの返り値でしか得られない */
export async function generateRecoveryCode() {
  const { data, error } = await supabase.rpc("generate_recovery_code");
  if (error) { console.error("generate_recovery_code error:", error); throw error; }
  return data || null;
}

/** ユーザー名＋リカバリーコードでパスワードを再設定する（未ログインで呼べる） */
export async function resetPasswordWithRecovery({ username, code, newPassword }) {
  const { error } = await supabase.rpc("reset_password_with_recovery", {
    p_username:     username,
    p_code:         code,
    p_new_password: newPassword,
  });
  if (error) { console.error("reset_password_with_recovery error:", error); throw error; }
}

// ── Profile ───────────────────────────────────────
export async function getProfile(userId) {
  return supabase.from("profiles").select("*").eq("id", userId).single();
}

// プロフィール行を更新する（ユーザー状態＝実績・カスタムタグの永続化に使う）。
// patch は DB カラム名（login_days / actions / earned_badges /
// custom_strategy_tags / custom_comment_tags 等）をそのまま渡す。
export async function updateProfile(userId, patch) {
  const result = await supabase.from("profiles").update(patch).eq("id", userId).select().single();
  if (result.error) console.error("updateProfile error:", result.error);
  return result;
}

// ── Trees ─────────────────────────────────────────
export async function fetchMyTrees(userId) {
  const result = await supabase
    .from("trees")
    .select("*, nodes(id, status, is_root)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (result.error) console.error("fetchMyTrees error:", result.error);
  return result;
}

export async function fetchPublicTrees() {
  const result = await supabase
    .from("trees")
    .select("*, profiles(username, display_name)")
    .eq("is_public", true)
    .order("liked_by", { ascending: false });
  if (result.error) console.error("fetchPublicTrees error:", result.error);
  return result;
}

export async function createTree({ userId, name, tags = [], active = true }) {
  const result = await supabase
    .from("trees")
    .insert({ user_id: userId, name, tags, active })
    .select()
    .single();
  if (result.error) console.error("createTree error:", result.error);
  return result;
}

export async function updateTree(treeId, patch) {
  const result = await supabase.from("trees").update(patch).eq("id", treeId).select().single();
  if (result.error) console.error("updateTree error:", result.error);
  return result;
}

export async function deleteTree(treeId) {
  const result = await supabase.from("trees").delete().eq("id", treeId);
  if (result.error) console.error("deleteTree error:", result.error);
  return result;
}

// 公開ツリーをサーバー側RPCで一括コピー（1トランザクション）
export async function copyTree(treeId, newName = null) {
  return supabase.rpc("copy_tree", { p_source_tree_id: treeId, p_new_name: newName });
}

// ── Nodes ─────────────────────────────────────────
export async function fetchNodes(treeId) {
  // sort_order 同値のときの並びを安定させるため created_at を第2キーにする
  const result = await supabase
    .from("nodes")
    .select("*")
    .eq("tree_id", treeId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (result.error) console.error("fetchNodes error:", result.error);
  return result;
}

/** 全ツリー横断のノード検索用に、自分の全ノードを取得する。
 *  盤面サムネイル用に board は含めるが、kifu / stamps は重いので含めない。
 *  ルートはツリー名と同一のため除外する（ツリー自体は一覧から探せる）。 */
export async function fetchAllMyNodes(userId) {
  const result = await supabase
    .from("nodes")
    .select("id, tree_id, label, status, memo, situation, my_approach, orientation, win_rate, like_level, usage_level, board, board_hidden, created_at")
    .eq("user_id", userId)
    .eq("is_root", false)
    .order("created_at", { ascending: false });
  if (result.error) console.error("fetchAllMyNodes error:", result.error);
  return result;
}

/** ノードを1つ作る。項目の既定値と列名は nodeFields.js の台帳が持つ。
 *  treeId / userId 以外は台帳にある項目をそのまま渡せる（省略した項目は既定値）。 */
export async function createNode({ treeId, userId, ...fields }) {
  const result = await supabase
    .from("nodes")
    .insert({ tree_id: treeId, user_id: userId, ...nodeToInsertRow(fields) })
    .select()
    .single();
  if (result.error) {
    const { message, code, details, hint } = result.error;
    console.error("createNode error:", JSON.stringify({ message, code, details, hint }));
  }
  return result;
}

export async function updateNode(nodeId, patch) {
  // フロント側キー名 → DB カラム名への変換は台帳（nodeFields.js）が持つ
  const result = await supabase.from("nodes").update(nodePatchToRow(patch)).eq("id", nodeId).select().single();
  if (result.error) console.error("updateNode error:", result.error);
  return result;
}

// アプリ全体の統計（全ユーザーのアカウント数・ツリー総数・ノード総数）を取得する。
// RLS を回避して全行を数えるため、DB 側の SECURITY DEFINER 関数 get_app_stats を呼ぶ。
// この関数は呼び出し元が開発者(niku)本人のときだけ結果を返す。
// 戻り値: { accounts, trees, nodes } / 権限が無い等で失敗した場合は null。
export async function getAppStats() {
  const { data, error } = await supabase.rpc("get_app_stats");
  if (error) { console.error("get_app_stats error:", error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    accounts: Number(row.accounts) || 0,
    trees:    Number(row.trees)    || 0,
    nodes:    Number(row.nodes)    || 0,
  };
}

export async function countUserNodes(userId) {
  // ルート（おおもとの戦法）は自動作成のため数えない。
  // 一覧カードの「🌱 個数」(is_root を除外) と集計基準を統一する。
  const { count } = await supabase
    .from("nodes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_root", false);
  return count ?? 0;
}

// ── Kifus（棋譜ライブラリ）───────────────────────────
// 棋譜はノードから独立した kifus テーブルに保存する。
// ノードへの取り込みは参照ではなくコピー（nodes.kifu へ複製）なので、
// ライブラリ側の削除・編集がノードに影響することはない。

/** 棋譜一覧をメタデータのみで取得する（snapshots は重いので含めない） */
export async function fetchMyKifus(userId) {
  const result = await supabase
    .from("kifus")
    .select(KIFU_META_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (result.error) console.error("fetchMyKifus error:", result.error);
  return result;
}

// 傾向分析が見る最大局数。棋譜は増える一方なので、上限を置かないと
// 読み込みが局数に比例して重くなり続ける。直近300局に線を引いてあるのは、
// それより前の将棋は棋力も指し方も今の自分と別物で、
// 混ぜると「今の傾向」がぼやけるため（古い将棋を切るのは統計上の都合ではなく学習上の判断）。
// 並びは played_at の新しい順なので、切り落とされるのは必ず古いほうから。
export const ANALYSIS_GAME_LIMIT = 300;

/** 傾向分析用。snapshots と source_text 以外の軽い列をまとめて読む。
 *  列を絞り込まず KIFU_META_COLUMNS を使い回すのは、必要な列を1つ書き漏らすと
 *  kifuRowToKifu が undefined を返して集計が静かに壊れるため
 *  （meta_parsed の記載漏れで全棋譜が「未解析」と誤判定される不具合があった）。
 *  除いた2列に比べれば残りはすべて小さく、まとめて読んでも通信量は変わらない。 */
export async function fetchKifusForAnalysis(userId, limit = ANALYSIS_GAME_LIMIT) {
  const result = await supabase
    .from("kifus")
    .select(KIFU_META_COLUMNS)
    .eq("user_id", userId)
    .order("played_at", { ascending: false })
    .limit(limit);
  if (result.error) console.error("fetchKifusForAnalysis error:", result.error);
  return result;
}

/** 対局情報が未解析の棋譜を、原文つきで少しずつ取得する（取り込み済み棋譜の後追い解析用）。
 *  source_text と snapshots は重いため、一度に全件は取らずバッチで回す。 */
export async function fetchKifusNeedingMeta(userId, limit = 20) {
  const result = await supabase
    .from("kifus")
    .select("id, name, source_text, snapshots")
    .eq("user_id", userId)
    .eq("meta_parsed", false)
    .limit(limit);
  if (result.error) console.error("fetchKifusNeedingMeta error:", result.error);
  return result;
}

/** 解析は済んでいるが「自分がどちら側か」だけ決まっていない棋譜を、名前つきで取得する。
 *  対局者名を新しく覚えたあと、過去の棋譜をまとめて判定し直すために使う。
 *  ここでは snapshots を読まない（名前の照合だけなら不要なため）。 */
export async function fetchKifusMissingSide(userId) {
  const result = await supabase
    .from("kifus")
    .select("id, name, sente_name, gote_name, handicap")
    .eq("user_id", userId)
    .eq("meta_parsed", true)
    .is("my_side", null);
  if (result.error) console.error("fetchKifusMissingSide error:", result.error);
  return result;
}

/** 未解析の棋譜が何件あるか（後追い解析の案内を出すかどうかの判定に使う） */
export async function countKifusNeedingMeta(userId) {
  const { count } = await supabase
    .from("kifus")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("meta_parsed", false);
  return count ?? 0;
}

/** 棋譜1件を snapshots 込みで取得する（プレビュー・取り込み時に呼ぶ）。
 *  source_text（KIF/CSA原文・数KB）は再生・取り込みでは使わないため転送しない。
 *  エクスポート機能を作るときに原文込みの専用取得関数を追加する。 */
export async function fetchKifu(kifuId) {
  const result = await supabase
    .from("kifus")
    .select(`${KIFU_META_COLUMNS}, snapshots`)
    .eq("id", kifuId)
    .single();
  if (result.error) console.error("fetchKifu error:", result.error);
  return result;
}

/** 自分の側を選び直したときの特徴の再計算に、snapshots だけを取り直す */
export async function fetchKifuSnapshots(kifuId) {
  const result = await supabase
    .from("kifus")
    .select("id, snapshots")
    .eq("id", kifuId)
    .single();
  if (result.error) console.error("fetchKifuSnapshots error:", result.error);
  return result;
}

// 一度にまとめて取る snapshots の件数。1局の snapshots は数十KBあるので、
// 全件を1回で取ると通信が詰まる。かといって1件ずつ取ると往復の回数だけ待たされる
// （後追い解析で100局あれば100往復になる）。その間を取ってバッチで回す。
const SNAPSHOT_BATCH = 20;

/** 複数の棋譜の snapshots をまとめて取る（後追い解析で使う）。
 *  @returns {Map<string, Array>} 棋譜ID → snapshots。取れなかったIDは入らない */
export async function fetchKifuSnapshotsMany(kifuIds) {
  const out = new Map();
  for (let i = 0; i < kifuIds.length; i += SNAPSHOT_BATCH) {
    const chunk = kifuIds.slice(i, i + SNAPSHOT_BATCH);
    const { data, error } = await supabase
      .from("kifus")
      .select("id, snapshots")
      .in("id", chunk);
    if (error) { console.error("fetchKifuSnapshotsMany error:", error); continue; }
    for (const row of data || []) out.set(row.id, row.snapshots || []);
  }
  return out;
}

/** 棋譜を1件保存する。項目の既定値と列名は kifuFields.js の台帳が持つ。 */
export async function createKifu({ userId, snapshots, ...fields }) {
  const result = await supabase
    .from("kifus")
    .insert({
      user_id: userId,
      ...kifuToInsertRow({ ...fields, snapshots }),
      // 手数 = スナップ数 - 1（先頭は初期局面）。渡された値ではなく必ず数え直す
      move_count: Math.max(0, (snapshots?.length ?? 0) - 1),
    })
    .select(KIFU_META_COLUMNS)
    .single();
  if (result.error) console.error("createKifu error:", result.error);
  return result;
}

export async function updateKifu(kifuId, patch) {
  // キー名 → 列名の変換は台帳（kifuFields.js）が持つ。
  // snapshots / source_text は重いので返させない（KIFU_META_COLUMNS）
  const result = await supabase.from("kifus").update(kifuPatchToRow(patch))
    .eq("id", kifuId).select(KIFU_META_COLUMNS).single();
  if (result.error) console.error("updateKifu error:", result.error);
  return result;
}

export async function deleteKifu(kifuId) {
  const result = await supabase.from("kifus").delete().eq("id", kifuId);
  if (result.error) console.error("deleteKifu error:", result.error);
  return result;
}

// ── DBの棋譜行（snake_case）を内部形式（camelCase）へ変換する ──
// 一覧取得（snapshots なし）と単体取得（snapshots あり）の両方に対応する
// 変換規則も台帳（kifuFields.js）が持つ。既存の import 先を変えずに済ませるため再輸出する。
export { kifuRowToKifu };

// ── DBのノード行（snake_case）を内部ノード形式（camelCase）へ変換する ──
// 変換規則も台帳（nodeFields.js）が持つ。ここからの再輸出は、既存の import 先を
// 変えずに済ませるため（画面・フックは今までどおり db から取れる）。
// childIds は呼び出し側で親子関係を構築する際に埋める（既存値があれば維持）
export { nodeRowToNode };

// ── フラットなノード配列からツリーオブジェクトを組み立てる ──
export function buildTreeFromNodes(treeRow, flatNodes) {
  const nodeMap = {};
  flatNodes.forEach(n => {
    nodeMap[n.id] = nodeRowToNode(n);
  });

  // 親子関係を構築
  flatNodes.forEach(n => {
    if (n.parent_id && nodeMap[n.parent_id]) {
      nodeMap[n.parent_id].childIds.push(n.id);
    }
  });

  const rootNode = flatNodes.find(n => n.is_root);
  return {
    id:      treeRow.id,
    name:    treeRow.name,
    tags:    treeRow.tags    || [],
    quickMemo: treeRow.quick_memo || "",
    nodes:   nodeMap,
    rootId:  rootNode?.id || null,
  };
}

/** ツリーの「とりあえず」ノードを返す。無ければ作る。
 *  ツリー作成時に自動で作られるが、この機能より前に作ったツリーには無いので、
 *  棋譜からノードを作るときなど、必要になった時点で用意する。 */
export async function ensureInboxNode(treeId, userId) {
  const { data: existing } = await supabase
    .from("nodes").select("*").eq("tree_id", treeId).eq("is_inbox", true).limit(1);
  if (existing && existing.length) return existing[0];

  const { data: root } = await supabase
    .from("nodes").select("id").eq("tree_id", treeId).eq("is_root", true).limit(1).single();
  if (!root) return null;

  const { data, error } = await createNode({
    treeId, userId, parentId: root.id,
    label: "とりあえず", status: "todo", isInbox: true,
    whenToUse: "どこに置くか決まっていないもの",
    // 本体の枝の並びに割り込まないよう、兄弟の末尾へ置く
    sortOrder: 9999,
  });
  if (error) { console.error("ensureInboxNode error:", error); return null; }
  return data;
}

// collectTreeTags は src/treeOps.js（ツリーの純粋変更ロジック）へ移動した。

// ── Likes ─────────────────────────────────────────
// liked_by カウントは likes テーブルへの insert/delete に応じて
// DBトリガー（sync_tree_liked_by）が trees.liked_by を自動同期する
export async function likeTree(userId, treeId) {
  const { error } = await supabase.from("likes").insert({ user_id: userId, tree_id: treeId });
  // 23505 = unique_violation（既にいいね済み）。重複いいねは無視する
  if (error && error.code !== "23505") {
    console.error("likeTree error:", error);
    throw error;
  }
}

export async function unlikeTree(userId, treeId) {
  const { error } = await supabase.from("likes").delete().eq("user_id", userId).eq("tree_id", treeId);
  // 失敗を呼び出し側へ伝え、ハート表示を元に戻せるようにする
  if (error) {
    console.error("unlikeTree error:", error);
    throw error;
  }
}

/** ユーザーが既にいいね済みのツリーID一覧を返す（みんなのツリーのいいね状態復元用） */
export async function fetchMyLikedTreeIds(userId) {
  const { data, error } = await supabase.from("likes").select("tree_id").eq("user_id", userId);
  if (error) { console.error("fetchMyLikedTreeIds error:", error); return []; }
  return (data || []).map((r) => r.tree_id);
}
/** ツリーを公開状態にする */
export async function publishTree(treeId) {
  try {
    const { error } = await supabase
      .from("trees")
      .update({ is_public: true })
      .eq("id", treeId);
    if (error) throw error;
  } catch (e) {
    console.error("publishTree error:", e);
    throw e;
  }
}
export async function unpublishTree(treeId) {
  try {
    const { error } = await supabase
      .from("trees")
      .update({ is_public: false })
      .eq("id", treeId);
    if (error) throw error;
  } catch (e) {
    console.error("unpublishTree error:", e);
    throw e;
  }
}
/**
 * ノードを複数まとめて削除し、親ノードの childIds からも除く
 * @param {string[]} idsToDelete - 削除するノードIDの配列（対象 + 子孫）
 * @param {string|null} parentId - 対象ノードの親ID（childIds更新用）
 * @param {string} treeId
 */
export async function deleteNodes(idsToDelete) {
  try {
    const { error } = await supabase
      .from("nodes")
      .delete()
      .in("id", idsToDelete);
    if (error) throw error;
  } catch (e) {
    console.error("deleteNodes error:", e);
    throw e;
  }
}
