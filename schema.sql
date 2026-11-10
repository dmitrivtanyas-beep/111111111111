-- Paired English Learning Workspace
-- Run this entire file in Supabase SQL Editor as project owner.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Наш простір',
  invite_code text unique not null default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  unique (user_id)
);

create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  english text not null,
  ukrainian text not null,
  example text,
  pronunciation text,
  part_of_speech text,
  tags text[] not null default '{}',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  due_at timestamptz not null default now(),
  interval_days numeric not null default 0,
  ease numeric not null default 2.5,
  repetitions integer not null default 0,
  last_rating text,
  constraint words_english_not_blank check (length(trim(english)) > 0),
  constraint words_ukrainian_not_blank check (length(trim(ukrainian)) > 0)
);

create unique index if not exists words_unique_english_per_workspace
on public.words (workspace_id, lower(english));

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  folder text,
  updated_at timestamptz not null default now()
);

create index if not exists words_due_idx on public.words(workspace_id, due_at);
create index if not exists notes_workspace_idx on public.notes(workspace_id, updated_at desc);

-- Keep profile records in sync with Supabase Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_workspace_member(target uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target and user_id = auth.uid()
  );
$$;

create or replace function public.create_workspace(workspace_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  if exists (select 1 from public.workspace_members where user_id = auth.uid()) then
    raise exception 'Цей акаунт уже підключений до простору';
  end if;
  insert into public.workspaces(name, created_by)
  values (coalesce(nullif(trim(workspace_name), ''), 'Наш простір'), auth.uid())
  returning id into new_id;
  insert into public.workspace_members(workspace_id, user_id) values (new_id, auth.uid());
  return new_id;
end;
$$;

create or replace function public.join_workspace(invite_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target_id uuid;
declare member_count integer;
begin
  if exists (select 1 from public.workspace_members where user_id = auth.uid()) then
    raise exception 'Цей акаунт уже підключений до простору';
  end if;
  select id into target_id from public.workspaces
  where workspaces.invite_code = upper(trim(join_workspace.invite_code));
  if target_id is null then raise exception 'Код запрошення не знайдено'; end if;
  select count(*) into member_count from public.workspace_members where workspace_id = target_id;
  if member_count >= 2 then raise exception 'У просторі вже є два учасники'; end if;
  insert into public.workspace_members(workspace_id, user_id) values (target_id, auth.uid());
  return target_id;
end;
$$;

create or replace function public.refresh_invite_code(target_workspace uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare new_code text;
begin
  if not public.is_workspace_member(target_workspace) then raise exception 'Немає доступу'; end if;
  update public.workspaces
  set invite_code = upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8))
  where id = target_workspace
  returning invite_code into new_code;
  return new_code;
end;
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.words enable row level security;
alter table public.notes enable row level security;

drop policy if exists "Profiles visible to workspace peers" on public.profiles;
create policy "Profiles visible to workspace peers" on public.profiles for select
using (
  id = auth.uid() or exists (
    select 1 from public.workspace_members mine
    join public.workspace_members theirs on mine.workspace_id = theirs.workspace_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Workspace members can view workspace" on public.workspaces;
create policy "Workspace members can view workspace" on public.workspaces for select using (public.is_workspace_member(id));
drop policy if exists "Workspace members can update workspace" on public.workspaces;
create policy "Workspace members can update workspace" on public.workspaces for update using (public.is_workspace_member(id)) with check (public.is_workspace_member(id));

drop policy if exists "Members can view membership" on public.workspace_members;
create policy "Members can view membership" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
drop policy if exists "Members can leave membership" on public.workspace_members;
create policy "Members can leave membership" on public.workspace_members for delete using (user_id = auth.uid());

drop policy if exists "Members can read shared words" on public.words;
create policy "Members can read shared words" on public.words for select using (public.is_workspace_member(workspace_id));
drop policy if exists "Members can add words" on public.words;
create policy "Members can add words" on public.words for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
drop policy if exists "Members can update words" on public.words;
create policy "Members can update words" on public.words for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
drop policy if exists "Members can delete words" on public.words;
create policy "Members can delete words" on public.words for delete using (public.is_workspace_member(workspace_id));

drop policy if exists "Members can read shared or own notes" on public.notes;
create policy "Members can read shared or own notes" on public.notes for select
using (public.is_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = auth.uid()));
drop policy if exists "Members can create notes" on public.notes;
create policy "Members can create notes" on public.notes for insert
with check (public.is_workspace_member(workspace_id) and owner_id = auth.uid());
drop policy if exists "Owners can update their notes" on public.notes;
create policy "Owners can update their notes" on public.notes for update
using (public.is_workspace_member(workspace_id) and (owner_id = auth.uid() or visibility = 'shared'))
with check (public.is_workspace_member(workspace_id) and (owner_id = auth.uid() or visibility = 'shared'));
drop policy if exists "Owners can delete their notes" on public.notes;
create policy "Owners can delete their notes" on public.notes for delete
using (public.is_workspace_member(workspace_id) and (owner_id = auth.uid() or visibility = 'shared'));

-- Realtime publication: safe to ignore if tables were already added.
do $$
begin
  alter publication supabase_realtime add table public.words;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.join_workspace(text) to authenticated;
grant execute on function public.refresh_invite_code(uuid) to authenticated;
