-- ============================================================
-- 피클볼 회원관리 시스템 - Supabase 데이터베이스 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- ============================================================
create extension if not exists "pgcrypto";

-- 1) 코칭 스탭
create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text, address text,
  role text default '코치', specialty text, notes text,
  created_at timestamptz not null default now()
);

-- 2) 회원
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  birth_date date,
  referrer text,
  email text,
  gender text,
  join_date date not null default current_date,
  membership_type text default '정회원',
  status text not null default '승인대기',  -- 승인대기 / 활동 / 휴면 / 탈퇴 / 거절
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_members_name on public.members (name);
create index if not exists idx_members_status on public.members (status);

-- 3) 스케줄
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  coach_id uuid references public.coaches(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz,
  location text, capacity int default 8, level text, notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_schedules_start on public.schedules (start_at);

-- 4) 예약 (회원 ↔ 스케줄/시간슬롯)
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status text not null default '신청',   -- 신청(문의) / 예약(승인) / 거절 / 취소 / 출석
  note text,
  created_at timestamptz not null default now(),
  unique (schedule_id, member_id)
);
create index if not exists idx_bookings_schedule on public.bookings (schedule_id);
create index if not exists idx_bookings_member on public.bookings (member_id);

-- 5) 회비
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  amount numeric(12,0) not null default 0,
  paid_date date not null default current_date,
  months int default 1,                  -- 납부 개월 수(1~12)
  period_start date,
  period_end date,                        -- 다음 입금 예정일
  method text default '계좌이체',
  status text not null default '완납',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_member on public.payments (member_id);
create index if not exists idx_payments_period_end on public.payments (period_end);

-- 6) 알림 로그
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  schedule_id uuid references public.schedules(id) on delete set null,
  channel text default 'alimtalk', message text, status text default 'queued',
  sent_at timestamptz, created_at timestamptz not null default now()
);

-- ============================================================
-- 실시간(Realtime) 활성화 — 가입 승인 요청·예약 문의가 즉시 반영
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['members','bookings','schedules','payments','notifications']
  loop
    begin execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when others then null; end;
  end loop;
end $$;

-- ============================================================
-- 행 수준 보안(RLS)
-- ============================================================
alter table public.coaches enable row level security;
alter table public.members enable row level security;
alter table public.schedules enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;

-- 로그인 사용자 전체 허용
do $$
declare t text;
begin
  foreach t in array array['coaches','members','schedules','bookings','payments','notifications']
  loop
    execute format('drop policy if exists "auth_all_%1$s" on public.%1$s;', t);
    execute format('create policy "auth_all_%1$s" on public.%1$s for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- ⚠️ 현재 단계: 로그인 기능이 아직 없으므로 anon(비로그인)에게도 허용.
--    회원이 폰에서 바로 가입·예약하려면 필요해요.
--    ★ 나중에 로그인을 붙이면 아래 블록을 제거해 보안을 강화하세요.
do $$
declare t text;
begin
  foreach t in array array['coaches','members','schedules','bookings','payments','notifications']
  loop
    execute format('drop policy if exists "anon_all_%1$s" on public.%1$s;', t);
    execute format('create policy "anon_all_%1$s" on public.%1$s for all to anon using (true) with check (true);', t);
  end loop;
end $$;
