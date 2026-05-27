import { supabase } from "./supabase";
// 内部用：IDを架空のメールアドレスに変換するヘルパー関数
function idToFakeEmail(id) {
  // トリミングして小文字にし、記号などを除いた安全なアドレスを生成
  const safeId = id.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  return `${safeId}@nekko.local`;
}

// ── Auth ──────────────────────────────────────────
export async function signUp({ email, password, username, displayName }) {
  // 修正：email 引数ではなく、username(ID) から架空のメールアドレスを自動生成する
  const fakeEmail = idToFakeEmail(username);

  const { data, error } = await supabase.auth.signUp({
    email: fakeEmail, 
    password,
    options: { 
      data: { 
        username: username.trim(), 
        display_name: displayName || username 
      } 
    },
  });
  return { data, error };
}

export async function signIn({ email, password }) {
  // 修正：引数名が email になっていますが、実質IDが渡されるため、
  // IDから架空のメールアドレスを復元してログインを試みます
  const fakeEmail = idToFakeEmail(email); 

  const { data, error } = await supabase.auth.signInWithPassword({ 
    email: fakeEmail, 
    password 
  });
  return { data, error };
}
// ── Auth ──────────────────────────────────────────
export async function signUp({ email, password, username, displayName }) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { username, display_name: displayName } },
  });
  return { data, error };
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
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
  const { data, error } = await supabase
    .from("profiles").select("*").eq("id", userId).single();
  return { data, error };
}

// ── Trees ─────────────────────────────────────────
export async function fetchMyTrees(userId) {
  const { data, error } = await supabase
    .from("trees")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return { data, error };
}

export async function fetchPublicTrees() {
  const { data, error } = await supabase
    .from("trees")
    .select("*, profiles(username, display_name)")
    .eq("is_public", true)
    .order("liked_by", { ascending: false });
  return { data, error };
}

export async function createTree({ userId, name, tags = [], active = true }) {
  const { data, error } = await supabase
    .from("trees")
    .insert({ user_id: userId, name, tags, active })
    .select().single();
  return { data, error };
}

export async function updateTree(treeId, patch) {
  const { data, error } = await supabase
    .from("trees").update(patch).eq("id", treeId).select().single();
  return { data, error };
}

export async function deleteTree(treeId) {
  return supabase.from("trees").delete().eq("id", treeId);
}

// ── Nodes ─────────────────────────────────────────
export async function fetchNodes(treeId) {
  const { data, error } = await supabase
    .from("nodes")
    .select("*")
    .eq("tree_id", treeId)
    .order("sort_order", { ascending: true });
  return { data, error };
}

export async function createNode({ treeId, userId, parentId, label, status = "todo",
  approachType, board = null, stamps = [], memo = "", isRoot = false, sortOrder = 0 }) {
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      tree_id: treeId, user_id: userId, parent_id: parentId ?? null,
      label, status, approach_type: approachType, board, stamps, memo,
      is_root: isRoot, sort_order: sortOrder,
    })
    .select().single();
  return { data, error };
}

export async function updateNode(nodeId, patch) {
  // map camelCase to snake_case for DB
  const dbPatch = {};
  if (patch.label       !== undefined) dbPatch.label        = patch.label;
  if (patch.status      !== undefined) dbPatch.status       = patch.status;
  if (patch.approachType!== undefined) dbPatch.approach_type= patch.approachType;
  if (patch.board       !== undefined) dbPatch.board        = patch.board;
  if (patch.stamps      !== undefined) dbPatch.stamps       = patch.stamps;
  if (patch.memo        !== undefined) dbPatch.memo         = patch.memo;
  if (patch.isMergeTarget !== undefined) dbPatch.is_merge_target = patch.isMergeTarget;
  const { data, error } = await supabase
    .from("nodes").update(dbPatch).eq("id", nodeId).select().single();
  return { data, error };
}

export async function deleteNode(nodeId) {
  return supabase.from("nodes").delete().eq("id", nodeId);
}

// ── Assemble tree from flat nodes ─────────────────
export function buildTreeFromNodes(treeRow, flatNodes) {
  // convert DB rows to app format
  const nodeMap = {};
  flatNodes.forEach(n => {
    nodeMap[n.id] = {
      id: n.id,
      label: n.label,
      status: n.status,
      approachType: n.approach_type,
      parentId: n.parent_id,
      board: n.board,
      stamps: n.stamps || [],
      memo: n.memo || "",
      isRoot: n.is_root,
      isMergeTarget: n.is_merge_target,
      childIds: [],
    };
  });
  // wire up childIds
  flatNodes.forEach(n => {
    if (n.parent_id && nodeMap[n.parent_id]) {
      nodeMap[n.parent_id].childIds.push(n.id);
    }
  });
  const rootNode = flatNodes.find(n => n.is_root);
  return {
    id: treeRow.id,
    name: treeRow.name,
    active: treeRow.active,
    public: treeRow.is_public,
    tags: treeRow.tags || [],
    likedBy: treeRow.liked_by || 0,
    userId: treeRow.user_id,
    nodes: nodeMap,
    rootId: rootNode?.id || null,
  };
}

// ── Likes ─────────────────────────────────────────
export async function likeTree(userId, treeId) {
  await supabase.from("likes").insert({ user_id: userId, tree_id: treeId });
  await supabase.from("trees").update({ liked_by: supabase.rpc("increment") }).eq("id", treeId);
}

export async function unlikeTree(userId, treeId) {
  await supabase.from("likes").delete().eq("user_id", userId).eq("tree_id", treeId);
}
