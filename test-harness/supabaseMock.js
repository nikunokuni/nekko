// ══════════════════════════════════════════════════
// supabaseMock.js ― テスト用の @supabase/supabase-js 差し替え
//   実バックエンドなしでアプリを動かすための最小限のモック。
//   データは localStorage("nekko_mock_db") に永続化する。
//   アプリ本体のコードは一切変更せず、vite.mock.config.js の
//   resolve.alias でのみ有効になる。
// ══════════════════════════════════════════════════

const DB_KEY = "nekko_mock_db_v1";
const AUTH_KEY = "nekko_mock_auth_v1";

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { users: [], profiles: [], trees: [], nodes: [], likes: [] };
}
function saveDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}
const uuid = () =>
  crypto.randomUUID ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
const nowIso = () => new Date().toISOString();

// ── likes 変化時に trees.liked_by を同期（DBトリガー相当）──
function syncLikedBy(db, treeId) {
  const t = db.trees.find((t) => t.id === treeId);
  if (t) t.liked_by = db.likes.filter((l) => l.tree_id === treeId).length;
}

// ── クエリビルダ（thenable）─────────────────────────
class Query {
  constructor(table) {
    this.table = table;
    this.op = "select";
    this.cols = "*";
    this.opts = {};
    this.payload = null;
    this.filters = [];
    this.orders = [];
    this.wantSingle = false;
    this.wantSelect = false;
  }
  select(cols = "*", opts = {}) {
    if (this.op === "select") { this.cols = cols; this.opts = opts; }
    else this.wantSelect = true;
    return this;
  }
  insert(payload) { this.op = "insert"; this.payload = payload; return this; }
  update(payload) { this.op = "update"; this.payload = payload; return this; }
  delete() { this.op = "delete"; return this; }
  eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
  in(col, vals) { const s = new Set(vals); this.filters.push((r) => s.has(r[col])); return this; }
  order(col, { ascending = true } = {}) { this.orders.push({ col, ascending }); return this; }
  single() { this.wantSingle = true; return this; }

  _rows(db) {
    let rows = db[this.table] || [];
    for (const f of this.filters) rows = rows.filter(f);
    return rows;
  }

  _project(db, row) {
    // 埋め込みリレーション対応: "*, nodes(id, status, is_root)" / "*, profiles(username, display_name)"
    const out = { ...row };
    const embeds = [...this.cols.matchAll(/(\w+)\(([^)]*)\)/g)];
    for (const [, tbl, fieldsStr] of embeds) {
      const fields = fieldsStr.split(",").map((s) => s.trim()).filter(Boolean);
      const pick = (r) => {
        const o = {};
        for (const f of fields) o[f] = r[f];
        return o;
      };
      if (this.table === "trees" && tbl === "nodes") {
        out.nodes = db.nodes.filter((n) => n.tree_id === row.id).map(pick);
      } else if (this.table === "trees" && tbl === "profiles") {
        const p = db.profiles.find((p) => p.id === row.user_id);
        out.profiles = p ? pick(p) : null;
      }
    }
    // 単純なカラム指定（"id, label" 等）のときは絞る
    if (!this.cols.includes("*") && embeds.length === 0) {
      const fields = this.cols.split(",").map((s) => s.trim());
      const o = {};
      for (const f of fields) o[f] = row[f];
      return o;
    }
    return out;
  }

  _exec() {
    const db = loadDb();
    let data = null, error = null, count = null;

    if (this.op === "select") {
      let rows = this._rows(db);
      for (const { col, ascending } of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const av = a[col], bv = b[col];
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
        });
      }
      if (this.opts.count) count = rows.length;
      data = this.opts.head ? null : rows.map((r) => this._project(db, r));
    } else if (this.op === "insert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = [];
      for (const item of items) {
        // likes の一意制約を再現
        if (this.table === "likes") {
          if (db.likes.some((l) => l.user_id === item.user_id && l.tree_id === item.tree_id)) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" }, count: null };
          }
        }
        const row = { id: uuid(), created_at: nowIso(), updated_at: nowIso(), ...defaultsFor(this.table), ...item };
        db[this.table].push(row);
        if (this.table === "likes") syncLikedBy(db, row.tree_id);
        inserted.push(row);
      }
      saveDb(db);
      data = inserted;
    } else if (this.op === "update") {
      const rows = this._rows(db);
      for (const r of rows) Object.assign(r, this.payload, { updated_at: nowIso() });
      saveDb(db);
      data = rows;
    } else if (this.op === "delete") {
      const rows = this._rows(db);
      const ids = new Set(rows.map((r) => r.id));
      db[this.table] = db[this.table].filter((r) => !ids.has(r.id));
      // FKカスケード相当
      if (this.table === "trees") {
        const treeIds = new Set(rows.map((r) => r.id));
        db.nodes = db.nodes.filter((n) => !treeIds.has(n.tree_id));
        db.likes = db.likes.filter((l) => !treeIds.has(l.tree_id));
      }
      if (this.table === "likes") {
        for (const r of rows) syncLikedBy(db, r.tree_id);
      }
      saveDb(db);
      data = rows;
    }

    if (this.wantSingle) {
      if (!data || data.length === 0) {
        return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, count };
      }
      data = data[0];
    }
    return { data, error, count };
  }

  then(resolve, reject) {
    // 実ネットワーク相当の非同期化
    return Promise.resolve().then(() => this._exec()).then(resolve, reject);
  }
}

function defaultsFor(table) {
  if (table === "trees") return { tags: [], active: true, is_public: false, liked_by: 0, quick_memo: "" };
  if (table === "nodes") return {};
  return {};
}

// ── Auth ──────────────────────────────────────────
const authListeners = new Set();
function currentSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    return { user, access_token: "mock-token" };
  } catch { return null; }
}
function fireAuth(event) {
  const s = currentSession();
  for (const cb of authListeners) { try { cb(event, s); } catch {} }
}

const auth = {
  async getSession() { return { data: { session: currentSession() }, error: null }; },
  onAuthStateChange(cb) {
    authListeners.add(cb);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
  },
  async signUp({ email, password, options = {} }) {
    const db = loadDb();
    const meta = options.data || {};
    if (db.users.some((u) => u.email === email)) {
      return { data: { user: null, session: null }, error: { message: "User already registered" } };
    }
    if ((password || "").length < 6) {
      return { data: { user: null, session: null }, error: { message: "Password should be at least 6 characters." } };
    }
    if (db.profiles.some((p) => p.username === meta.username)) {
      return { data: { user: null, session: null }, error: { message: "duplicate key value violates unique constraint \"profiles_username_unique\"" } };
    }
    const user = { id: uuid(), email, user_metadata: meta, created_at: nowIso() };
    db.users.push({ ...user, password });
    // profiles 行はDBトリガーで自動作成される想定
    db.profiles.push({ id: user.id, username: meta.username, display_name: meta.display_name, created_at: nowIso() });
    saveDb(db);
    return { data: { user, session: null }, error: null };
  },
  async signInWithPassword({ email, password }) {
    const db = loadDb();
    const u = db.users.find((u) => u.email === email && u.password === password);
    if (!u) return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
    const { password: _pw, ...user } = u;
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    const session = currentSession();
    fireAuth("SIGNED_IN");
    return { data: { user, session }, error: null };
  },
  async signOut() {
    localStorage.removeItem(AUTH_KEY);
    fireAuth("SIGNED_OUT");
    return { error: null };
  },
};

// ── RPC ───────────────────────────────────────────
async function rpc(fn, args = {}) {
  const db = loadDb();
  const session = currentSession();
  if (fn === "get_app_stats") {
    const me = session && db.profiles.find((p) => p.id === session.user.id);
    if (!me || me.username !== "niku") return { data: [], error: null };
    return { data: [{ accounts: db.users.length, trees: db.trees.length, nodes: db.nodes.length }], error: null };
  }
  if (fn === "copy_tree") {
    if (!session) return { data: null, error: { message: "ログインが必要です" } };
    const src = db.trees.find((t) => t.id === args.p_source_tree_id);
    if (!src) return { data: null, error: { message: "ツリーが見つかりません" } };
    if (!src.is_public && src.user_id !== session.user.id) {
      return { data: null, error: { message: "このツリーはコピーできません" } };
    }
    const newTree = {
      ...src, id: uuid(), user_id: session.user.id,
      name: args.p_new_name || src.name + "（コピー）",
      is_public: false, liked_by: 0, active: true,
      created_at: nowIso(), updated_at: nowIso(),
    };
    db.trees.push(newTree);
    const srcNodes = db.nodes.filter((n) => n.tree_id === src.id);
    const idMap = new Map(srcNodes.map((n) => [n.id, uuid()]));
    for (const n of srcNodes) {
      db.nodes.push({
        ...JSON.parse(JSON.stringify(n)),
        id: idMap.get(n.id),
        tree_id: newTree.id,
        user_id: session.user.id,
        parent_id: n.parent_id ? idMap.get(n.parent_id) ?? null : null,
        merge_parent_ids: (n.merge_parent_ids || []).map((id) => idMap.get(id)).filter(Boolean),
        created_at: nowIso(), updated_at: nowIso(),
      });
    }
    saveDb(db);
    return { data: newTree.id, error: null };
  }
  return { data: null, error: { message: `unknown rpc: ${fn}` } };
}

export function createClient() {
  return {
    auth,
    from: (table) => new Query(table),
    rpc,
  };
}
