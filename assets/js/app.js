// ============================================================
// 피클볼 회원관리 — 로그인(아이디+비번)/역할 + 공지/스케줄/회비/알림
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
const maskName = (n) => { n = String(n || ""); if (n.length <= 1) return n; if (n.length === 2) return n[0] + "*"; return n[0] + "*".repeat(n.length - 2) + n[n.length - 1]; };
const fmtPhone = (v) => { let d = String(v || "").replace(/\D/g, "").slice(0, 11); if (d.length < 4) return d; if (d.length < 8) return d.slice(0, 3) + "-" + d.slice(3); return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7); };
const fmtBirth = (v) => { let d = String(v || "").replace(/\D/g, "").slice(0, 8); if (d.length < 5) return d; if (d.length < 7) return d.slice(0, 4) + "-" + d.slice(4); return d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6); };
const bookingBadge = (st, big) => { const M = { "신청": ["pend", "⏳ 예약신청"], "예약": ["conf", "✓ 예약확정"], "출석": ["conf", "✓ 출석"], "거절": ["bad", "거절"], "취소": ["muted", "취소"] }; const x = M[st] || ["muted", st]; return `<span class="bk-badge ${x[0]}${big ? " big" : ""}">${x[1]}</span>`; };
// 회비 기간 색 막대
const feeBar = (payments) => {
  const ps = (payments || []).filter(p => p.period_start && p.period_end).sort((a, b) => a.period_end > b.period_end ? -1 : 1);
  const last = ps[0];
  if (!last) return `<div class="empty" style="padding:14px">회비 납부 기록이 없습니다.</div>`;
  const start = new Date(last.period_start), end = new Date(last.period_end), now = new Date();
  const total = (end - start) || 1, elapsed = Math.min(Math.max(now - start, 0), total);
  const pct = Math.round(elapsed / total * 100);
  const daysLeft = Math.ceil((end - now) / 86400000);
  const cls = daysLeft < 0 ? "bad" : daysLeft <= 7 ? "warn" : "ok";
  const label = daysLeft < 0 ? "만료됨" : `D-${daysLeft}`;
  return `<div class="feebar"><div class="row spread" style="margin-bottom:6px">
    <span class="li-sub">${dDate(start)} ~ ${dDate(end)}</span>
    <span class="pill ${cls}">${label} · ${dDate(end)}까지</span></div>
    <div class="feebar-track"><div class="feebar-fill ${cls}" style="width:${Math.max(4, pct)}%"></div></div></div>`;
};

const NAV = {
  admin: [["dashboard", "공지"], ["members", "회원"], ["schedules", "스케줄"], ["payments", "회비"], ["coaches", "코치"], ["settings", "설정"]],
  coach: [["dashboard", "공지"], ["members", "회원"], ["schedules", "스케줄"], ["payments", "회비"], ["coaches", "코치"]],
  member: [["dashboard", "공지"], ["schedules", "스케줄"], ["myinfo", "내정보"]]
};

const UI = {
  cache: {}, cal: null, payCal: null, _currentView: "dashboard", _lastPend: 0, session: null,
  role() { return this.session ? this.session.role : null; },
  isAdmin() { return this.role() === "admin"; },
  isStaff() { return this.role() === "admin" || this.role() === "coach"; },
  isMember() { return this.role() === "member"; },
  nameView(member) {
    if (!member) return "(삭제)";
    if (this.isStaff()) return esc(member.name);
    if (this.session && member.id === this.session.memberId) return esc(member.name);
    return esc(maskName(member.name));
  },
  nameOfBooking(b, members) {
    if (b.member_id) return this.nameView(members.find(x => x.id === b.member_id));
    const nm = b.booker_name || "(이름없음)";
    return this.isStaff() ? esc(nm) : esc(maskName(nm));
  },

  async init() {
    $("#clubName").textContent = (window.APP_CONFIG || {}).CLUB_NAME || "피클볼 클럽";
    $("#modal").addEventListener("click", e => { if (e.target.id === "modal") UI.closeModal(); });
    try { this.session = JSON.parse(localStorage.getItem("pb_session") || "null"); } catch (e) { this.session = null; }
    if (this.session) await this.enterApp(); else this.showLogin();
  },

  showLogin() {
    this.session = null;
    $("#topbar").style.display = "none";
    $("#tabs").style.display = "none";
    $$(".view").forEach(v => v.classList.remove("active"));
    $("#view-login").classList.add("active");
    this.render_login();
  },
  render_login() {
    const club = (window.APP_CONFIG || {}).CLUB_NAME || "피클볼 클럽";
    $("#view-login").innerHTML = `
      <div class="login-wrap">
        <div class="login-hero"><div class="login-logo">🏓</div><div class="login-club">${esc(club)}</div>
          <div class="login-sub">회원관리 시스템</div></div>
        <div class="login-card">
          <label>아이디</label><input id="lg_id" placeholder="아이디 (회원은 이름)" autocomplete="username" />
          <label>비밀번호</label><input id="lg_pw" type="password" placeholder="비밀번호" autocomplete="current-password" onkeydown="if(event.key==='Enter')UI.loginUser()" />
          <button class="btn login-btn" onclick="UI.loginUser()">로그인</button>
          <div class="login-foot">아직 회원이 아니신가요?
            <a href="javascript:;" onclick="UI.signupFromLogin()">가입 신청하기</a></div>
        </div>
      </div>`;
  },
  async adminCreds() {
    try { const rows = await DB.list("app_config"); if (rows && rows[0]) return rows[0]; } catch (e) {}
    return { admin_id: "김소원", admin_pw: "1234" };
  },
  async loginUser() {
    const id = ($("#lg_id").value || "").trim(), pw = ($("#lg_pw").value || "").trim();
    if (!id || !pw) return UI.toast("아이디와 비밀번호를 입력하세요", true);
    const creds = await this.adminCreds();
    if (id === creds.admin_id && pw === creds.admin_pw) return this.setSession({ role: "admin", name: id });
    const coaches = await DB.list("coaches");
    const c = coaches.find(x => x.login_id && x.login_id === id);
    if (c) {
      if ((c.password || "") !== pw) return UI.toast("비밀번호가 틀립니다", true);
      if ((c.status || "활동") !== "활동") return UI.toast("부관리자 승인 대기 중입니다.", true);
      return this.setSession({ role: "coach", name: c.name, coachId: c.id });
    }
    const members = await DB.list("members");
    const m = members.find(x => (x.login_id && x.login_id === id) || x.name === id);
    if (m) {
      if ((m.password || "") !== pw) return UI.toast("비밀번호가 틀립니다", true);
      if (m.status !== "활동") return UI.toast("가입 승인 대기 중이거나 비활성 상태입니다.", true);
      return this.setSession({ role: "member", name: m.name, memberId: m.id });
    }
    UI.toast("아이디 또는 비밀번호가 틀립니다", true);
  },
  async loginIdTaken(loginId, exMember, exCoach) {
    if (!loginId) return false;
    const creds = await this.adminCreds();
    if (loginId === creds.admin_id) return true;
    const [members, coaches] = await Promise.all([DB.list("members"), DB.list("coaches")]);
    if (members.some(m => (m.login_id === loginId || m.name === loginId) && m.id !== exMember)) return true;
    if (coaches.some(c => c.login_id === loginId && c.id !== exCoach)) return true;
    return false;
  },
  setSession(s) { this.session = s; localStorage.setItem("pb_session", JSON.stringify(s)); this.enterApp(); },
  logout() {
    localStorage.removeItem("pb_session");
    if (this._unsub) { try { this._unsub(); } catch (e) {} this._unsub = null; }
    this.showLogin();
  },
  signupFromLogin() { this.memberForm(); },

  async enterApp() {
    $("#topbar").style.display = "flex";
    $("#tabs").style.display = "flex";
    const roleLabel = this.isAdmin() ? "관리자" : this.role() === "coach" ? "부관리자" : "회원";
    $("#whoami").textContent = `${this.session.name} (${roleLabel})`;
    $("#bell").classList.remove("hidden");
    this.buildNav();
    await this.show("dashboard");
    await this.refreshBell(true);
    if (this._unsub) { try { this._unsub(); } catch (e) {} }
    this._unsub = DB.subscribe(() => UI.onDataChange());
  },
  buildNav() {
    const items = NAV[this.role()] || NAV.member;
    $("#tabs").innerHTML = items.map((it, i) =>
      `<button class="tab ${i === 0 ? "active" : ""}" data-view="${it[0]}" onclick="UI.show('${it[0]}')">${it[1]}</button>`).join("");
  },
  async show(view) {
    const allowed = (NAV[this.role()] || []).map(x => x[0]);
    if (!allowed.includes(view)) view = "dashboard";
    UI._currentView = view;
    $$("#tabs .tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
    $$(".view").forEach(v => v.classList.remove("active"));
    $(`#view-${view}`).classList.add("active");
    try { await UI["render_" + view](); }
    catch (e) { UI.toast("불러오기 오류: " + (e.message || e), true); console.error(e); }
    UI.refreshBell(true);
  },

  async onDataChange() {
    if ($("#modal").classList.contains("hidden")) { try { await UI["render_" + (UI._currentView || "dashboard")](); } catch (e) {} }
    await UI.refreshBell(false);
  },
  async refreshBell(silent) {
    let pend = 0, body = "";
    if (this.isStaff()) {
      let members, bookings, coaches;
      try { [members, bookings, coaches] = await Promise.all([DB.list("members"), DB.list("bookings"), DB.list("coaches")]); } catch (e) { return; }
      const pm = members.filter(m => m.status === "승인대기").length, pb = bookings.filter(b => b.status === "신청").length, pc = coaches.filter(c => (c.status || "활동") === "승인대기").length;
      pend = pm + pb + pc; body = `가입 ${pm} · 예약 ${pb} · 부관리자 ${pc}`;
    } else if (this.isMember()) {
      let notifs; try { notifs = await DB.list("notifications"); } catch (e) { return; }
      const seen = localStorage.getItem("pb_seen_" + this.session.memberId) || "";
      pend = notifs.filter(n => n.member_id === this.session.memberId && (n.created_at || "") > seen).length;
      body = `새 알림 ${pend}건`;
    }
    const el = $("#bellCount");
    if (el) { if (pend > 0) { el.textContent = pend > 99 ? "99+" : pend; el.classList.remove("hidden"); } else el.classList.add("hidden"); }
    if (!silent && pend > (this._lastPend || 0)) {
      UI.toast(`🔔 ${this.isMember() ? "새 알림(예약 확정 등)" : "새 요청"} ${pend - (this._lastPend || 0)}건`);
      UI.notifyAdmin(this.isMember() ? "새 알림" : "새 요청 도착", body);
    }
    this._lastPend = pend;
  },
  notifyAdmin(title, body) { try { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body }); } catch (e) {} },
  bellClick() {
    if ("Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch (e) {} }
    if (this.isMember()) { localStorage.setItem("pb_seen_" + this.session.memberId, new Date().toISOString()); this._lastPend = 0; UI.refreshBell(true); UI.show("dashboard"); }
    else UI.show("members");
  },

  toast(msg, isErr) { const t = $("#toast"); if (!t) return; t.textContent = msg; t.className = "toast" + (isErr ? " err" : ""); setTimeout(() => t.classList.add("hidden"), 2800); },
  openModal(title, html) { $("#modalTitle").textContent = title; $("#modalBody").innerHTML = html; $("#modal").classList.remove("hidden"); },
  closeModal() { $("#modal").classList.add("hidden"); },

  // ==================== 대시보드 = 공지 (+회원 알림·회비) ====================
  async render_dashboard() {
    const notices = await DB.list("notices", { order: "created_at", asc: false });
    const club = (window.APP_CONFIG || {}).CLUB_NAME || "피클볼 클럽";
    const canPost = this.isStaff();
    let myAlerts = "", myFee = "";
    if (this.isMember()) {
      const [payments, notifs] = await Promise.all([DB.list("payments"), DB.list("notifications")]);
      const myPays = payments.filter(p => p.member_id === this.session.memberId);
      const due = myPays.map(p => p.period_end).filter(Boolean).sort().pop();
      const now = new Date();
      let state, cls, label;
      if (!due) { state = "회비 납부 기록이 없습니다. 첫 회비 납부를 진행해 주세요."; cls = "warn"; label = "확인"; }
      else { const days = (new Date(due) - now) / 86400000;
        if (days < 0) { state = `회비가 만료되었습니다 (만료일 ${dDate(due)}). 납부를 부탁드립니다.`; cls = "bad"; label = "미납"; }
        else if (days <= 7) { state = `회비 납부 예정일이 다가옵니다: ${dDate(due)}`; cls = "warn"; label = "임박"; }
        else { state = `회비 정상입니다. 다음 납부 예정일: ${dDate(due)}`; cls = "ok"; label = "정상"; }
      }
      myFee = `<div class="card notice"><div class="row spread"><b class="notice-title">💳 내 회비 안내</b><span class="pill ${cls}">${label}</span></div>
        <div class="notice-body">${esc(state)}</div>${feeBar(myPays)}</div>`;
      const mine = notifs.filter(n => n.member_id === this.session.memberId).sort((a, b) => a.created_at > b.created_at ? -1 : 1).slice(0, 6);
      if (mine.length) myAlerts = `<div class="card notice"><b class="notice-title">📬 내 알림</b>
        ${mine.map(n => `<div class="li-sub" style="margin-top:6px">• ${esc(n.message)} <span class="muted">${dDate(n.created_at)}</span></div>`).join("")}</div>`;
      localStorage.setItem("pb_seen_" + this.session.memberId, new Date().toISOString());
    }
    $("#view-dashboard").innerHTML = `
      <div class="hero"><div class="hero-inner">
        <div class="hero-title">🏓 ${esc(club)}</div>
        <div class="hero-sub">공지사항</div></div></div>
      ${myAlerts}${myFee}
      <div class="row spread"><h2>📢 공지사항</h2>
        ${canPost ? `<button class="btn" onclick="UI.noticeForm()">+ 공지 작성</button>` : ""}</div>
      ${notices.length ? notices.map(n => `
        <div class="card notice">
          <div class="row spread"><b class="notice-title">${esc(n.title)}</b><span class="li-sub">${dDate(n.created_at)}</span></div>
          <div class="notice-body">${esc(n.content).replace(/\n/g, "<br>")}</div>
          ${canPost ? `<div class="row" style="justify-content:flex-end;margin-top:8px">
            <button class="btn ghost sm" onclick='UI.noticeForm(${JSON.stringify(n).replace(/'/g, "\\'")})'>수정</button>
            <button class="btn ghost sm" onclick="UI.deleteNotice('${n.id}')">삭제</button></div>` : ""}
        </div>`).join("") : `<div class="empty">등록된 공지가 없습니다.</div>`}`;
  },
  noticeForm(n = {}) {
    this.openModal(n.id ? "공지 수정" : "공지 작성", `
      <label>제목 *</label><input id="n_title" value="${esc(n.title || "")}" />
      <label>내용</label><textarea id="n_content" rows="6">${esc(n.content || "")}</textarea>
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        <button class="btn ghost" onclick="UI.closeModal()">취소</button>
        <button class="btn" onclick="UI.saveNotice('${n.id || ""}')">저장</button></div>`);
  },
  async saveNotice(id) {
    const row = { title: $("#n_title").value.trim(), content: $("#n_content").value.trim() };
    if (!row.title) return UI.toast("제목을 입력하세요", true);
    try { if (id) await DB.update("notices", id, row); else await DB.insert("notices", row);
      UI.closeModal(); UI.toast("저장됨"); UI.render_dashboard();
    } catch (e) { UI.toast("저장 실패: " + e.message, true); }
  },
  async deleteNotice(id) { if (!confirm("이 공지를 삭제할까요?")) return; await DB.remove("notices", id); UI.render_dashboard(); },

  // ==================== 회원 (관리자·부관리자) ====================
  async render_members() {
    if (!this.isStaff()) return this.show("dashboard");
    const members = await DB.list("members");
    this.cache.members = members;
    const pending = members.filter(m => m.status === "승인대기");
    const others = members.filter(m => m.status !== "승인대기" && m.status !== "거절");
    this.cache.memberList = others;
    $("#view-members").innerHTML = `
      <div class="row spread"><h2>회원</h2><button class="btn" onclick="UI.memberForm()">+ 회원 추가</button></div>
      ${pending.length ? `<div class="pending-card">
        <div class="section-head warn"><span>⏳ 가입 승인 대기</span><span class="cnt">${pending.length}</span></div>
        ${pending.map(m => `<div class="approve-item">
          <div class="ai-info" onclick="UI.openMember('${m.id}')">
            <div class="li-main">${esc(m.name)} <span class="muted">${esc(m.gender || "")}</span></div>
            <div class="li-sub">${esc(m.phone || "-")} · 생년월일 ${esc(m.birth_date || "-")} · 추천인 ${esc(m.referrer || "-")}</div></div>
          <div class="ai-actions"><button class="btn sm" onclick="UI.approveMember('${m.id}')">승인</button>
            <button class="btn ghost sm" onclick="UI.rejectMember('${m.id}')">거절</button></div>
        </div>`).join("")}</div>` : ""}
      <div class="section-head" style="margin-top:16px"><span>👥 회원 목록</span><span class="cnt">${others.length}</span></div>
      <input class="search" id="memSearch" placeholder="이름·연락처 검색" oninput="UI.filterMembers(this.value)" />
      <div id="memList" style="margin-top:10px"></div>`;
    this.filterMembers("");
  },
  filterMembers(q) {
    q = (q || "").trim();
    const list = (this.cache.memberList || []).filter(m => !q || (m.name || "").includes(q) || (m.phone || "").includes(q));
    $("#memList").innerHTML = list.length ? list.map(m => `
      <div class="list-item" onclick="UI.openMember('${m.id}')">
        <div><div class="li-main">${esc(m.name)} <span class="pill ${m.status === "활동" ? "ok" : "warn"}">${esc(m.status)}</span></div>
          <div class="li-sub">${esc(m.phone || "-")} · ${esc(m.gender || "")} · 추천인 ${esc(m.referrer || "-")}</div></div>
        <span class="muted">›</span></div>`).join("") : `<div class="empty">회원이 없습니다.</div>`;
  },
  memberForm(m = {}) {
    const f = (k) => esc(m[k] || "");
    const editing = !!m.id;
    const fromLogin = !this.session;
    const g = m.gender || "";
    this.openModal(editing ? "회원 정보 수정" : "가입 신청", `
      <label>이름 * <span class="muted">(로그인 아이디로 사용됩니다)</span></label><input id="m_name" value="${f("name")}" />
      <label>성별</label><select id="m_gender">
        <option value="" ${!g ? "selected" : ""}>선택</option>
        <option value="남" ${g === "남" ? "selected" : ""}>남</option>
        <option value="여" ${g === "여" ? "selected" : ""}>여</option></select>
      <label>전화번호 *</label><input id="m_phone" value="${f("phone")}" placeholder="010-0000-0000" inputmode="numeric" oninput="this.value=fmtPhone(this.value)" />
      <label>생년월일</label><input id="m_birth" value="${f("birth_date")}" placeholder="예: 19810403" inputmode="numeric" oninput="this.value=fmtBirth(this.value)" />
      <label>추천인</label><input id="m_referrer" value="${f("referrer")}" placeholder="소개해 주신 분" />
      ${editing
        ? `<div class="row" style="margin-top:8px"><button class="btn ghost sm" onclick="UI.resetMemberPw('${m.id}')">비밀번호 1234로 초기화</button></div>
           <label>상태</label><select id="m_status">${["승인대기", "활동", "휴면", "탈퇴"].map(o => `<option ${m.status === o ? "selected" : ""}>${o}</option>`).join("")}</select>`
        : `<label>비밀번호 *</label><input id="m_pw" type="password" placeholder="로그인 비밀번호" autocomplete="new-password" />
           <div class="banner" style="margin-top:12px">신청하면 <b>승인 대기</b> 상태로 등록되고, 관리자 승인 후 <b>이름 + 비밀번호</b>로 로그인할 수 있어요.</div>`}
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        ${editing ? `<button class="btn danger" onclick="UI.deleteMember('${m.id}')">삭제</button>` : ""}
        <button class="btn ghost" onclick="UI.closeModal()">취소</button>
        <button class="btn" onclick="UI.saveMember('${m.id || ""}', ${fromLogin})">${editing ? "저장" : "가입 신청"}</button>
      </div>`);
  },
  async saveMember(id, fromLogin) {
    const b = ($("#m_birth").value || "").trim();
    const name = $("#m_name").value.trim();
    const row = {
      name, gender: ($("#m_gender") || {}).value || null,
      phone: $("#m_phone").value.trim(), birth_date: /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : null,
      referrer: $("#m_referrer").value.trim(), login_id: name
    };
    if (!row.name || !row.phone) return UI.toast("이름과 전화번호는 필수입니다", true);
    try {
      if (id) {
        row.status = $("#m_status").value;
        if (await this.loginIdTaken(row.login_id, id, null)) return UI.toast("이미 같은 이름(아이디)이 있습니다", true);
        await DB.update("members", id, row); UI.closeModal(); UI.toast("저장됨"); UI.render_members();
      } else {
        const pw = ($("#m_pw").value || "").trim();
        if (!pw) return UI.toast("비밀번호를 입력하세요", true);
        if (await this.loginIdTaken(row.login_id, null, null)) return UI.toast("이미 같은 이름이 있습니다. 다른 이름으로 신청하거나 관리자에게 문의하세요.", true);
        row.password = pw; row.status = "승인대기";
        await DB.insert("members", row); UI.closeModal();
        if (fromLogin) UI.toast("가입 신청 완료! 관리자 승인 후 로그인하세요.");
        else { UI.toast("가입 신청 완료 (승인 대기)"); if (this.isStaff()) UI.render_members(); }
      }
    } catch (e) { UI.toast("저장 실패: " + e.message, true); }
  },
  async resetMemberPw(id) {
    if (!confirm("이 회원의 비밀번호를 1234로 초기화할까요?")) return;
    await DB.update("members", id, { password: "1234" }); UI.toast("비밀번호가 1234로 초기화되었습니다");
  },
  async approveMember(id) {
    await DB.update("members", id, { status: "활동", join_date: new Date().toISOString().slice(0, 10) });
    UI.toast("승인되었습니다"); UI.closeModal(); UI.show("members");
  },
  async rejectMember(id) {
    if (!confirm("이 가입 신청을 거절할까요?")) return;
    await DB.update("members", id, { status: "거절" }); UI.toast("거절되었습니다"); UI.closeModal(); UI.show("members");
  },
  async deleteMember(id) {
    if (!confirm("이 회원을 삭제할까요? 예약·회비 기록도 함께 삭제됩니다.")) return;
    await DB.remove("members", id); UI.closeModal(); UI.toast("삭제됨"); UI.render_members();
  },
  async openMember(id) {
    const [members, payments, bookings, schedules] = await Promise.all([DB.list("members"), DB.list("payments"), DB.list("bookings"), DB.list("schedules")]);
    const m = members.find(x => x.id === id); if (!m) return;
    const myPays = payments.filter(p => p.member_id === id).sort((a, b) => b.paid_date > a.paid_date ? 1 : -1);
    const myBooks = bookings.filter(b => b.member_id === id);
    const nextDue = myPays.map(p => p.period_end).filter(Boolean).sort().pop();
    this.openModal(m.name, `
      <div class="row spread">
        <div class="li-sub">${esc(m.gender || "")} · ${esc(m.phone || "-")} · 생년월일 ${esc(m.birth_date || "-")}<br>로그인 아이디 ${esc(m.login_id || m.name)} · 추천인 ${esc(m.referrer || "-")}
          <span class="pill ${m.status === "활동" ? "ok" : "warn"}">${esc(m.status)}</span></div>
        <button class="btn ghost sm" onclick='UI.memberForm(${JSON.stringify(m).replace(/'/g, "\\'")})'>수정</button>
      </div>
      <div class="row" style="margin-top:8px">
        ${m.status === "승인대기" ? `<button class="btn" onclick="UI.approveMember('${id}')">가입 승인</button>
          <button class="btn ghost" onclick="UI.rejectMember('${id}')">거절</button>` : ""}
        <button class="btn ghost sm" onclick="UI.resetMemberPw('${id}')">비번 초기화(1234)</button>
      </div>
      <div class="card" style="margin-top:12px">
        <b>회비</b> <span class="muted">· 다음 기준일: ${nextDue ? dDate(nextDue) : "기록 없음"}</span>
        ${feeBar(myPays)}
        ${myPays.length ? myPays.map(p => `<div class="li-sub">• ${dDate(p.paid_date)} ${won(p.amount)} (${dDate(p.period_start)}~${dDate(p.period_end)})</div>`).join("") : ""}
        <button class="btn sm" style="margin-top:8px" onclick="UI.paymentForm('${id}')">+ 회비 입금 기록</button>
      </div>
      <div class="card"><b>예약 내역</b>
        ${myBooks.length ? myBooks.map(b => { const s = schedules.find(x => x.id === b.schedule_id); return `<div class="li-sub">• ${s ? esc(s.title) + " " + dDateTime(s.start_at) : "(삭제됨)"} — ${esc(b.status)}</div>`; }).join("") : `<div class="empty">예약 내역 없음</div>`}
      </div>`);
  },

  // ==================== 스케줄 ====================
  async render_schedules() {
    const [schedules, coaches, bookings] = await Promise.all([
      DB.list("schedules", { order: "start_at", asc: true }), DB.list("coaches"), DB.list("bookings")]);
    this.cache.coaches = coaches; this.cache.schedules = schedules; this.cache.bookings = bookings;
    const now = new Date();
    if (!this.cal) this.cal = { y: now.getFullYear(), m: now.getMonth(), sel: localDay(now) };
    this.drawCalendar();
  },
  calMove(delta) { let { y, m } = this.cal; m += delta; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } this.cal.y = y; this.cal.m = m; this.drawCalendar(); },
  async openDay(dayKey) {
    const [schedules, bookings, members, coaches] = await Promise.all([DB.list("schedules"), DB.list("bookings"), DB.list("members"), DB.list("coaches")]);
    this.cache.schedules = schedules; this.cache.bookings = bookings; this.cache.coaches = coaches;
    this.cal.sel = dayKey; this.drawCalendar();
    const active = members.filter(m => m.status === "활동");
    const daySch = schedules.filter(s => localDay(s.start_at) === dayKey);
    const byHour = {}; daySch.forEach(s => { const h = new Date(s.start_at).getHours(); (byHour[h] = byHour[h] || []).push(s); });
    const [yy, mm, dd] = dayKey.split("-").map(Number);
    const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(yy, mm - 1, dd).getDay()];
    const staff = this.isStaff();
    const myId = this.isMember() ? this.session.memberId : null;
    let rows = "";
    for (let h = SLOT_START; h < SLOT_END; h++) {
      const schs = byHour[h] || [];
      let inner = !schs.length ? `<span class="muted">비어 있음</span>` : schs.map(s => {
        const bs = bookings.filter(b => b.schedule_id === s.id);
        const booked = bs.filter(b => ACTIVE_BOOK.includes(b.status));
        const reqs = bs.filter(b => b.status === "신청");
        const full = booked.length >= (s.capacity || 99);
        return `<div class="slot-sch">
          <div class="row spread"><b>${esc(s.title)}</b> <span class="pill ${full ? "bad" : "ok"}">${booked.length}/${s.capacity || "-"}</span></div>
          ${booked.length ? `<div class="bk-box confirmed">${bookingBadge("예약", true)} <span class="bk-names">${booked.map(b => this.nameOfBooking(b, members)).join(", ")}</span></div>` : ""}
          ${reqs.map(b => `<div class="bk-box pending"><div class="row spread"><span>${bookingBadge("신청", true)} <b>${this.nameOfBooking(b, members)}</b></span>
            ${staff ? `<span class="row"><button class="btn sm" onclick="UI.slotApprove('${b.id}','${dayKey}')">승인</button>
            <button class="btn ghost sm" onclick="UI.slotReject('${b.id}','${dayKey}')">거절</button></span>` : ""}</div></div>`).join("")}
        </div>`;
      }).join("");
      let action;
      if (staff) action = `<button class="btn ghost sm slot-add" onclick="UI.requestSlot('${dayKey}',${h})">신청추가</button>`;
      else {
        const mine = schs.flatMap(s => bookings.filter(b => b.schedule_id === s.id && b.member_id === myId && ["신청", "예약", "출석"].includes(b.status)));
        action = mine.length ? bookingBadge(mine[0].status, true) : `<button class="btn sm slot-add" onclick="UI.requestSlot('${dayKey}',${h})">예약하기</button>`;
      }
      const rHasPend = schs.some(s => bookings.some(b => b.schedule_id === s.id && b.status === "신청"));
      const rHasConf = schs.some(s => bookings.some(b => b.schedule_id === s.id && ACTIVE_BOOK.includes(b.status)));
      const rowCls = rHasPend ? " row-pend" : rHasConf ? " row-conf" : "";
      rows += `<div class="slot-row${rowCls}"><div class="slot-time">${String(h).padStart(2, "0")}:00</div>
        <div class="slot-body">${inner}</div><div class="slot-act">${action}</div></div>`;
    }
    const memberPicker = staff
      ? `<label>신청할 회원</label><select id="slotMember"><option value="__self__">나 (${esc(this.session.name)})</option>${active.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select>`
      : `<div class="banner">원하는 시간의 <b>예약하기</b>를 누르면 신청됩니다. <b>${bookingBadge("신청")}</b> → 관리자 승인 → <b>${bookingBadge("예약")}</b> (확정되면 알림이 와요)</div>`;
    this.openModal(`${mm}월 ${dd}일 (${wd}) 시간표`, `${memberPicker}<div class="slot-list">${rows}</div>`);
  },
  async requestSlot(dayKey, hour) {
    const sel = this.isStaff() ? (($("#slotMember") || {}).value) : this.session.memberId;
    if (!sel) return UI.toast("회원을 선택하세요", true);
    const isSelf = sel === "__self__";
    let schedules = await DB.list("schedules");
    let s = schedules.find(x => localDay(x.start_at) === dayKey && new Date(x.start_at).getHours() === hour);
    if (!s) {
      const start = new Date(`${dayKey}T${String(hour).padStart(2, "0")}:00:00`);
      const end = new Date(start); end.setHours(hour + 1);
      s = await DB.insert("schedules", { title: "타임 예약", start_at: start.toISOString(), end_at: end.toISOString(), capacity: SLOT_CAP, level: null, location: null, coach_id: null });
    }
    const bookings = await DB.list("bookings");
    if (isSelf) {
      if (bookings.some(b => b.schedule_id === s.id && !b.member_id && b.booker_name === this.session.name && ["신청", "예약", "출석"].includes(b.status))) return UI.toast("이미 예약한 시간입니다", true);
      await DB.insert("bookings", { schedule_id: s.id, member_id: null, booker_name: this.session.name, status: "예약" });
      UI.toast("본인 예약이 등록되었습니다 (확정)");
    } else {
      if (bookings.some(b => b.schedule_id === s.id && b.member_id === sel && ["신청", "예약", "출석"].includes(b.status))) return UI.toast("이미 신청/예약된 시간입니다", true);
      await DB.insert("bookings", { schedule_id: s.id, member_id: sel, status: "신청" });
      UI.toast("예약 신청 완료 (관리자 승인 후 확정)");
    }
    UI.openDay(dayKey);
  },
  async slotApprove(bookingId, dayKey) {
    const bk = (await DB.list("bookings")).find(b => b.id === bookingId);
    await DB.update("bookings", bookingId, { status: "예약" });
    if (bk && bk.member_id) {
      const s = (await DB.list("schedules")).find(x => x.id === bk.schedule_id);
      try { await DB.insert("notifications", { member_id: bk.member_id, schedule_id: bk.schedule_id, channel: "app", message: `예약이 확정되었습니다: ${s ? s.title + " " + dDateTime(s.start_at) : ""}`, status: "sent", sent_at: new Date().toISOString() }); } catch (e) {}
    }
    UI.toast("예약 확정됨 (회원에게 알림 전송)"); UI.openDay(dayKey);
  },
  async slotReject(bookingId, dayKey) { await DB.update("bookings", bookingId, { status: "거절" }); UI.toast("신청 거절됨"); UI.openDay(dayKey); },
  drawCalendar() {
    const { y, m, sel } = this.cal;
    const schedules = this.cache.schedules || [], bookings = this.cache.bookings || [], coaches = this.cache.coaches || [];
    const cnt = id => bookings.filter(b => b.schedule_id === id && ACTIVE_BOOK.includes(b.status)).length;
    const byDay = {}; schedules.forEach(s => { const k = localDay(s.start_at); (byDay[k] = byDay[k] || []).push(s); });
    Object.values(byDay).forEach(arr => arr.sort((a, b) => a.start_at > b.start_at ? 1 : -1));
    const first = new Date(y, m, 1); const startWd = first.getDay(); const days = new Date(y, m + 1, 0).getDate();
    const todayKey = localDay(new Date()); const wd = ["일", "월", "화", "수", "목", "금", "토"];
    let cells = "";
    for (let i = 0; i < startWd; i++) cells += `<div class="cal-cell empty-cell"></div>`;
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const items = byDay[key] || [];
      const dayBk = bookings.filter(b => items.some(s => s.id === b.schedule_id));
      const hasConf = dayBk.some(b => ACTIVE_BOOK.includes(b.status));
      const hasPend = dayBk.some(b => b.status === "신청");
      let marks = "";
      if (hasConf) marks += `<span class="cmark ok" title="예약확정"></span>`;
      if (hasPend) marks += `<span class="cmark pend" title="예약신청"></span>`;
      if (!hasConf && !hasPend && items.length) marks += `<span class="cmark plain"></span>`;
      cells += `<div class="cal-cell${key === sel ? " sel" : ""}${key === todayKey ? " today" : ""}" onclick="UI.openDay('${key}')">
        <span class="cal-num">${d}</span>${marks ? `<span class="cal-dots">${marks}</span>` : ""}</div>`;
    }
    const selItems = byDay[sel] || []; const [sy, sm, sd] = sel.split("-").map(Number);
    const selLabel = `${sy}년 ${sm}월 ${sd}일 (${wd[new Date(sy, sm - 1, sd).getDay()]})`;
    const staff = this.isStaff();
    $("#view-schedules").innerHTML = `
      <div class="row spread"><h2>스케줄</h2></div>
      <div class="cal-head"><button class="icon-btn" onclick="UI.calMove(-1)">‹</button><b>${y}년 ${m + 1}월</b><button class="icon-btn" onclick="UI.calMove(1)">›</button></div>
      <div class="cal-grid cal-wd">${wd.map((w, i) => `<div class="cal-wdcell${i === 0 ? " sun" : i === 6 ? " sat" : ""}">${w}</div>`).join("")}</div>
      <div class="cal-grid">${cells}</div>
      <div class="card" style="margin-top:14px">
        <div class="row spread"><b>${selLabel}</b><button class="btn sm" onclick="UI.openDay('${sel}')">시간표 / 예약</button></div>
        ${selItems.length ? selItems.map(s => {
          const coach = coaches.find(c => c.id === s.coach_id);
          return `<div class="list-item" onclick="UI.openDay('${sel}')">
            <div><div class="li-main">${dTime(s.start_at)} ${esc(s.title)} <span class="pill">${esc(s.level || "")}</span></div>
            <div class="li-sub">${esc(s.location || "-")} · ${coach ? esc(coach.name) : "코치 미정"}</div></div>
            <span class="pill ${cnt(s.id) >= (s.capacity || 99) ? "bad" : "ok"}">${cnt(s.id)}/${s.capacity || "-"}</span></div>`;
        }).join("") : `<div class="empty">이 날 등록된 스케줄이 없습니다. 날짜를 눌러 시간표에서 ${staff ? "예약을 받으세요." : "예약하세요."}</div>`}
        ${staff ? `<button class="btn ghost sm" style="margin-top:8px" onclick="UI.scheduleForm(null,'${sel}')">+ 수업/일정 직접 추가</button>` : ""}
      </div>`;
  },
  scheduleForm(s, presetDay) {
    s = s || {}; const coaches = this.cache.coaches || [];
    const f = (k, d = "") => esc(s[k] != null ? s[k] : d);
    let startVal = toInput(s.start_at); if (!startVal && presetDay) startVal = presetDay + "T19:00";
    this.openModal(s.id ? "스케줄 수정" : "새 스케줄", `
      <label>제목 *</label><input id="s_title" value="${f("title")}" placeholder="예: 저녁 초급반" />
      <div class="grid2"><div><label>시작 *</label><input type="datetime-local" id="s_start" value="${startVal}" /></div>
        <div><label>종료</label><input type="datetime-local" id="s_end" value="${toInput(s.end_at)}" /></div></div>
      <div class="grid2"><div><label>장소</label><input id="s_loc" value="${f("location")}" /></div>
        <div><label>정원</label><input type="number" id="s_cap" value="${f("capacity", 8)}" /></div></div>
      <div class="grid2"><div><label>난이도</label><select id="s_level">${["", "초급", "중급", "고급"].map(o => `<option ${s.level === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>
        <div><label>담당 코치</label><select id="s_coach"><option value="">미정</option>${coaches.map(c => `<option value="${c.id}" ${s.coach_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div></div>
      <label>메모</label><textarea id="s_notes" rows="2">${f("notes")}</textarea>
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        ${s.id ? `<button class="btn danger" onclick="UI.deleteSchedule('${s.id}')">삭제</button>` : ""}
        <button class="btn ghost" onclick="UI.closeModal()">취소</button>
        <button class="btn" onclick="UI.saveSchedule('${s.id || ""}')">저장</button></div>`);
  },
  async saveSchedule(id) {
    const row = { title: $("#s_title").value.trim(), start_at: $("#s_start").value ? new Date($("#s_start").value).toISOString() : null,
      end_at: $("#s_end").value ? new Date($("#s_end").value).toISOString() : null, location: $("#s_loc").value.trim(),
      capacity: Number($("#s_cap").value) || null, level: $("#s_level").value || null, coach_id: $("#s_coach").value || null, notes: $("#s_notes").value.trim() };
    if (!row.title || !row.start_at) return UI.toast("제목과 시작 시각은 필수입니다", true);
    try { if (id) await DB.update("schedules", id, row); else await DB.insert("schedules", row);
      if (!id) this.cal.sel = localDay(row.start_at);
      UI.closeModal(); UI.toast("저장됨"); UI.render_schedules();
    } catch (e) { UI.toast("저장 실패: " + e.message, true); }
  },
  async deleteSchedule(id) {
    if (!confirm("이 스케줄을 삭제할까요? 예약도 함께 삭제됩니다.")) return;
    await DB.remove("schedules", id); UI.closeModal(); UI.toast("삭제됨"); UI.render_schedules();
  },

  // ==================== 회비 (관리자·부관리자) ====================
  async render_payments() {
    if (!this.isStaff()) return this.show("dashboard");
    const [members, payments] = await Promise.all([DB.list("members"), DB.list("payments")]);
    this.cache.members = members; this.cache.payments = payments;
    const now = new Date();
    if (!this.payCal) this.payCal = { y: now.getFullYear(), m: now.getMonth(), sel: localDay(now) };
    this.drawFeeCalendar();
  },
  feeDueMap() { const map = {}; (this.cache.payments || []).forEach(p => { if (!p.period_end) return; if (!map[p.member_id] || p.period_end > map[p.member_id]) map[p.member_id] = p.period_end; }); return map; },
  feeCalMove(delta) { let { y, m } = this.payCal; m += delta; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } this.payCal.y = y; this.payCal.m = m; this.drawFeeCalendar(); },
  drawFeeCalendar() {
    const { y, m, sel } = this.payCal;
    const members = this.cache.members || [], payments = this.cache.payments || [];
    const billable = members.filter(mm => mm.status === "활동" || mm.status === "휴면");
    const dueMap = this.feeDueMap();
    const paidByDay = {}; payments.forEach(p => { if (p.paid_date) paidByDay[p.paid_date] = (paidByDay[p.paid_date] || 0) + 1; });
    const dueByDay = {}; billable.forEach(mm => { const d = dueMap[mm.id]; if (d) dueByDay[d] = (dueByDay[d] || 0) + 1; });
    const noRecord = billable.filter(mm => !dueMap[mm.id]);
    const first = new Date(y, m, 1); const startWd = first.getDay(); const days = new Date(y, m + 1, 0).getDate();
    const todayKey = localDay(new Date()); const wd = ["일", "월", "화", "수", "목", "금", "토"];
    let cells = "";
    for (let i = 0; i < startWd; i++) cells += `<div class="cal-cell empty-cell"></div>`;
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const paid = paidByDay[key] || 0, due = dueByDay[key] || 0;
      let marks = ""; if (paid) marks += `<span class="fee-mk paid">입${paid}</span>`; if (due) marks += `<span class="fee-mk due">미${due}</span>`;
      cells += `<div class="cal-cell${key === sel ? " sel" : ""}${key === todayKey ? " today" : ""}" onclick="UI.openFeeDay('${key}')">
        <span class="cal-num">${d}</span>${marks ? `<span class="fee-marks">${marks}</span>` : ""}</div>`;
    }
    $("#view-payments").innerHTML = `
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
    const paidList = payments.filter(p => p.paid_date === dayKey);
    const dueList = billable.filter(mm => dueMap[mm.id] === dayKey);
    const nm = id => { const mm = members.find(x => x.id === id); return mm ? esc(mm.name) : "(삭제)"; };
    const [yy, mm2, dd] = dayKey.split("-").map(Number);
    const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(yy, mm2 - 1, dd).getDay()];
    this.openModal(`${mm2}월 ${dd}일 (${wd}) 회비`, `
      <div class="fee-box paid-box"><div class="fee-box-h">💰 입금인 (${paidList.length})</div>
        ${paidList.length ? paidList.map(p => `<div class="row spread fee-item"><span>${nm(p.member_id)} <span class="muted">${won(p.amount)} · ${p.months || 1}개월</span></span><span class="li-sub">~${dDate(p.period_end)}</span></div>`).join("") : `<div class="empty">이 날 입금한 회원이 없습니다.</div>`}</div>
      <div class="fee-box due-box"><div class="fee-box-h">⏰ 미입금인 · 입금 예정 (${dueList.length})</div>
        ${dueList.length ? dueList.map(mm => `<div class="row spread fee-item"><span>${esc(mm.name)} <span class="muted">${esc(mm.phone || "")}</span></span><button class="btn sm" onclick="UI.paymentForm('${mm.id}','${dayKey}')">입금 처리</button></div>`).join("") : `<div class="empty">이 날 입금 예정인 회원이 없습니다.</div>`}</div>`);
  },
  paymentForm(memberId, dueDay) {
    const today = new Date().toISOString().slice(0, 10); const paid = dueDay || today;
    this.openModal("회비 입금 처리", `
      <div class="grid2"><div><label>입금일</label><input type="date" id="p_paid" value="${paid}" oninput="UI.recalcFee()" /></div>
        <div><label>개월 수</label><select id="p_months" onchange="UI.recalcFee()">${Array.from({ length: 12 }, (_, i) => i + 1).map(n => `<option value="${n}">${n}개월</option>`).join("")}</select></div></div>
      <label>금액(원)</label><input type="number" id="p_amount" value="${MONTHLY_FEE}" />
      <label>납부 방법</label><select id="p_method">${["계좌이체", "현금", "카드"].map(o => `<option>${o}</option>`).join("")}</select>
      <div class="banner" id="p_due" style="margin-top:10px"></div>
      <label>메모</label><input id="p_notes" /><input type="hidden" id="p_return" value="${dueDay || ""}" />
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" onclick="UI.closeModal()">취소</button>
        <button class="btn" onclick="UI.savePayment('${memberId}')">저장</button></div>`);
    this.recalcFee();
  },
  recalcFee() {
    const months = Number(($("#p_months") || {}).value || 1);
    const paid = ($("#p_paid") || {}).value || new Date().toISOString().slice(0, 10);
    const amt = $("#p_amount"); if (amt) amt.value = months * MONTHLY_FEE;
    const due = $("#p_due"); if (due && paid) due.innerHTML = `적용 기간: ${dDate(paid)} ~ <b>${dDate(addMonths(paid, months))}</b> · 다음 입금 예정일 <b>${dDate(addMonths(paid, months))}</b>`;
  },
  async savePayment(memberId) {
    const paid = $("#p_paid").value; const months = Number($("#p_months").value || 1);
    if (!paid) return UI.toast("입금일을 선택하세요", true);
    const row = { member_id: memberId, amount: Number($("#p_amount").value) || 0, paid_date: paid, period_start: paid, period_end: addMonths(paid, months), months, method: $("#p_method").value, status: "완납", notes: $("#p_notes").value.trim() };
    const ret = ($("#p_return") || {}).value || "";
    try {
      await DB.insert("payments", row);
      try { await DB.insert("notifications", { member_id: memberId, channel: "app", message: `회비가 등록되었습니다: ${won(row.amount)} (${dDate(row.period_start)}~${dDate(row.period_end)})`, status: "sent", sent_at: new Date().toISOString() }); } catch (e) {}
      this.cache.payments = await DB.list("payments");
      UI.closeModal(); UI.toast("회비 입금 처리됨"); if (ret) UI.openFeeDay(ret); else UI.render_payments();
    } catch (e) { UI.toast("저장 실패: " + e.message, true); }
  },

  // ==================== 코치 = 부관리자 ====================
  async render_coaches() {
    if (!this.isStaff()) return this.show("dashboard");
    const coaches = await DB.list("coaches");
    const pending = coaches.filter(c => (c.status || "활동") === "승인대기");
    const active = coaches.filter(c => (c.status || "활동") !== "승인대기");
    $("#view-coaches").innerHTML = `
      <div class="row spread"><h2>코칭 스탭 · 부관리자 (${coaches.length})</h2>
        <button class="btn" onclick="UI.coachForm()">+ 추가</button></div>
      <div class="banner">부관리자는 <b>아이디+비밀번호</b>로 로그인하고, 관리자 <b>승인(활동)</b> 후 관리자와 거의 같은 화면(설정 제외) + <b>스케줄 예약 승인</b> 권한을 가져요.</div>
      ${pending.length ? `<div class="card" style="border-color:var(--warn)"><b>⏳ 부관리자 승인 대기 (${pending.length})</b>
        ${pending.map(c => `<div class="row spread" style="padding:8px 0;border-top:1px solid var(--line)">
          <div onclick='UI.coachForm(${JSON.stringify(c).replace(/'/g, "\\'")})' style="cursor:pointer">
            <div class="li-main">${esc(c.name)} <span class="muted">@${esc(c.login_id || "")}</span></div>
            <div class="li-sub">${esc(c.phone || "-")} · ${esc(c.role || "")}</div></div>
          <button class="btn sm" onclick="UI.approveCoach('${c.id}')">승인</button></div>`).join("")}</div>` : ""}
      ${active.length ? active.map(c => `<div class="list-item" onclick='UI.coachForm(${JSON.stringify(c).replace(/'/g, "\\'")})'>
        <div><div class="li-main">${esc(c.name)} <span class="pill ok">${esc(c.role || "")}</span></div>
        <div class="li-sub">@${esc(c.login_id || "-")} · ${esc(c.phone || "-")}</div></div><span class="muted">›</span></div>`).join("") : ""}
      ${!coaches.length ? `<div class="empty">등록된 코치가 없습니다.</div>` : ""}`;
  },
  coachForm(c = {}) {
    const f = (k) => esc(c[k] || "");
    const editing = !!c.id;
    this.openModal(editing ? "부관리자 정보" : "부관리자(코치) 추가", `
      <label>이름 *</label><input id="c_name" value="${f("name")}" />
      <label>연락처</label><input id="c_phone" value="${f("phone")}" placeholder="010-0000-0000" inputmode="numeric" oninput="this.value=fmtPhone(this.value)" />
      <label>역할</label><select id="c_role">${["코치", "매니저", "스탭"].map(o => `<option ${c.role === o ? "selected" : ""}>${o}</option>`).join("")}</select>
      <label>아이디 *</label><input id="c_loginid" value="${f("login_id")}" placeholder="로그인 아이디" autocomplete="off" />
      ${editing
        ? `<div class="row" style="margin-top:8px"><button class="btn ghost sm" onclick="UI.resetCoachPw('${c.id}')">비밀번호 1234로 초기화</button></div>
           <label>상태</label><select id="c_status">${["승인대기", "활동"].map(o => `<option ${(c.status || "활동") === o ? "selected" : ""}>${o}</option>`).join("")}</select>`
        : `<label>비밀번호 *</label><input id="c_pw" type="password" placeholder="로그인 비밀번호" autocomplete="new-password" />`}
      <label>주소</label><input id="c_addr" value="${f("address")}" />
      <label>전문 분야</label><input id="c_spec" value="${f("specialty")}" />
      <label>메모</label><textarea id="c_notes" rows="2">${f("notes")}</textarea>
      <div class="banner" style="margin-top:10px">부관리자는 <b>아이디 + 비밀번호</b>로 로그인하며, <b>승인(활동)</b> 후 예약 승인 등 관리 권한을 가져요.</div>
      <div class="row" style="margin-top:14px;justify-content:flex-end">
        ${editing ? `<button class="btn danger" onclick="UI.deleteCoach('${c.id}')">삭제</button>` : ""}
        <button class="btn ghost" onclick="UI.closeModal()">취소</button>
        <button class="btn" onclick="UI.saveCoach('${c.id || ""}')">저장</button></div>`);
  },
  async saveCoach(id) {
    const row = { name: $("#c_name").value.trim(), phone: $("#c_phone").value.trim(), role: $("#c_role").value, login_id: ($("#c_loginid").value || "").trim(), address: $("#c_addr").value.trim(), specialty: $("#c_spec").value.trim(), notes: $("#c_notes").value.trim() };
    if (!row.name) return UI.toast("이름을 입력하세요", true);
    if (!row.login_id) return UI.toast("아이디를 입력하세요", true);
    try {
      if (id) {
        row.status = $("#c_status").value;
        if (await this.loginIdTaken(row.login_id, null, id)) return UI.toast("이미 사용 중인 아이디입니다", true);
        await DB.update("coaches", id, row);
      } else {
        const pw = ($("#c_pw").value || "").trim();
        if (!pw) return UI.toast("비밀번호를 입력하세요", true);
        if (await this.loginIdTaken(row.login_id, null, null)) return UI.toast("이미 사용 중인 아이디입니다", true);
        row.password = pw; row.status = "승인대기";
        await DB.insert("coaches", row);
      }
      UI.closeModal(); UI.toast("저장됨"); UI.render_coaches();
    } catch (e) { UI.toast("저장 실패: " + e.message, true); }
  },
  async resetCoachPw(id) {
    if (!confirm("이 부관리자의 비밀번호를 1234로 초기화할까요?")) return;
    await DB.update("coaches", id, { password: "1234" }); UI.toast("비밀번호가 1234로 초기화되었습니다");
  },
  async approveCoach(id) { await DB.update("coaches", id, { status: "활동" }); UI.toast("부관리자 승인됨"); UI.render_coaches(); },
  async deleteCoach(id) { if (!confirm("이 부관리자를 삭제할까요?")) return; await DB.remove("coaches", id); UI.closeModal(); UI.toast("삭제됨"); UI.render_coaches(); },

  // ==================== 내정보 (회원) ====================
  async render_myinfo() {
    if (!this.isMember()) return this.show("dashboard");
    const id = this.session.memberId;
    const [members, payments, bookings, schedules] = await Promise.all([DB.list("members"), DB.list("payments"), DB.list("bookings"), DB.list("schedules")]);
    const m = members.find(x => x.id === id);
    if (!m) { $("#view-myinfo").innerHTML = `<div class="empty">회원 정보를 찾을 수 없습니다.</div>`; return; }
    const myPays = payments.filter(p => p.member_id === id).sort((a, b) => b.paid_date > a.paid_date ? 1 : -1);
    const nextDue = myPays.map(p => p.period_end).filter(Boolean).sort().pop();
    const myBooks = bookings.filter(b => b.member_id === id && b.status !== "취소" && b.status !== "거절")
      .map(b => ({ b, s: schedules.find(x => x.id === b.schedule_id) })).filter(x => x.s)
      .sort((a, b) => a.s.start_at > b.s.start_at ? 1 : -1);
    $("#view-myinfo").innerHTML = `
      <h2>내 정보</h2>
      <div class="card"><div class="li-main">${esc(m.name)} <span class="muted">${esc(m.gender || "")}</span></div>
        <div class="li-sub">${esc(m.phone || "-")} · 가입일 ${dDate(m.join_date)}</div></div>
      <div class="card"><b>💳 내 회비</b> <span class="muted">· 다음 입금 예정일: ${nextDue ? dDate(nextDue) : "기록 없음"}</span>
        ${feeBar(myPays)}
        ${myPays.length ? myPays.map(p => `<div class="li-sub">• ${dDate(p.paid_date)} ${won(p.amount)} (${p.months || 1}개월, ~${dDate(p.period_end)})</div>`).join("") : ""}</div>
      <div class="card"><b>내 예약</b>
        ${myBooks.length ? myBooks.map(x => `<div class="row spread" style="padding:5px 0">
          <span>${esc(x.s.title)} <span class="muted">${dDateTime(x.s.start_at)}</span></span>${bookingBadge(x.b.status)}</div>`).join("") : `<div class="empty">예약 내역이 없습니다. 스케줄에서 예약하세요.</div>`}</div>`;
  },

  // ==================== 설정 (관리자) ====================
  async render_settings() {
    if (!this.isAdmin()) return this.show("dashboard");
    const c = await this.adminCreds();
    $("#view-settings").innerHTML = `
      <h2>설정</h2>
      <div class="card">
        <b>관리자 로그인 정보 변경</b>
        <div class="li-sub" style="margin:4px 0 10px">아이디와 비밀번호를 바꿀 수 있어요. 변경 후엔 새 정보로 로그인하세요.</div>
        <label>아이디</label><input id="set_id" value="${esc(c.admin_id || "")}" />
        <label>새 비밀번호</label><input id="set_pw" type="text" value="${esc(c.admin_pw || "")}" />
        <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" onclick="UI.saveSettings()">저장</button></div>
      </div>
      <div class="card"><b>클럽 정보</b>
        <div class="li-sub">클럽 이름: ${esc((window.APP_CONFIG || {}).CLUB_NAME || "피클볼 클럽")}</div>
        <div class="li-sub">데이터 연결: ${DB.configured ? "Supabase 연결됨 ✅" : "데모 모드(로컬)"}</div></div>`;
  },
  async saveSettings() {
    const admin_id = ($("#set_id").value || "").trim(), admin_pw = ($("#set_pw").value || "").trim();
    if (!admin_id || !admin_pw) return UI.toast("아이디와 비밀번호를 입력하세요", true);
    try {
      const rows = await DB.list("app_config");
      if (rows && rows[0]) await DB.update("app_config", rows[0].id, { admin_id, admin_pw });
      else await DB.insert("app_config", { admin_id, admin_pw });
      this.session.name = admin_id; localStorage.setItem("pb_session", JSON.stringify(this.session));
      $("#whoami").textContent = `${admin_id} (관리자)`;
      UI.toast("저장되었습니다");
    } catch (e) { UI.toast("저장 실패: " + e.message, true); }
  }
};

document.addEventListener("DOMContentLoaded", () => UI.init());
