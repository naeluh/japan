/* Runs the planner outside Claude: provides window.claude.use("db" | "user") backed by this site's /api routes.
   The share link carries a key (?k=...) that is saved in this browser and sent with every request. */
(function () {
  "use strict";
  const LS_KEY = "trip:key", LS_UID = "trip:uid", LS_NAME = "trip:name";
  const qs = new URLSearchParams(location.search);
  if (qs.get("k")) {
    try { localStorage.setItem(LS_KEY, qs.get("k")); } catch (e) {}
    qs.delete("k");
    history.replaceState(null, "", location.pathname + (qs.toString() ? "?" + qs : "") + location.hash);
  }
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const key = () => ls(LS_KEY) || "";
  let uid = ls(LS_UID);
  if (!uid) { uid = "u_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); ls(LS_UID, uid); }

  async function api(path, opts) {
    opts = opts || {};
    const r = await fetch(path, Object.assign({}, opts, { headers: Object.assign({ "content-type": "application/json", "x-trip-key": key() }, opts.headers || {}) }));
    let body = null; try { body = await r.json(); } catch (e) {}
    if (!r.ok) throw { code: (body && body.code) || "unavailable", message: (body && body.message) || r.statusText, status: r.status };
    return body;
  }
  const config = api("/api/config").catch(() => ({ canEdit: false, canView: false, features: {} }));
  window.TRIP_API = { api, key, uid, config, standalone: true };

  /* ---------- document store with polling ---------- */
  const docs = new Map();
  let rev = 0, loaded = false, loading = null;
  window.TRIP_API.doc = (p) => docs.get(p);
  const listeners = new Set();
  const snapDoc = (path, v) => ({ id: path.split("/").pop(), exists: v !== undefined, data: () => v, metadata: { fromCache: false, hasPendingWrites: false } });
  function fireAll() { listeners.forEach(l => { try { l.fire(); } catch (e) { console.error(e); } }); }
  async function pull() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const r = await api("/api/db?since=" + (loaded ? rev : 0));
        let changed = !!r.full;
        if (r.full) docs.clear();
        for (const [p, v] of Object.entries(r.docs || {})) { changed = true; if (v === null) docs.delete(p); else docs.set(p, v); }
        rev = r.rev; loaded = true;
        if (changed) fireAll();
      } catch (e) {
        if (!loaded) listeners.forEach(l => l.error && l.error(e));
      } finally { loading = null; }
    })();
    return loading;
  }
  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => { await pull(); schedule(); }, document.hidden ? 30000 : 5000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { pull(); schedule(); } });

  let naming = null; // one name question at a time, however many edits are waiting on it
  function ensureName() {
    if (ls(LS_NAME)) return Promise.resolve();
    if (!naming) naming = (async () => {
      const ask = window.TRIP_API.askName || (async () => window.prompt("What's your name? It shows next to the changes you make.") || "");
      const n = String(await ask() || "").trim().slice(0, 40);
      if (!n) return;
      ls(LS_NAME, n);
      await api("/api/db", { method: "POST", body: JSON.stringify({ op: "set", path: "people/" + uid, data: { name: n } }) });
    })().finally(() => { naming = null; });
    return naming;
  }
  async function write(op, path, data) {
    const before = docs.has(path) ? docs.get(path) : undefined;
    if (op === "set") docs.set(path, data);
    else if (op === "update") docs.set(path, Object.assign({}, before || {}, data));
    else docs.delete(path);
    fireAll();
    try {
      await ensureName();
      await api("/api/db", { method: "POST", body: JSON.stringify({ op, path, data }) });
    } catch (e) {
      if (before === undefined) docs.delete(path); else docs.set(path, before);
      fireAll(); throw e;
    }
    pull();
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  function docRef(path) {
    return {
      id: path.split("/").pop(), path,
      async get() { if (!loaded) await pull(); return snapDoc(path, docs.get(path)); },
      set: (data) => write("set", path, data),
      update: (data) => write("update", path, data),
      delete: () => write("delete", path),
      onSnapshot(next, error) {
        const l = { fire: () => next(snapDoc(path, docs.get(path))), error };
        listeners.add(l); if (loaded) l.fire(); else pull();
        return () => listeners.delete(l);
      }
    };
  }
  function query(coll, order, lim) {
    const run = () => {
      let list = [];
      docs.forEach((v, p) => { const i = p.lastIndexOf("/"); if (p.slice(0, i) === coll) list.push(snapDoc(p, v)); });
      list.sort((a, b) => a.id < b.id ? -1 : 1);
      if (order) list.sort((a, b) => { const x = a.data()[order.f], y = b.data()[order.f]; return (x < y ? -1 : x > y ? 1 : 0) * (order.d === "desc" ? -1 : 1); });
      if (lim) list = list.slice(0, lim);
      return { docs: list, size: list.length, empty: !list.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
    };
    return {
      path: coll,
      orderBy: (f, d) => query(coll, { f, d: d || "asc" }, lim),
      limit: (n) => query(coll, order, n),
      where: () => { throw new TypeError("where() is not supported in the standalone version"); },
      async get() { if (!loaded) await pull(); return run(); },
      onSnapshot(next, error) {
        const l = { fire: () => next(run()), error };
        listeners.add(l); if (loaded) l.fire(); else pull();
        return () => listeners.delete(l);
      },
      doc: (id) => docRef(coll + "/" + (id || newId())),
      add: async (data) => { const r = docRef(coll + "/" + newId()); await r.set(data); return r; }
    };
  }
  const db = Object.freeze({ doc: (p) => docRef(p), collection: (p) => query(p) });

  /* ---------- people ---------- */
  function initials(n) { return (n || "?").split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase(); }
  function avatar(n) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' rx='20' fill='#223A5E'/><text x='20' y='25' font-size='15' text-anchor='middle' fill='white' font-family='sans-serif'>${initials(n)}</text></svg>`;
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }
  const user = Object.freeze({
    async id() { return uid; },
    async isOwner() { return (await config).canEdit; },
    async canEdit() { return (await config).canEdit; },
    async can(name) { return name === "data.write" ? (await config).canEdit : false; },
    async me() { const c = await config; const n = ls(LS_NAME) || ""; return { id: uid, name: n, avatarUrl: avatar(n), color: "#223A5E", email: null, isOwner: c.canEdit, canEdit: c.canEdit }; },
    async profiles(ids) {
      if (!loaded) await pull();
      const out = {};
      [].concat(ids).forEach(id => { const p = docs.get("people/" + id); const n = (p && p.name) || (id === uid ? (ls(LS_NAME) || "") : ""); out[id] = { id, name: n, avatarUrl: avatar(n), color: "#223A5E", email: null, isMe: id === uid, guest: false }; });
      return out;
    }
  });

  window.claude = Object.freeze({
    use: async (name) => {
      const c = await config;
      if (name === "db") { if (!c.canView) return null; schedule(); return db; }
      if (name === "user") return user;
      return null;
    }
  });
})();
