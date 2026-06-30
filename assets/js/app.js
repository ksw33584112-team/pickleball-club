// ============================================================
// 화면 로직 — 대시보드 / 회원(승인) / 스케줄(달력+시간예약) / 회비(달력) / 코치
// ============================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
const won = (n) => (Number(n) || 0).toLocaleString("ko-KR") + "원";
const dDate = (s) => s ? new Date(s).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) : "-";
const dTime = (s) => s ? new Date(s).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "";
const dDateTime = (s) => s ? new Date(s).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
const toInput = (s) => s ? new Date(s).toISOString().slice(0, 16) : "";
const localDay = (s) => { const d = new Date(s); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ACTIVE_BOOK = ["예약", "출석"];
const SLOT_START = 6, SLOT_END = 22, SLOT_CAP = 4;
const MONTHLY_FEE = 100000;
const addMonths = (ymd, n) => { const [y, m, d] = ymd.split("-").map(Number); const dt = new Date(y, m - 1 + n, d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };

const UI = {
  cache: {}, cal: null, payCal: null, _currentView: "dashboard", _lastPend: 0,

  async init() {
    $("#clubName").textContent = (window.APP_CONFIG || {}).CLUB_NAME || "피클볼 클럽";
    const badge = $("#connBadge");
    if (DB.configured) { badge.textContent = "Supabase 연결됨"; badge.className = "badge badge-ok"; }
    else { badge.textContent = "데모 모드 (로컬 저장)"; badge.className = "badge badge-warn"; }
    $$("#tabs .tab").forEach(t => t.addEventListener("click", () => UI.show(t.dataset.view)));
    $("#modal").addEventListener("click", e => { if (e.target.id === "modal") UI.closeModal(); });
    await UI.show("dashboard");
    await UI.refreshBell(true);
    DB.subscribe(() => UI.onDataChange());
  },
  async show(view) {
    UI._currentView = view;
    $$("#tabs .tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
    $$(".view").forEach(v => v.classList.remove("active"));
    $(`#view-${view}`).classList.add("active");
    try { await UI["render_" + view](); }
    catch (e) { UI.toast("불러오기 오류: " + (e.message || e), true); console.error(e); }
    UI.refreshBell(true);
  },

  async onDataChange() {
    if ($("#modal").classList.contains("hidden")) {
      try { await UI["render_" + (UI._currentView || "dashboard")](); } catch (e) {}
    }
    await UI.refreshBell(false);
  },
  async refreshBell(silent) {
    let members, bookings;
    try { [members, bookings] = await Promise.all([DB.list("members"), DB.list("bookings")]); } catch (e) { return; }
    const pendM = members.filter(m => m.status === "승인대기").length;
    const pendB = bookings.filter(b => b.status === "신청").length;
    const pend = pendM + pendB;
    const el = $("#bellCount");
    if (el) { if (pend > 0) { el.textContent = pend > 99 ? "99+" : pend; el.classList.remove("hidden"); } else el.classList.add("hidden"); }
    if (!silent && pend > (this._lastPend || 0)) {
      const diff = pend - (this._lastPend || 0);
      UI.toast(`🔔 새 요청 ${diff}건 도착`);
      UI.notifyAdmin("새 요청 도착", `가입 승인 대기 ${pendM}건 · 예약 문의 ${pendB}건`);
    }
    this._lastPend = pend;
  },
  notifyAdmin(title, body) {
    try { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body }); } catch (e) {}
  },
  bellClick() {
    if ("Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch (e) {} }
    UI.show("dashboard");
  },

  toast(msg, isErr) {
    const t = $("#toast"); if (!t) return; t.textContent = msg; t.className = "toast" + (isErr ? " err" : "");
    setTimeout(() => t.classList.add("hidden"), 2600);
  },
  openModal(title, html) { $("#modalTitle").textContent = title; $("#modalBody").innerHTML = html; $("#modal").classList.remove("hidden"); },
  closeModal() { $("#modal").classList.add("hidden"); },
  demoBanner() {
    return DB.configured ? "" :
      `<div class="banner">현재 <b>데모 모드</b>입니다. 입력한 데이터는 이 브라우저에만 저장돼요.
      실제 운영하려면 <code>assets/js/config.js</code>에 Supabase 정보를 넣으세요. (배포방법.md 참고)</div>`;
  },

  // ==================== 대시보드 ====================
  async render_dashboard() {
    const [members, schedules, payments, bookings] = await Promise.all([
      DB.list("members"), DB.list("schedules", { order: "start_at", asc: true }), DB.list("payments"), DB.list("bookings")
    ]);
    const now = new Date();
    const todayStr = now.toDateString();
    const todaySch = schedules.filter(s => new Date(s.start_at).toDateString() === todayStr);
    const upcoming = schedules.filter(s => new Date(s.start_at) >= now).slice(0, 4);
    const pendingMembers = members.filter(m => m.status === "승인대기");
    const pendingBookings = bookings.filter(b => b.status === "신청");
    const lastDue = {}; payments.forEach(p => { if (p.period_end && (!lastDue[p.member_id] || p.period_end > lastDue[p.member_id])) lastDue[p.member_id] = p.period_end; });
    const soon = members.filter(m => m.status === "활동").filter(m => { const due = lastDue[m.id]; if (!due) return true; return (new Date(due) - now) / 86400000 <= 7; });
    const active = members.filter(m => m.status === "활동").length;
    const sBy = {}; bookings.forEach(b => { (sBy[b.schedule_id] = sBy[b.schedule_id] || []).push(b); });
    const cnt = id => (sBy[id] || []).filter(b => ACTIVE_BOOK.includes(b.status)).length;
    const clubName = (window.APP_CONFIG || {}).CLUB_NAME || "피클볼 클럽";

    $("#view-dashboard").innerHTML = `
      ${this.demoBanner()}
      <div class="hero"><div class="hero-inner">
        <div class="hero-title">🏓 ${esc(clubName)}</div>
        <div class="hero-sub">회원 · 예약 · 회비를 한 곳에서</div>
      </div></div>
      <div class="cards">
        <div class="stat"><div class="n">${active}</div><div class="l">활동 회원</div></div>
        <div class="stat"><div class="n">${pendingMembers.length}</div><div class="l">가입 승인 대기</div></div>
        <div class="stat"><div class="n">${pendingBookings.length}</div><div class="l">예약 문의</div></div>
        <div class="stat"><div class="n">${todaySch.length}</div><div class="l">오늘 스케줄</div></div>
      </div>

      ${pendingMembers.length ? `<div class="card" style="margin-top:14px">
        <div class="row spread"><b>⏳ 가입 승인 대기 (${pendingMembers.length})</b>
          <button class="btn ghost sm" onclick="UI.show('members')">회원 관리</button></div>
        ${pendingMembers.map(m => `<div class="row spread" style="padding:7px 0;border-top:1px solid var(--line)">
          <div><b>${esc(m.name)}</b> <span class="muted">${esc(m.phone || "")} · 추천인 ${esc(m.referrer || "-")}</span></div>
          <div class="row"><button class="btn sm" onclick="UI.approveMember('${m.id}')">승인</button>
            <button class="btn ghost sm" onclick="UI.rejectMember('${m.id}')">거절</button></div>
        </div>`).join("")}
      </div>` : ""}

      ${pendingBookings.length ? `<div class="card">
        <div class="row spread"><b>📩 예약 문의 (${pendingBookings.length})</b>
          <button class="btn ghost sm" onclick="UI.show('schedules')">스케줄</button></div>
        ${pendingBookings.map(b => {
          const m = members.find(x => x.id === b.member_id), s = schedules.find(x => x.id === b.schedule_id);
          return `<div class="row spread" style="padding:7px 0;border-top:1px solid var(--line)">
            <div><b>${m ? esc(m.name) : "?"}</b> <span class="muted">→ ${s ? esc(s.title) : "?"} ${s ? dDateTime(s.start_at) : ""}</span></div>
            <div class="row"><button class="btn sm" onclick="UI.approveBooking('${b.id}',null)">승인</button>
              <button class="btn ghost sm" onclick="UI.rejectBooking('${b.id}',null)">거절</button></div>
          </div>`;
        }).join("")}
      </div>` : ""}

      <div class="card">
        <div class="row spread"><b>다가오는 스케줄</b><button class="btn ghost sm" onclick="UI.show('schedules')">달력 보기</button></div>
        ${upcoming.length ? upcoming.map(s => `
          <div class="list-item" onclick="UI.openSchedule('${s.id}')">
            <div><div class="li-main">${esc(s.title)}</div>
            <div class="li-sub">${dDateTime(s.start_at)} · ${esc(s.location || "-")}</div></div>
            <span class="pill">${cnt(s.id)}/${s.capacity || "-"}</span>
          </div>`).join("") : `<div class="empty">예정된 스케줄이 없습니다.</div>`}
      </div>

      <div class="card">
        <div class="row spread"><b>회비 확인이 필요한 회원</b><button class="btn ghost sm" onclick="UI.show('payments')">회비 관리</button></div>
        ${soon.length ? soon.slice(0, 6).map(m => `
          <div class="list-item" onclick="UI.openMember('${m.id}')">
            <div><div class="li-main">${esc(m.name)}</div>
            <div class="li-sub">다음 회비 기준일: ${lastDue[m.id] ? dDate(lastDue[m.id]) : "납부 기록 없음"}</div></div>
            <span class="pill ${lastDue[m.id] && new Date(lastDue[m.id]) >= now ? "warn" : "bad"}">확인</span>
          </div>`).join("") : `<div class="empty">확인이 필요한 회원이 없습니다.</div>`}
      </div>`;
  },

  // ==================== 회원 ====================
  async render_members() {
    const members = await DB.list("members");
    this.cache.members = members;
    const pending = members.filter(m => m.status === "승인대기");
    const others = members.filter(m => m.status !== "승인대기" && m.status !== "거절");
    this.cache.memberList = others;
    $("#view-members").innerHTML = `
      ${this.demoBanner()}
      <div class="row spread"><h2>회원</h2><button class="btn" onclick="UI.memberForm()">+ 가입 신청</button></div>
      ${pending.length ? `<div class="card" style="border-color:var(--warn)">
        <b>⏳ 가입 승인 대기 (${pending.length})</b>
        ${pending.map(m => `<div class="row spread" style="padding:8px 0;border-top:1px solid var(--line)">
          <div onclick="UI.openMember('${m.id}')" style="cursor:pointer">
            <div class="li-main">${esc(m.name)}</div>
            <div class="li-sub">${esc(m.phone || "-")} · 생년월일 ${esc(m.birth_date || "-")} · 추천인 ${esc(m.referrer || "-")}</div>
          </div>
          <div class="row"><button class="btn sm" onclick="UI.approveMember('${m.id}')">승인</button>
            <button class="btn ghost sm" onclick="UI.rejectMember('${m.id}')">거절</button></div>
        </div>`).join("")}
      </div>` : ""}
      <div class="row spread" style="margin-top:6px"><b>회원 목록 (${others.length})</b></div>
      <input class="search" id="memSearch" placeholder="이름·연락처 검색" oninput="UI.filterMembers(this.value)" />
      <div id="memList" style="margin-top:10px"></div>`;
    this.filterMembers("");
  },
  filterMembers(q) {
    q = (q || "").trim();
    const list = (this.cache.memberList || []).filter(m => !q || (m.name || "").includes(q) || (m.phone || "").includes(q));
    $("#memList").innerHTML = list.length ? list.map(m => `
      <div class="list-item" onclick="UI.openMember('${m.id}')">
        <div><div class="li-main">${esc(m.name)}
          <span class="pill ${m.status === "활동" ? "ok" : "warn"}">${esc(m.status)}</span></div>
          <div class="li-sub">${esc(m.phone || "-")} · 추천인 ${esc(m.referrer || "-")}</div></div>
        <span class="muted">›</span>
      </div>`).join("") : `<div class="empty">회원이 없습니다.</div>`;
  },
  memberForm(m = {}) {
    const f = (k) => esc(m[k] || "");
    const editing = !!m.id;
    this.openModal(editing ? "회원 정보 수정" : "가입 신청", `
      <label>이름 *</label><input id="m_name" value="${f("name")}" />
      <label>전화번호 *</label><input id="m_phone" value="${f("phone")}" placeholder="010-0000-0000" />
      <label>생년월일</label><input type="date" id="m_birth" value="${f("birth_date")}" />
      <label>추천인</label><input id="m_referrer" value="${f("referrer")}" placeholder="소개해 주신 분" />
      ${editing ? `<label>상태</label><select id="m_status">${["승인대기", "활동", "휴면", "탈퇴"].map(o => `<option ${m.status === o ? "selected" : ""}>${o}</option>`).join("")}</select>` : `<div class="banner" style="margin-top:12px">신청하면 <b>승인 대기</b> 상태로 등록되고, 관리자가 승인하면 활동 회원이 됩니다.</div>`}
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        ${editing ? `<button class="btn danger" onclick="UI.deleteMember('${m.id}')">삭제</button>` : ""}
        <button class="btn ghost" onclick="UI.closeModal()">취소</button>
        <button class="btn" onclick="UI.saveMember('${m.id || ""}')">${editing ? "저장" : "가입 신청"}</button>
      </div>`);
  },
  async saveMember(id) {
    const row = {
      name: $("#m_name").value.trim(), phone: $("#m_phone").value.trim(),
      birth_date: $("#m_birth").value || null, referrer: $("#m_referrer").value.trim()
    };
    if (!row.name || !row.phone) return UI.toast("이름과 전화번호는 필수입니다", true);
    try {
      if (id) { row.status = $("#m_status").value; await DB.update("members", id, row); }
      else { row.status = "승인대기"; await DB.insert("members", row); }
      UI.closeModal(); UI.toast(id ? "저장되었습니다" : "가입 신청 완료 (승인 대기)"); UI.render_members();
    } catch (e) { UI.toast("저장 실패: " + e.message, true); }
  },
  async approveMember(id) {
    await DB.update("members", id, { status: "활동", join_date: new Date().toISOString().slice(0, 10) });
    UI.toast("승인되었습니다"); UI.closeModal();
    UI.show($(".view.active").id === "view-dashboard" ? "dashboard" : "members");
  },
  async rejectMember(id) {
    if (!confirm("이 가입 신청을 거절할까요?")) return;
    await DB.update("members", id, { status: "거절" });
    UI.toast("거절되었습니다"); UI.closeModal();
    UI.show($(".view.active").id === "view-dashboard" ? "dashboard" : "members");
  },
  async deleteMember(id) {
    if (!confirm("이 회원을 삭제할까요? 예약·회비 기록도 함께 삭제됩니다.")) return;
    await DB.remove("members", id); UI.closeModal(); UI.toast("삭제됨"); UI.render_members();
  },
  async openMember(id) {
    const [members, payments, bookings, schedules] = await Promise.all([
      DB.list("members"), DB.list("payments"), DB.list("bookings"), DB.list("schedules")
    ]);
    const m = members.find(x => x.id === id); if (!m) return;
    const myPays = payments.filter(p => p.member_id === id).sort((a, b) => b.paid_date > a.paid_date ? 1 : -1);
    const myBooks = bookings.filter(b => b.member_id === id);
    const nextDue = myPays.map(p => p.period_end).filter(Boolean).sort().pop();
    this.openModal(m.name, `
      <div class="row spread">
        <div class="li-sub">${esc(m.phone || "-")} · 생년월일 ${esc(m.birth_date || "-")} · 추천인 ${esc(m.referrer || "-")}
          <span class="pill ${m.status === "활동" ? "ok" : "warn"}">${esc(m.status)}</span></div>
        <button class="btn ghost sm" onclick='UI.memberForm(${JSON.stringify(m).replace(/'/g, "\\'")})'>수정</button>
      </div>
      ${m.status === "승인대기" ? `<div class="row" style="margin-top:10px">
        <button class="btn" onclick="UI.approveMember('${id}')">가입 승인</button>
        <button class="btn ghost" onclick="UI.rejectMember('${id}')">거절</button></div>` : ""}
      <div class="card" style="margin-top:12px">
        <b>회비</b> <span class="muted">· 다음 기준일: ${nextDue ? dDate(nextDue) : "기록 없음"}</span>
        ${myPays.length ? myPays.map(p => `<div class="li-sub">• ${dDate(p.paid_date)} ${won(p.amount)} (${dDate(p.period_start)}~${dDate(p.period_end)})</div>`).join("") : `<div class="empty">납부 기록 없음</div>`}
        <button class="btn sm" style="margin-top:8px" onclick="UI.paymentForm('${id}')">+ 회비 입금 기록</button>
      </div>
      <div class="card">
        <b>예약 내역</b>
        ${myBooks.length ? myBooks.map(b => { const s = schedules.find(x => x.id === b.schedule_id); return `<div class="li-sub">• ${s ? esc(s.title) + " " + dDateTime(s.start_at) : "(삭제된 스케줄)"} — ${esc(b.status)}</div>`; }).join("") : `<div class="empty">예약 내역 없음</div>`}
      </div>`);
  },

  // ==================== 스케줄 (달력 + 시간예약) ====================
  async render_schedules() {
    const [schedules, coaches, bookings] = await Promise.all([
      DB.list("schedules", { order: "start_at", asc: true }), DB.list("coaches"), DB.list("bookings")
    ]);
    this.cache.coaches = coaches; this.cache.schedules = schedules; this.cache.bookings = bookings;
    const now = new Date();
    if (!this.cal) this.cal = { y: now.getFullYear(), m: now.getMonth(), sel: localDay(now) };
    this.drawCalendar();
  },
  calMove(delta) { let { y, m } = this.cal; m += delta; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } this.cal.y = y; this.cal.m = m; this.drawCalendar(); },
  selectDay(day) { this.cal.sel = day; this.drawCalendar(); },

  async openDay(dayKey) {
    const [schedules, bookings, members, coaches] = await Promise.all([
      DB.list("schedules"), DB.list("bookings"), DB.list("members"), DB.list("coaches")
    ]);
    this.cache.schedules = schedules; this.cache.bookings = bookings; this.cache.coaches = coaches;
    this.cal.sel = dayKey; this.drawCalendar();
    const active = members.filter(m => m.status === "활동");
    const nm = id => { const m = members.find(x => x.id === id); return m ? esc(m.name) : "(삭제)"; };
    const daySch = schedules.filter(s => localDay(s.start_at) === dayKey);
    const byHour = {};
    daySch.forEach(s => { const h = new Date(s.start_at).getHours(); (byHour[h] = byHour[h] || []).push(s); });
    const [yy, mm, dd] = dayKey.split("-").map(Number);
    const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(yy, mm - 1, dd).getDay()];

    let rows = "";
    for (let h = SLOT_START; h < SLOT_END; h++) {
      const schs = byHour[h] || [];
      let inner;
      if (!schs.length) { inner = `<span class="muted">비어 있음</span>`; }
      else {
        inner = schs.map(s => {
          const bs = bookings.filter(b => b.schedule_id === s.id);
          const booked = bs.filter(b => ACTIVE_BOOK.includes(b.status));
          const reqs = bs.filter(b => b.status === "신청");
          const full = booked.length >= (s.capacity || 99);
          return `<div class="slot-sch">
            <b>${esc(s.title)}</b> <span class="pill ${full ? "bad" : "ok"}">${booked.length}/${s.capacity || "-"}</span>
            ${booked.length ? `<div class="li-sub">예약확정: ${booked.map(b => nm(b.member_id)).join(", ")}</div>` : ""}
            ${reqs.map(b => `<div class="row spread slot-req"><span><span class="pill warn">신청</span> ${nm(b.member_id)}</span>
              <span class="row"><button class="btn sm" onclick="UI.slotApprove('${b.id}','${dayKey}')">승인</button>
              <button class="btn ghost sm" onclick="UI.slotReject('${b.id}','${dayKey}')">거절</button></span></div>`).join("")}
          </div>`;
        }).join("");
      }
      rows += `<div class="slot-row">
        <div class="slot-time">${String(h).padStart(2, "0")}:00</div>
        <div class="slot-body">${inner}</div>
        <button class="btn ghost sm slot-add" onclick="UI.requestSlot('${dayKey}',${h})">신청</button>
      </div>`;
    }

    this.openModal(`${mm}월 ${dd}일 (${wd}) 시간표`, `
      <label>신청할 회원</label>
      <select id="slotMember">${active.length ? active.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("") : `<option value="">활동 회원이 없습니다</option>`}</select>
      <div class="slot-list">${rows}</div>
      <div class="banner" style="margin-top:10px">회원을 고르고 원하는 시간의 <b>신청</b>을 누르면 ‘신청’으로 등록됩니다.
      관리자가 <b>승인</b>하면 예약이 확정돼요. (실제 운영 시 회원은 앱에서 본인 시간을 신청)</div>`);
  },
  async requestSlot(dayKey, hour) {
    const memberId = $("#slotMember").value;
    if (!memberId) return UI.toast("회원을 선택하세요", true);
    let schedules = await DB.list("schedules");
    let s = schedules.find(x => localDay(x.start_at) === dayKey && new Date(x.start_at).getHours() === hour);
    if (!s) {
      const start = new Date(`${dayKey}T${String(hour).padStart(2, "0")}:00:00`);
      const end = new Date(start); end.setHours(hour + 1);
      s = await DB.insert("schedules", { title: "타임 예약", start_at: start.toISOString(), end_at: end.toISOString(), capacity: SLOT_CAP, level: null, location: null, coach_id: null });
    } else {
      const bs = (await DB.list("bookings")).filter(b => b.schedule_id === s.id && b.member_id === memberId && ["신청", "예약", "출석"].includes(b.status));
      if (bs.length) return UI.toast("이미 신청/예약된 시간입니다", true);
    }
    await DB.insert("bookings", { schedule_id: s.id, member_id: memberId, status: "신청" });
    UI.toast("타임 신청 완료 (승인 대기)");
    UI.openDay(dayKey);
  },
  async slotApprove(bookingId, dayKey) { await DB.update("bookings", bookingId, { status: "예약" }); UI.toast("예약 승인됨"); UI.openDay(dayKey); },
  async slotReject(bookingId, dayKey) { await DB.update("bookings", bookingId, { status: "거절" }); UI.toast("신청 거절됨"); UI.openDay(dayKey); },

  drawCalendar() {
    const { y, m, sel } = this.cal;
    const schedules = this.cache.schedules || [];
    const bookings = this.cache.bookings || [];
    const coaches = this.cache.coaches || [];
    const cnt = id => bookings.filter(b => b.schedule_id === id && ACTIVE_BOOK.includes(b.status)).length;
    const byDay = {};
    schedules.forEach(s => { const k = localDay(s.start_at); (byDay[k] = byDay[k] || []).push(s); });
    Object.values(byDay).forEach(arr => arr.sort((a, b) => a.start_at > b.start_at ? 1 : -1));
    const first = new Date(y, m, 1); const startWd = first.getDay(); const days = new Date(y, m + 1, 0).getDate();
    const todayKey = localDay(new Date()); const wd = ["일", "월", "화", "수", "목", "금", "토"];
    let cells = "";
    for (let i = 0; i < startWd; i++) cells += `<div class="cal-cell empty-cell"></div>`;
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const items = byDay[key] || [];
      const dots = items.slice(0, 3).map(() => `<span class="dot"></span>`).join("");
      cells += `<div class="cal-cell${key === sel ? " sel" : ""}${key === todayKey ? " today" : ""}" onclick="UI.openDay('${key}')">
        <span class="cal-num">${d}</span>${items.length ? `<span class="cal-dots">${dots}${items.length > 3 ? "+" : ""}</span>` : ""}</div>`;
    }
    const selItems = byDay[sel] || []; const [sy, sm, sd] = sel.split("-").map(Number);
    const selLabel = `${sy}년 ${sm}월 ${sd}일 (${wd[new Date(sy, sm - 1, sd).getDay()]})`;
    $("#view-schedules").innerHTML = `
      ${this.demoBanner()}
      <div class="row spread"><h2>스케줄</h2></div>
      <div class="cal-head"><button class="icon-btn" onclick="UI.calMove(-1)">‹</button><b>${y}년 ${m + 1}월</b><button class="icon-btn" onclick="UI.calMove(1)">›</button></div>
      <div class="cal-grid cal-wd">${wd.map((w, i) => `<div class="cal-wdcell${i === 0 ? " sun" : i === 6 ? " sat" : ""}">${w}</div>`).join("")}</div>
      <div class="cal-grid">${cells}</div>
      <div class="card" style="margin-top:14px">
        <div class="row spread"><b>${selLabel}</b>
          <button class="btn sm" onclick="UI.openDay('${sel}')">시간표 열기</button></div>
        ${selItems.length ? selItems.map(s => {
          const coach = coaches.find(c => c.id === s.coach_id);
          return `<div class="list-item" onclick="UI.openSchedule('${s.id}')">
            <div><div class="li-main">${dTime(s.start_at)} ${esc(s.title)} <span class="pill">${esc(s.level || "")}</span></div>
            <div class="li-sub">${esc(s.location || "-")} · ${coach ? esc(coach.name) : "코치 미정"}</div></div>
            <span class="pill ${cnt(s.id) >= (s.capacity || 99) ? "bad" : "ok"}">${cnt(s.id)}/${s.capacity || "-"}</span>
          </div>`;
        }).join("") : `<div class="empty">이 날 등록된 스케줄이 없습니다. (날짜를 눌러 시간표에서 예약을 받을 수 있어요)</div>`}
        <button class="btn ghost sm" style="margin-top:8px" onclick="UI.scheduleForm(null,'${sel}')">+ 수업/일정 직접 추가</button>
      </div>`;
  },
  scheduleForm(s, presetDay) {
    s = s || {};
    const coaches = this.cache.coaches || [];
    const f = (k, d = "") => esc(s[k] != null ? s[k] : d);
    let startVal = toInput(s.start_at);
    if (!startVal && presetDay) startVal = presetDay + "T19:00";
    this.openModal(s.id ? "스케줄 수정" : "새 스케줄", `
      <label>제목 *</label><input id="s_title" value="${f("title")}" placeholder="예: 저녁 초급반" />
      <div class="grid2">
        <div><label>시작 *</label><input type="datetime-local" id="s_start" value="${startVal}" /></div>
        <div><label>종료</label><input type="datetime-local" id="s_end" value="${toInput(s.end_at)}" /></div>
      </div>
      <div class="grid2">
        <div><label>장소</label><input id="s_loc" value="${f("location")}" /></div>
        <div><label>정원</label><input type="number" id="s_cap" value="${f("capacity", 8)}" /></div>
      </div>
      <div class="grid2">
        <div><label>난이도</label><select id="s_level">${["", "초급", "중급", "고급"].map(o => `<option ${s.level === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>
        <div><label>담당 코치</label><select id="s_coach"><option value="">미정</option>${coaches.map(c => `<option value="${c.id}" ${s.coach_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
      </div>
      <label>메모</label><textarea id="s_notes" rows="2">${f("notes")}</textarea>
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        ${s.id ? `<button class="btn danger" onclick="UI.deleteSchedule('${s.id}')">삭제</button>` : ""}
        <button class="btn ghost" onclick="UI.closeModal()">취소</button>
        <button class="btn" onclick="UI.saveSchedule('${s.id || ""}')">저장</button>
      </div>`);
  },
  async saveSchedule(id) {
    const row = {
      title: $("#s_title").value.trim(),
      start_at: $("#s_start").value ? new Date($("#s_start").value).toISOString() : null,
      end_at: $("#s_end").value ? new Date($("#s_end").value).toISOString() : null,
      location: $("#s_loc").value.trim(), capacity: Number($("#s_cap").value) || null,
      level: $("#s_level").value || null, coach_id: $("#s_coach").value || null,
      notes: $("#s_notes").value.trim()
    };
    if (!row.title || !row.start_at) return UI.toast("제목과 시작 시각은 필수입니다", true);
    try {
      if (id) await DB.update("schedules", id, row); else await DB.insert("schedules", row);
      if (!id) this.cal.sel = localDay(row.start_at);
      UI.closeModal(); UI.toast("저장됨"); UI.render_schedules();
    } catch (e) { UI.toast("저장 실패: " + e.message, true); }
  },
  async deleteSchedule(id) {
    if (!confirm("이 스케줄을 삭제할까요? 예약도 함께 삭제됩니다.")) return;
    await DB.remove("schedules", id); UI.closeModal(); UI.toast("삭제됨"); UI.render_schedules();
  },
  async openSchedule(id) {
    const [schedules, coaches, bookings, members] = await Promise.all([
      DB.list("schedules"), DB.list("coaches"), DB.list("bookings"), DB.list("members")
    ]);
    this.cache.coaches = coaches;
    const s = schedules.find(x => x.id === id); if (!s) return;
    const coach = coaches.find(c => c.id === s.coach_id);
    const all = bookings.filter(b => b.schedule_id === id);
    const requests = all.filter(b => b.status === "신청");
    const booked = all.filter(b => ACTIVE_BOOK.includes(b.status));
    const usedIds = all.filter(b => ["신청", "예약", "출석"].includes(b.status)).map(b => b.member_id);
    const avail = members.filter(m => !usedIds.includes(m.id) && m.status === "활동");
    const nm = mid => { const m = members.find(x => x.id === mid); return m ? esc(m.name) : "(삭제된 회원)"; };
    const ph = mid => { const m = members.find(x => x.id === mid); return m && m.phone ? `<span class="muted">${esc(m.phone)}</span>` : ""; };

    this.openModal(s.title, `
      <div class="row spread">
        <div class="li-sub">${dDateTime(s.start_at)} · ${esc(s.location || "-")} · ${coach ? esc(coach.name) : "코치 미정"}</div>
        <button class="btn ghost sm" onclick='UI.scheduleForm(${JSON.stringify(s).replace(/'/g, "\\'")})'>수정</button>
      </div>
      ${requests.length ? `<div class="card" style="margin-top:12px;border-color:var(--warn)">
        <b>📩 예약 문의 (${requests.length})</b>
        ${requests.map(b => `<div class="row spread" style="padding:7px 0;border-top:1px solid var(--line)">
          <div>${nm(b.member_id)} ${ph(b.member_id)}${b.note ? `<div class="li-sub">“${esc(b.note)}”</div>` : ""}</div>
          <div class="row"><button class="btn sm" onclick="UI.approveBooking('${b.id}','${id}')">승인</button>
            <button class="btn ghost sm" onclick="UI.rejectBooking('${b.id}','${id}')">거절</button></div>
        </div>`).join("")}
      </div>` : ""}
      <div class="card" style="margin-top:12px">
        <div class="row spread"><b>예약자 (${booked.length}/${s.capacity || "-"})</b>
          <button class="btn sm" onclick="UI.notifySchedule('${id}')">📣 알림 보내기</button></div>
        ${booked.length ? booked.map(b => `
          <div class="row spread" style="padding:6px 0">
            <span>${nm(b.member_id)} ${ph(b.member_id)}</span>
            <button class="btn ghost sm" onclick="UI.cancelBooking('${b.id}','${id}')">예약취소</button>
          </div>`).join("") : `<div class="empty">예약자가 없습니다.</div>`}
      </div>
      <div class="card">
        <label>회원 추가 (예약/문의)</label>
        <select id="addMember">${avail.length ? avail.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("") : `<option value="">추가 가능한 활동 회원 없음</option>`}</select>
        <div class="row" style="margin-top:8px">
          <button class="btn" onclick="UI.addBooking('${id}','예약')">바로 예약</button>
          <button class="btn ghost" onclick="UI.addBooking('${id}','신청')">예약 문의로 추가</button>
        </div>
      </div>`);
  },
  async addBooking(scheduleId, status) {
    const memberId = $("#addMember").value;
    if (!memberId) return UI.toast("회원을 선택하세요", true);
    try {
      await DB.insert("bookings", { schedule_id: scheduleId, member_id: memberId, status });
      UI.toast(status === "예약" ? "예약 추가됨" : "예약 문의 등록됨"); UI.openSchedule(scheduleId);
    } catch (e) { UI.toast("이미 등록된 회원이거나 오류: " + e.message, true); }
  },
  async approveBooking(bookingId, scheduleId) {
    await DB.update("bookings", bookingId, { status: "예약" }); UI.toast("예약 승인됨");
    if (scheduleId) UI.openSchedule(scheduleId); else { UI.closeModal(); UI.show("dashboard"); }
  },
  async rejectBooking(bookingId, scheduleId) {
    await DB.update("bookings", bookingId, { status: "거절" }); UI.toast("예약 문의 거절됨");
    if (scheduleId) UI.openSchedule(scheduleId); else { UI.closeModal(); UI.show("dashboard"); }
  },
  async cancelBooking(bookingId, scheduleId) {
    await DB.update("bookings", bookingId, { status: "취소" }); UI.toast("예약 취소됨"); UI.openSchedule(scheduleId);
  },
  async notifySchedule(scheduleId) {
    const [schedules, bookings, members] = await Promise.all([DB.list("schedules"), DB.list("bookings"), DB.list("members")]);
    const s = schedules.find(x => x.id === scheduleId);
    const recipients = bookings.filter(b => b.schedule_id === scheduleId && ACTIVE_BOOK.includes(b.status))
      .map(b => members.find(m => m.id === b.member_id)).filter(Boolean);
    if (!recipients.length) return UI.toast("예약자가 없습니다", true);
    const msg = `[${(window.APP_CONFIG || {}).CLUB_NAME || "피클볼"}] ${s.title} 안내\n일시: ${dDateTime(s.start_at)}\n장소: ${s.location || "-"}\n참석 부탁드립니다 🏓`;
    this.openModal("스케줄 알림 발송", `
      <label>발송 미리보기</label>
      <textarea id="notifyMsg" rows="5">${esc(msg)}</textarea>
      <div class="li-sub" style="margin-top:8px">받는 사람 ${recipients.length}명: ${recipients.map(r => esc(r.name)).join(", ")}</div>
      ${DB.configured ? "" : `<div class="banner" style="margin-top:10px">데모 모드에서는 실제 발송되지 않고 시뮬레이션만 됩니다. 실제 카카오 알림톡 연결은 배포방법.md를 참고하세요.</div>`}
      <div class="row" style="margin-top:14px;justify-content:flex-end">
        <button class="btn ghost" onclick="UI.closeModal()">닫기</button>
        <button class="btn" onclick='UI.sendNotify("${scheduleId}")'>발송</button>
      </div>`);
  },
  async sendNotify(scheduleId) {
    const [bookings, members] = await Promise.all([DB.list("bookings"), DB.list("members")]);
    const recipients = bookings.filter(b => b.schedule_id === scheduleId && ACTIVE_BOOK.includes(b.status))
      .map(b => members.find(m => m.id === b.member_id)).filter(Boolean)
      .map(m => ({ id: m.id, name: m.name, phone: m.phone }));
    const message = $("#notifyMsg").value;
    try {
      const res = await DB.notify({ schedule_id: scheduleId, message, recipients });
      for (const r of recipients) await DB.insert("notifications", { member_id: r.id, schedule_id: scheduleId, channel: DB.configured ? "alimtalk" : "demo", message, status: "sent", sent_at: new Date().toISOString() });
      UI.closeModal();
      UI.toast(res.simulated ? `시뮬레이션: ${recipients.length}명 발송(데모)` : `${recipients.length}명에게 발송됨`);
    } catch (e) { UI.toast("발송 실패: " + e.message, true); }
  },

  // ==================== 회비 (달력) ====================
  async render_payments() {
    const [members, payments] = await Promise.all([DB.list("members"), DB.list("payments")]);
    this.cache.members = members; this.cache.payments = payments;
    const now = new Date();
    if (!this.payCal) this.payCal = { y: now.getFullYear(), m: now.getMonth(), sel: localDay(now) };
    this.drawFeeCalendar();
  },
  feeDueMap() {
    const map = {};
    (this.cache.payments || []).forEach(p => {
      if (!p.period_end) return;
      if (!map[p.member_id] || p.period_end > map[p.member_id]) map[p.member_id] = p.period_end;
    });
    return map;
  },
  feeCalMove(delta) { let { y, m } = this.payCal; m += delta; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } this.payCal.y = y; this.payCal.m = m; this.drawFeeCalendar(); },
  drawFeeCalendar() {
    const { y, m, sel } = this.payCal;
    const members = this.cache.members || [], payments = this.cache.payments || [];
    const billable = members.filter(mm => mm.status === "활동" || mm.status === "휴면");
    const dueMap = this.feeDueMap();
    const paidByDay = {}; payments.forEach(p => { if (p.paid_date) { paidByDay[p.paid_date] = (paidByDay[p.paid_date] || 0) + 1; } });
    const dueByDay = {}; billable.forEach(mm => { const d = dueMap[mm.id]; if (d) { dueByDay[d] = (dueByDay[d] || 0) + 1; } });
    const noRecord = billable.filter(mm => !dueMap[mm.id]);
    const first = new Date(y, m, 1); const startWd = first.getDay(); const days = new Date(y, m + 1, 0).getDate();
    const todayKey = localDay(new Date()); const wd = ["일", "월", "화", "수", "목", "금", "토"];
    let cells = "";
    for (let i = 0; i < startWd; i++) cells += `<div class="cal-cell empty-cell"></div>`;
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const paid = paidByDay[key] || 0, due = dueByDay[key] || 0;
      let marks = "";
      if (paid) marks += `<span class="fee-mk paid">입${paid}</span>`;
      if (due) marks += `<span class="fee-mk due">미${due}</span>`;
      cells += `<div class="cal-cell${key === sel ? " sel" : ""}${key === todayKey ? " today" : ""}" onclick="UI.openFeeDay('${key}')">
        <span class="cal-num">${d}</span>${marks ? `<span class="fee-marks">${marks}</span>` : ""}</div>`;
    }
    $("#view-payments").innerHTML = `${this.demoBanner()}
      <div class="row spread"><h2>회비 관리</h2></div>
      <div class="li-sub" style="margin-bottom:8px">날짜를 누르면 그날 <b>입금인</b>과 <b>미입금인(입금 예정)</b>을 볼 수 있어요.
      <span class="fee-mk paid">입N</span> 입금 완료 · <span class="fee-mk due">미N</span> 입금 예정</div>
      <div class="cal-head"><button class="icon-btn" onclick="UI.feeCalMove(-1)">‹</button><b>${y}년 ${m + 1}월</b><button class="icon-btn" onclick="UI.feeCalMove(1)">›</button></div>
      <div class="cal-grid cal-wd">${wd.map((w, i) => `<div class="cal-wdcell${i === 0 ? " sun" : i === 6 ? " sat" : ""}">${w}</div>`).join("")}</div>
      <div class="cal-grid">${cells}</div>
      ${noRecord.length ? `<div class="card" style="margin-top:14px"><b>회비 기록이 없는 회원 (${noRecord.length})</b>
        <div class="li-sub" style="margin:4px 0 8px">첫 입금을 등록하면 다음 입금 예정일이 달력에 표시됩니다.</div>
        ${noRecord.map(mm => `<div class="row spread" style="padding:6px 0;border-top:1px solid var(--line)">
          <span>${esc(mm.name)} <span class="muted">${esc(mm.phone || "")}</span></span>
          <button class="btn sm" onclick="UI.paymentForm('${mm.id}')">입금 등록</button></div>`).join("")}</div>` : ""}`;
  },
  async openFeeDay(dayKey) {
    this.payCal.sel = dayKey; this.drawFeeCalendar();
    const members = this.cache.members || [], payments = this.cache.payments || [];
    const billable = members.filter(mm => mm.status === "활동" || mm.status === "휴면");
    const dueMap = this.feeDueMap();
    const nm = id => { const mm = members.find(x => x.id === id); return mm ? esc(mm.name) : "(삭제)"; };
    const paidList = payments.filter(p => p.paid_date === dayKey);
    const dueList = billable.filter(mm => dueMap[mm.id] === dayKey);
    const [yy, mm2, dd] = dayKey.split("-").map(Number);
    const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(yy, mm2 - 1, dd).getDay()];
    this.openModal(`${mm2}월 ${dd}일 (${wd}) 회비`, `
      <div class="fee-box paid-box">
        <div class="fee-box-h">💰 입금인 (${paidList.length})</div>
        ${paidList.length ? paidList.map(p => `<div class="row spread fee-item">
          <span>${nm(p.member_id)} <span class="muted">${won(p.amount)} · ${p.months || 1}개월</span></span>
          <span class="li-sub">~${dDate(p.period_end)}</span></div>`).join("") : `<div class="empty">이 날 입금한 회원이 없습니다.</div>`}
      </div>
      <div class="fee-box due-box">
        <div class="fee-box-h">⏰ 미입금인 · 입금 예정 (${dueList.length})</div>
        ${dueList.length ? dueList.map(mm => `<div class="row spread fee-item">
          <span>${esc(mm.name)} <span class="muted">${esc(mm.phone || "")}</span></span>
          <button class="btn sm" onclick="UI.paymentForm('${mm.id}','${dayKey}')">입금 처리</button></div>`).join("") : `<div class="empty">이 날 입금 예정인 회원이 없습니다.</div>`}
      </div>`);
  },
  paymentForm(memberId, dueDay) {
    const today = new Date().toISOString().slice(0, 10);
    const paid = dueDay || today;
    this.openModal("회비 입금 처리", `
      <div class="grid2">
        <div><label>입금일</label><input type="date" id="p_paid" value="${paid}" oninput="UI.recalcFee()" /></div>
        <div><label>개월 수</label><select id="p_months" onchange="UI.recalcFee()">${Array.from({ length: 12 }, (_, i) => i + 1).map(n => `<option value="${n}">${n}개월</option>`).join("")}</select></div>
      </div>
      <label>금액(원)</label><input type="number" id="p_amount" value="${MONTHLY_FEE}" />
      <label>납부 방법</label><select id="p_method">${["계좌이체", "현금", "카드"].map(o => `<option>${o}</option>`).join("")}</select>
      <div class="banner" id="p_due" style="margin-top:10px"></div>
      <label>메모</label><input id="p_notes" />
      <input type="hidden" id="p_return" value="${dueDay || ""}" />
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        <button class="btn ghost" onclick="UI.closeModal()">취소</button>
        <button class="btn" onclick="UI.savePayment('${memberId}')">저장</button>
      </div>`);
    this.recalcFee();
  },
  recalcFee() {
    const months = Number(($("#p_months") || {}).value || 1);
    const paid = ($("#p_paid") || {}).value || new Date().toISOString().slice(0, 10);
    const amt = $("#p_amount"); if (amt) amt.value = months * MONTHLY_FEE;
    const due = $("#p_due"); if (due && paid) due.innerHTML = `적용 기간: ${dDate(paid)} ~ <b>${dDate(addMonths(paid, months))}</b> · 다음 입금 예정일은 <b>${dDate(addMonths(paid, months))}</b> 입니다.`;
  },
  async savePayment(memberId) {
    const paid = $("#p_paid").value; const months = Number($("#p_months").value || 1);
    if (!paid) return UI.toast("입금일을 선택하세요", true);
    const row = {
      member_id: memberId, amount: Number($("#p_amount").value) || 0,
      paid_date: paid, period_start: paid, period_end: addMonths(paid, months),
      months, method: $("#p_method").value, status: "완납", notes: $("#p_notes").value.trim()
    };
    const ret = ($("#p_return") || {}).value || "";
    try {
      await DB.insert("payments", row);
      this.cache.payments = await DB.list("payments");
      UI.closeModal(); UI.toast("회비 입금 처리됨");
      if (ret) UI.openFeeDay(ret); else UI.render_payments();
    } catch (e) { UI.toast("저장 실패: " + e.message, true); }
  },

  // ==================== 코치 ====================
  async render_coaches() {
    const coaches = await DB.list("coaches");
    $("#view-coaches").innerHTML = `
      ${this.demoBanner()}
      <div class="row spread"><h2>코칭 스탭 (${coaches.length})</h2>
        <button class="btn" onclick="UI.coachForm()">+ 코치 추가</button></div>
      ${coaches.length ? coaches.map(c => `
        <div class="list-item" onclick='UI.coachForm(${JSON.stringify(c).replace(/'/g, "\\'")})'>
          <div><div class="li-main">${esc(c.name)} <span class="pill">${esc(c.role || "")}</span></div>
          <div class="li-sub">${esc(c.phone || "-")} · ${esc(c.address || "주소 미입력")}</div></div>
          <span class="muted">›</span>
        </div>`).join("") : `<div class="empty">등록된 코치가 없습니다.</div>`}`;
  },
  coachForm(c = {}) {
    const f = (k) => esc(c[k] || "");
    this.openModal(c.id ? "코치 정보" : "코치 추가", `
      <label>이름 *</label><input id="c_name" value="${f("name")}" />
      <div class="grid2">
        <div><label>연락처</label><input id="c_phone" value="${f("phone")}" /></div>
        <div><label>역할</label><select id="c_role">${["코치", "매니저", "스탭"].map(o => `<option ${c.role === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>
      </div>
      <label>주소</label><input id="c_addr" value="${f("address")}" />
      <label>전문 분야</label><input id="c_spec" value="${f("specialty")}" />
      <label>메모</label><textarea id="c_notes" rows="2">${f("notes")}</textarea>
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        ${c.id ? `<button class="btn danger" onclick="UI.deleteCoach('${c.id}')">삭제</button>` : ""}
        <button class="btn ghost" onclick="UI.closeModal()">취소</button>
        <button class="btn" onclick="UI.saveCoach('${c.id || ""}')">저장</button>
      </div>`);
  },
  async saveCoach(id) {
    const row = {
      name: $("#c_name").value.trim(), phone: $("#c_phone").value.trim(),
      role: $("#c_role").value, address: $("#c_addr").value.trim(),
      specialty: $("#c_spec").value.trim(), notes: $("#c_notes").value.trim()
    };
    if (!row.name) return UI.toast("이름을 입력하세요", true);
    try { if (id) await DB.update("coaches", id, row); else await DB.insert("coaches", row);
      UI.closeModal(); UI.toast("저장됨"); UI.render_coaches();
    } catch (e) { UI.toast("저장 실패: " + e.message, true); }
  },
  async deleteCoach(id) {
    if (!confirm("이 코치를 삭제할까요?")) return;
    await DB.remove("coaches", id); UI.closeModal(); UI.toast("삭제됨"); UI.render_coaches();
  }
};

document.addEventListener("DOMContentLoaded", () => UI.init());
