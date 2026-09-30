/* Runs the planner outside Claude: provides window.claude.use("db" | "user") backed by this site's /api routes.
   The share link carries a key (?k=...) that is saved in this browser and sent with every request.
   Offline: the last synced plan is kept in localStorage and shown at once; edits made without signal wait in an
   outbox and are sent, in order, when the connection is back. */
(function () {
  "use strict";
  const LS_KEY = "trip:key", LS_UID = "trip:uid", LS_NAME = "trip:name", LS_SNAP = "trip:snap", LS_CFG = "trip:cfg", LS_OUT = "trip:outbox";
  const netErr = (e) => e instanceof TypeError; // fetch rejects with TypeError only when there's no response at all
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
  // Offline, fall back to the last config this browser saw (network errors only: a 403 must still lock the page).
  const config = api("/api/config").then(c => { ls(LS_CFG, JSON.stringify(c)); return c; }).catch(e => {
    if (netErr(e)) { try { const c = JSON.parse(ls(LS_CFG) || "null"); if (c) return Object.assign({}, c, { offline: true }); } catch (x) { /* no saved config */ } }
    return { canEdit: false, canView: false, features: {} };
  });
  window.TRIP_API = { api, key, uid, config, standalone: true };

  /* ---------- document store with polling ---------- */
  const docs = new Map();
  let rev = 0, epoch = "", loaded = false, loading = null;
  window.TRIP_API.doc = (p) => docs.get(p);
  const listeners = new Set();
  const snapDoc = (path, v) => ({ id: path.split("/").pop(), exists: v !== undefined, data: () => v, metadata: { fromCache: false, hasPendingWrites: false } });
  function fireAll() { listeners.forEach(l => { try { l.fire(); } catch (e) { console.error(e); } }); }
  function applyOp(o) {
    if (o.op === "set") docs.set(o.path, o.data);
    else if (o.op === "update") docs.set(o.path, Object.assign({}, docs.get(o.path) || {}, o.data));
    else docs.delete(o.path);
  }

  /* ---------- offline copy + outbox ---------- */
  let outbox = [];
  try { outbox = JSON.parse(ls(LS_OUT) || "[]"); if (!Array.isArray(outbox)) outbox = []; } catch (e) { outbox = []; }
  function saveOutbox() { ls(LS_OUT, JSON.stringify(outbox)); window.dispatchEvent(new CustomEvent("trip:outbox", { detail: outbox.length })); }
  window.TRIP_API.pending = () => outbox.length;
  try {
    const snap = JSON.parse(ls(LS_SNAP) || "null");
    if (snap && snap.docs) { for (const [p, v] of Object.entries(snap.docs)) docs.set(p, v); rev = snap.rev || 0; epoch = snap.epoch || ""; loaded = true; outbox.forEach(applyOp); }
  } catch (e) { /* no offline copy yet */ }
  let snapTimer = null;
  function saveSnap() {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      const out = {}, logs = [];
      docs.forEach((v, p) => { if (p.startsWith("log/")) logs.push([p, v]); else out[p] = v; });
      logs.sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 50).forEach(([p, v]) => { out[p] = v; }); // the log grows forever; keep the recent part
      try { localStorage.setItem(LS_SNAP, JSON.stringify({ rev, epoch, at: Date.now(), docs: out })); } catch (e) { /* full or blocked: stay online-only */ }
    }, 800);
  }
  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      while (outbox.length) {
        const o = outbox[0];
        try { await api("/api/db", { method: "POST", body: JSON.stringify(o) }); outbox.shift(); saveOutbox(); }
        catch (e) {
          if (netErr(e)) break;                 // still offline: try again later
          outbox.shift(); saveOutbox();          // the server refused it: drop it and say so
          if (window.TRIP_API.onSyncError) window.TRIP_API.onSyncError(e, o); else console.error(e);
        }
      }
    })().finally(() => { flushing = null; });
    return flushing;
  }
  window.addEventListener("online", () => { flush().then(() => pull()); });

  async function pull() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const r = await api("/api/db?since=" + (loaded ? rev : 0) + (loaded && epoch ? "&epoch=" + encodeURIComponent(epoch) : ""));
        let changed = !!r.full;
        if (r.full) docs.clear();
        for (const [p, v] of Object.entries(r.docs || {})) { changed = true; if (v === null) docs.delete(p); else docs.set(p, v); }
        rev = r.rev; epoch = r.epoch || epoch; loaded = true;
        if (outbox.length) { outbox.forEach(applyOp); changed = true; flush(); } // pending offline edits stay visible until they land
        if (changed) { fireAll(); saveSnap(); }
      } catch (e) {
        if (!loaded) listeners.forEach(l => l.error && l.error(e));
      } finally { loading = null; }
    })();
    return loading;
  }
  window.TRIP_API.pull = () => pull();
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
      const op = { op: "set", path: "people/" + uid, data: { name: n } };
      try { await api("/api/db", { method: "POST", body: JSON.stringify(op) }); }
      catch (e) { if (netErr(e)) { outbox.push(op); saveOutbox(); } else throw e; }
    })().finally(() => { naming = null; });
    return naming;
  }
  async function write(op, path, data) {
    const before = docs.has(path) ? docs.get(path) : undefined;
    const o = { op, path, data };
    applyOp(o); fireAll();
    const queue = () => { outbox.push(o); saveOutbox(); saveSnap(); };   // resolves: the page shouldn't wait for signal
    ensureName().catch(() => {});   // the name only labels Recent changes: never hold an edit hostage to the question
    try {
      if (outbox.length) { queue(); flush(); return; }                    // keep order behind edits already waiting
      await api("/api/db", { method: "POST", body: JSON.stringify(o) });
    } catch (e) {
      if (netErr(e)) { queue(); return; }
      if (before === undefined) docs.delete(path); else docs.set(path, before);   // refused (read-only, bad data): undo and tell the page
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
