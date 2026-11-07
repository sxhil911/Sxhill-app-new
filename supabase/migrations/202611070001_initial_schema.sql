-- SK Science initial schema for the replacement Supabase project.
create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'student' check (role in ('admin','teacher','student')),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price numeric(10,2) not null default 0 check (price >= 0),
  level text not null default 'Class 9–10',
  published boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  video_url text not null check (video_url ~ '^https://'),
  duration text not null default '',
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','cancelled','refunded')),
  amount numeric(10,2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  unique(course_id, student_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references public.enrollments(id) on delete set null,
  student_id uuid not null references public.profiles(id),
  provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text unique,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created','authorized','captured','failed','refunded')),
  created_at timestamptz not null default now()
);

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  meeting_url text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists courses_created_by_idx on public.courses(created_by);
create index if not exists lessons_course_sort_idx on public.lessons(course_id, sort_order);
create index if not exists enrollments_student_idx on public.enrollments(student_id);
create index if not exists payments_student_idx on public.payments(student_id);
create index if not exists class_sessions_starts_idx on public.class_sessions(starts_at);

create or replace function private.is_approved_user()
returns boolean language sql stable security definer
set search_path = public, auth
as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved = true);
$$;

create or replace function private.is_admin_user()
returns boolean language sql stable security definer
set search_path = public, auth
as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved = true and p.role = 'admin');
$$;

create or replace function private.is_staff_user()
returns boolean language sql stable security definer
set search_path = public, auth
as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved = true and p.role in ('admin','teacher'));
$$;

revoke all on function private.is_approved_user() from public, anon;
revoke all on function private.is_admin_user() from public, anon;
revoke all on function private.is_staff_user() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_approved_user() to authenticated;
grant execute on function private.is_admin_user() to authenticated;
grant execute on function private.is_staff_user() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles(id, full_name, role, approved)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'student', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.payments enable row level security;
alter table public.class_sessions enable row level security;

drop policy if exists "profiles read self or admin" on public.profiles;
create policy "profiles read self or admin" on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin_user()));

drop policy if exists "profiles update self safe fields" on public.profiles;
create policy "profiles update self safe fields" on public.profiles for update to authenticated
using (id = (select auth.uid()) and (select private.is_approved_user()))
with check (id = (select auth.uid()) and (select private.is_approved_user()) and approved = true);

drop policy if exists "approved users read courses" on public.courses;
create policy "approved users read courses" on public.courses for select to authenticated
using ((select private.is_approved_user()) and (published = true or (select private.is_staff_user())));

drop policy if exists "staff create courses" on public.courses;
create policy "staff create courses" on public.courses for insert to authenticated
with check ((select private.is_staff_user()) and created_by = (select auth.uid()));

drop policy if exists "staff update own courses" on public.courses;
create policy "staff update own courses" on public.courses for update to authenticated
using ((select private.is_staff_user()) and (created_by = (select auth.uid()) or (select private.is_admin_user())))
with check ((select private.is_staff_user()) and (created_by = (select auth.uid()) or (select private.is_admin_user())));

drop policy if exists "staff delete own courses" on public.courses;
create policy "staff delete own courses" on public.courses for delete to authenticated
using ((select private.is_admin_user()) or ((select private.is_staff_user()) and created_by = (select auth.uid())));

drop policy if exists "approved users read lessons" on public.lessons;
create policy "approved users read lessons" on public.lessons for select to authenticated
using ((select private.is_approved_user()) and exists(select 1 from public.courses c where c.id = course_id and (c.published = true or (select private.is_staff_user()))));

drop policy if exists "staff manage lessons" on public.lessons;
create policy "staff manage lessons" on public.lessons for all to authenticated
using ((select private.is_staff_user()) and exists(select 1 from public.courses c where c.id = course_id and (c.created_by = (select auth.uid()) or (select private.is_admin_user()))))
with check ((select private.is_staff_user()) and created_by = (select auth.uid()) and exists(select 1 from public.courses c where c.id = course_id and (c.created_by = (select auth.uid()) or (select private.is_admin_user()))));

drop policy if exists "students read own enrollments" on public.enrollments;
create policy "students read own enrollments" on public.enrollments for select to authenticated
using ((select private.is_approved_user()) and (student_id = (select auth.uid()) or (select private.is_admin_user())));

drop policy if exists "students request enrollment" on public.enrollments;
create policy "students request enrollment" on public.enrollments for insert to authenticated
with check ((select private.is_approved_user()) and student_id = (select auth.uid()) and status = 'pending');

drop policy if exists "admins manage enrollments" on public.enrollments;
create policy "admins manage enrollments" on public.enrollments for all to authenticated
using ((select private.is_admin_user())) with check ((select private.is_admin_user()));

drop policy if exists "students read own payments" on public.payments;
create policy "students read own payments" on public.payments for select to authenticated
using ((select private.is_approved_user()) and (student_id = (select auth.uid()) or (select private.is_admin_user())));

drop policy if exists "admins read payments" on public.payments;
create policy "admins read payments" on public.payments for all to authenticated
using ((select private.is_admin_user())) with check ((select private.is_admin_user()));

drop policy if exists "approved users read sessions" on public.class_sessions;
create policy "approved users read sessions" on public.class_sessions for select to authenticated
using ((select private.is_approved_user()));

drop policy if exists "staff manage sessions" on public.class_sessions;
create policy "staff manage sessions" on public.class_sessions for all to authenticated
using ((select private.is_staff_user()) and (created_by = (select auth.uid()) or (select private.is_admin_user())))
with check ((select private.is_staff_user()) and created_by = (select auth.uid()));

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.lessons to authenticated;
grant select, insert, update, delete on public.enrollments to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.class_sessions to authenticated;
