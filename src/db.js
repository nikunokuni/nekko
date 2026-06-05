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

// ── Profile ───────────────────────────────────────
export async function getProfile(userId) {
  return supabase.from("profiles").select("*").eq("id", userId).single();
}

// ── Trees ─────────────────────────────────────────
export async function fetchMyTrees(userId) {
  return supabase
    .from("trees")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
}

export async function fetchPublicTrees() {
  return supabase
    .from("trees")
    .select("*, profiles(username, display_name)")
    .eq("is_public", true)
    .order("liked_by", { ascending: false });
}

export async function createTree({ userId, name, tags = [], active = true }) {
  return supabase
    .from("trees")
    .insert({ user_id: userId, name, tags, active })
    .select()
    .single();
}

export async function updateTree(treeId, patch) {
  return supabase.from("trees").update(patch).eq("id", treeId).select().single();
}

export async function deleteTree(treeId) {
  return supabase.from("trees").delete().eq("id", treeId);
}

// ── Nodes ─────────────────────────────────────────
export async function fetchNodes(treeId) {
  return supabase
    .from("nodes")
    .select("*")
    .eq("tree_id", treeId)
    .order("sort_order", { ascending: true });
}

export async function createNode({
  treeId, userId, parentId, label,
  status = "todo", approachType, board = null,
  stamps = [], memo = "", isRoot = false, sortOrder = 0,
}) {
  return supabase
    .from("nodes")
    .insert({
      tree_id: treeId, user_id: userId, parent_id: parentId ?? null,
      label, status, approach_type: approachType,
      board, stamps, memo, is_root: isRoot, sort_order: sortOrder,
    })
    .select()
    .single();
}

export async function updateNode(nodeId, patch) {
  // フロント側キー名 → DB カラム名へ変換
  const map = {
    label:         "label",
    status:        "status",
    approachType:  "approach_type",
    board:         "board",
    stamps:        "stamps",
    memo:          "memo",
    isMergeTarget: "is_merge_target",
  };
  const dbPatch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (map[k] !== undefined) dbPatch[map[k]] = v;
  }
  return supabase.from("nodes").update(dbPatch).eq("id", nodeId).select().single();
}

export async function deleteNode(nodeId) {
  return supabase.from("nodes").delete().eq("id", nodeId);
}

// ── フラットなノード配列からツリーオブジェクトを組み立てる ──
export function buildTreeFromNodes(treeRow, flatNodes) {
  const nodeMap = {};
  flatNodes.forEach(n => {
    nodeMap[n.id] = {
      id:            n.id,
      label:         n.label,
      status:        n.status,
      approachType:  n.approach_type,
      parentId:      n.parent_id,
      board:         n.board,
      stamps:        n.stamps  || [],
      memo:          n.memo    || "",
      isRoot:        n.is_root,
      isMergeTarget: n.is_merge_target,
      childIds:      [],
    };
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
    active:  treeRow.active,
    public:  treeRow.is_public,
    tags:    treeRow.tags    || [],
    likedBy: treeRow.liked_by || 0,
    userId:  treeRow.user_id,
    nodes:   nodeMap,
    rootId:  rootNode?.id || null,
  };
}

// ── Likes ─────────────────────────────────────────
export async function likeTree(userId, treeId) {
  await supabase.from("likes").insert({ user_id: userId, tree_id: treeId });
  // liked_by カウントは DB トリガーまたは RPC で管理することを推奨
}

export async function unlikeTree(userId, treeId) {
  await supabase.from("likes").delete().eq("user_id", userId).eq("tree_id", treeId);
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
