// ============================================================
// 데이터 계층 — Supabase 가 설정돼 있으면 클라우드 DB를,
// 아니면 브라우저 로컬(데모 모드)을 사용합니다.
// ============================================================
const DB = (() => {
  const cfg = window.APP_CONFIG || {};
  const configured =
    cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !String(cfg.SUPABASE_URL).includes("여기에") &&
    !String(cfg.SUPABASE_ANON_KEY).includes("여기에");

  let sb = null;
  if (configured && window.supabase) sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const LS_KEY = "pickleball_demo_db_v2";
  function loadLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } }
  function saveLocal(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }
  function uid() { return "id-" + Math.random().toString(36).slice(2, 10); }
  function seedIfEmpty() {
    const d = loadLocal();
    if (d._seeded) return;
    const c1 = uid(), m1 = uid(), m2 = uid(), m3 = uid(), s1 = uid();
    const today = new Date();
    const fmt = (dt) => dt.toISOString();
    d.coaches = [{ id: c1, name: "김코치", phone: "010-1111-2222", address: "서울시 강남구 테헤란로 1", role: "코치", specialty: "초보 레슨", created_at: fmt(today) }];
    d.members = [
      { id: m1, name: "이회원", phone: "010-3333-4444", birth_date: "1990-05-12", referrer: "김코치", membership_type: "정회원", status: "활동", join_date: "2026-01-10", created_at: fmt(today) },
      { id: m2, name: "박회원", phone: "010-5555-6666", birth_date: "1988-11-03", referrer: "이회원", membership_type: "체험", status: "활동", join_date: "2026-06-01", created_at: fmt(today) },
      { id: m3, name: "최신규", phone: "010-7777-8888", birth_date: "1995-02-20", referrer: "박회원", status: "승인대기", join_date: today.toISOString().slice(0, 10), created_at: fmt(today) }
    ];
    const start = new Date(today); start.setHours(19, 0, 0, 0);
    const end = new Date(start); end.setHours(20, 30, 0, 0);
    const start2 = new Date(today); start2.setDate(start2.getDate() + 2); start2.setHours(10, 0, 0, 0);
    const end2 = new Date(start2); end2.setHours(11, 30, 0, 0);
    d.schedules = [
      { id: s1, title: "저녁 초급반", coach_id: c1, start_at: fmt(start), end_at: fmt(end), location: "1번 코트", capacity: 8, level: "초급", created_at: fmt(today) },
      { id: uid(), title: "주말 오전반", coach_id: c1, start_at: fmt(start2), end_at: fmt(end2), location: "2번 코트", capacity: 6, level: "중급", created_at: fmt(today) }
    ];
    d.bookings = [
      { id: uid(), schedule_id: s1, member_id: m1, status: "예약", created_at: fmt(today) },
      { id: uid(), schedule_id: s1, member_id: m2, status: "신청", note: "참석 가능할까요?", created_at: fmt(today) }
    ];
    d.payments = [{ id: uid(), member_id: m1, amount: 100000, paid_date: "2026-06-01", months: 1, period_start: "2026-06-01", period_end: "2026-06-30", method: "계좌이체", status: "완납", created_at: fmt(today) }];
    d.notifications = [];
    d._seeded = true;
    saveLocal(d);
  }

  async function list(table, { order = "created_at", asc = false } = {}) {
    if (sb) { const { data, error } = await sb.from(table).select("*").order(order, { ascending: asc }); if (error) throw error; return data || []; }
    const d = loadLocal(); const arr = (d[table] || []).slice();
    arr.sort((a, b) => (a[order] > b[order] ? 1 : -1) * (asc ? 1 : -1)); return arr;
  }
  async function insert(table, row) {
    if (sb) { const { data, error } = await sb.from(table).insert(row).select().single(); if (error) throw error; return data; }
    const d = loadLocal(); const rec = Object.assign({ id: uid(), created_at: new Date().toISOString() }, row);
    d[table] = d[table] || []; d[table].push(rec); saveLocal(d); return rec;
  }
  async function update(table, id, patch) {
    if (sb) { const { data, error } = await sb.from(table).update(patch).eq("id", id).select().single(); if (error) throw error; return data; }
    const d = loadLocal(); d[table] = (d[table] || []).map(r => r.id === id ? Object.assign({}, r, patch) : r); saveLocal(d);
    return d[table].find(r => r.id === id);
  }
  async function remove(table, id) {
    if (sb) { const { error } = await sb.from(table).delete().eq("id", id); if (error) throw error; return; }
    const d = loadLocal(); d[table] = (d[table] || []).filter(r => r.id !== id); saveLocal(d);
  }
  async function notify(payload) {
    if (sb && cfg.NOTIFY_FUNCTION) { const { data, error } = await sb.functions.invoke(cfg.NOTIFY_FUNCTION, { body: payload }); if (error) throw error; return data; }
    return { simulated: true, count: (payload.recipients || []).length };
  }

  // 실시간 구독: 데이터가 바뀌면 onChange 호출
  function subscribe(onChange) {
    if (sb) {
      const ch = sb.channel("rt-all");
      ["members", "bookings", "schedules", "payments"].forEach(t =>
        ch.on("postgres_changes", { event: "*", schema: "public", table: t }, (payload) => onChange(payload)));
      ch.subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    }
    const h = (e) => { if (e.key === LS_KEY) onChange({ source: "storage" }); };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }

  if (!sb) seedIfEmpty();

  return { configured: !!sb, list, insert, update, remove, notify, subscribe };
})();
