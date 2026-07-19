// ══════════════════════════════════════════════════
// db.js  ―  Supabase クライアント + 全 DB 操作
// ══════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";

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

/** 全ツリー横断のノード検索用に、自分の全ノードをメタデータのみで取得する。
 *  board / kifu / stamps は重いので含めない。
 *  ルートはツリー名と同一のため除外する（ツリー自体は一覧から探せる）。 */
export async function fetchAllMyNodes(userId) {
  const result = await supabase
    .from("nodes")
    .select("id, tree_id, label, status, memo, situation, my_approach, orientation, win_rate, like_level, usage_level, created_at")
    .eq("user_id", userId)
    .eq("is_root", false)
    .order("created_at", { ascending: false });
  if (result.error) console.error("fetchAllMyNodes error:", result.error);
  return result;
}

/** ユーザーの全ツリーから未完成（wip / todo）かつルートでないノードを取得 */
export async function fetchAllWipNodes(userId) {
  return supabase
    .from("nodes")
    .select("id, label, tree_id, status")
    .eq("user_id", userId)
    .in("status", ["wip", "todo"])
    .eq("is_root", false);
}

export async function createNode({
  treeId, userId, parentId, label,
  status = "todo", board = null,
  stamps = [], memo = "", isRoot = false, sortOrder = 0,
  handSente = {p:0,l:0,n:0,s:0,g:0,b:0,r:0},
  handGote  = {p:0,l:0,n:0,s:0,g:0,b:0,r:0},
  kifu = [],
  kifuImported = false,
  branchFromMoveIndex = null,
  usageLevel = 2,
  winRate = null,
  situation = [],
  myApproach = [],
  orientation = null,
  likeLevel = null,
  aim = "",
  caution = "",
  nextStudy = "",
  commentTags = [],
  turn = null,
  evaluation = null,
}) {
  const result = await supabase
    .from("nodes")
    .insert({
      tree_id: treeId, user_id: userId, parent_id: parentId ?? null,
      label, status,
      board, stamps, memo, is_root: isRoot, sort_order: sortOrder,
      board_hidden: false,
      hand_sente: handSente ?? {"p":0,"l":0,"n":0,"s":0,"g":0,"b":0,"r":0},
      hand_gote:  handGote  ?? {"p":0,"l":0,"n":0,"s":0,"g":0,"b":0,"r":0},
      kifu: kifu ?? [],
      kifu_imported: kifuImported ?? false,
      branch_from_move_index: branchFromMoveIndex,
      usage_level: usageLevel ?? 2,
      win_rate: winRate,
      situation: situation ?? [],
      my_approach: myApproach ?? [],
      orientation,
      like_level: likeLevel,
      aim,
      caution,
      next_study: nextStudy,
      comment_tags: commentTags,
      turn,
      evaluation,
    })
    .select()
    .single();
  if (result.error) {
    const { message, code, details, hint } = result.error;
    console.error("createNode error:", JSON.stringify({ message, code, details, hint }));
  }
  return result;
}

export async function updateNode(nodeId, patch) {
  // フロント側キー名 → DB カラム名へ変換
  const map = {
    label:          "label",
    status:         "status",
    board:          "board",
    boardHidden:    "board_hidden",
    sortOrder:      "sort_order",
    stamps:         "stamps",
    memo:           "memo",
    isMergeTarget:  "is_merge_target",
    parentId:       "parent_id",
    mergeParentIds: "merge_parent_ids",
    handSente:      "hand_sente",
    handGote:       "hand_gote",
    kifu:           "kifu",
    kifuImported:   "kifu_imported",
    usageLevel:     "usage_level",
    winRate:        "win_rate",
    situation:      "situation",
    myApproach:     "my_approach",
    orientation:    "orientation",
    likeLevel:      "like_level",
    aim:            "aim",
    caution:        "caution",
    nextStudy:      "next_study",
    commentTags:    "comment_tags",
    turn:           "turn",
    evaluation:     "evaluation",
  };
  const dbPatch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (map[k] !== undefined) dbPatch[map[k]] = v;
  }
  const result = await supabase.from("nodes").update(dbPatch).eq("id", nodeId).select().single();
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
    .select("id, name, memo, move_count, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (result.error) console.error("fetchMyKifus error:", result.error);
  return result;
}

/** 棋譜1件を snapshots 込みで取得する（プレビュー・取り込み時に呼ぶ）。
 *  source_text（KIF/CSA原文・数KB）は再生・取り込みでは使わないため転送しない。
 *  エクスポート機能を作るときに原文込みの専用取得関数を追加する。 */
export async function fetchKifu(kifuId) {
  const result = await supabase
    .from("kifus")
    .select("id, name, memo, snapshots, move_count, created_at")
    .eq("id", kifuId)
    .single();
  if (result.error) console.error("fetchKifu error:", result.error);
  return result;
}

export async function createKifu({ userId, name, memo = "", snapshots, sourceText = "" }) {
  const result = await supabase
    .from("kifus")
    .insert({
      user_id:     userId,
      name,
      memo,
      snapshots:   snapshots ?? [],
      source_text: sourceText,
      // 手数 = スナップ数 - 1（先頭は初期局面）
      move_count:  Math.max(0, (snapshots?.length ?? 0) - 1),
    })
    .select("id, name, memo, move_count, created_at")
    .single();
  if (result.error) console.error("createKifu error:", result.error);
  return result;
}

export async function updateKifu(kifuId, patch) {
  // フロント側キー名 → DB カラム名へ変換（updateNode と同じ方式）
  const map = { name: "name", memo: "memo" };
  const dbPatch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (map[k] !== undefined) dbPatch[map[k]] = v;
  }
  const result = await supabase.from("kifus").update(dbPatch).eq("id", kifuId).select().single();
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
export function kifuRowToKifu(k) {
  return {
    id:        k.id,
    name:      k.name,
    memo:      k.memo || "",
    snapshots: k.snapshots || [],
    sourceText: k.source_text || "",
    moveCount: k.move_count ?? 0,
    createdAt: k.created_at,
  };
}

// ── DBのノード行（snake_case）を内部ノード形式（camelCase）へ変換する ──
// childIds は呼び出し側で親子関係を構築する際に埋める（既存値があれば維持）
export function nodeRowToNode(n) {
  return {
    id:            n.id,
    label:         n.label,
    status:        n.status,
    parentId:      n.parent_id,
    board:         n.board,
    boardHidden:   !!n.board_hidden,
    sortOrder:     n.sort_order ?? 0,
    stamps:        n.stamps  || [],
    memo:          n.memo    || "",
    isRoot:        n.is_root,
    isMergeTarget:  n.is_merge_target,
    mergeParentIds: n.merge_parent_ids || [],
    handSente:      n.hand_sente || {p:0,l:0,n:0,s:0,g:0,b:0,r:0},
    handGote:       n.hand_gote  || {p:0,l:0,n:0,s:0,g:0,b:0,r:0},
    kifu:           n.kifu || [],
    kifuImported:   n.kifu_imported || false,
    branchFromMoveIndex: n.branch_from_move_index ?? null,
    usageLevel:     n.usage_level ?? 2,
    winRate:        n.win_rate ?? null,
    situation:      n.situation || [],
    myApproach:     n.my_approach || [],
    orientation:    n.orientation || null,
    likeLevel:      n.like_level ?? null,
    aim:            n.aim || "",
    caution:        n.caution || "",
    nextStudy:      n.next_study || "",
    commentTags:    n.comment_tags || [],
    turn:           n.turn || null,
    evaluation:     n.evaluation ?? null,
    childIds:      [],
  };
}

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
