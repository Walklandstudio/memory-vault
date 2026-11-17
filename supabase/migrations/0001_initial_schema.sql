-- =====================================================================
-- Memory Vault – initial schema
--
-- Two layers:
--   ORIGINAL layer  – sources, messages, message_attachments, media
--                     What the exports said, exactly. Messages can never
--                     be edited (enforced by a trigger, even for admins).
--   CURATED layer   – people, person_aliases (memories/albums come later)
--                     Your organisation on top of the originals.
--
-- Everything belongs to a "space" (a family archive). Row Level Security
-- means a user only ever sees spaces they are a member of.
-- =====================================================================

-- ---------- Spaces and membership ----------

create type public.space_role as enum ('owner', 'editor', 'viewer');

create table public.spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now()
);

create table public.space_members (
  space_id    uuid not null references public.spaces (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.space_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- Helper checks. SECURITY DEFINER so policies can call them without
-- triggering RLS on space_members recursively.
create or replace function public.is_space_member(p_space uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_edit_space(p_space uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space and m.user_id = (select auth.uid())
      and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_space_owner(p_space uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- Whoever creates a space becomes its owner automatically.
create or replace function public.add_space_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.space_members (space_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger spaces_add_owner
after insert on public.spaces
for each row execute function public.add_space_owner();

-- ---------- ORIGINAL layer ----------

-- One row per imported export (e.g. each WhatsApp zip).
create table public.sources (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces (id) on delete cascade,
  kind               text not null default 'whatsapp_ios'
                     check (kind in ('whatsapp_ios', 'whatsapp_android', 'manual')),
  label              text not null,                 -- your name for it
  chat_name          text,                          -- group name found in the export
  original_filename  text,
  timezone           text not null default 'Africa/Johannesburg',
  status             text not null default 'importing'
                     check (status in ('importing', 'complete', 'failed')),
  stats              jsonb not null default '{}'::jsonb,
  imported_by        uuid default auth.uid() references auth.users (id),
  imported_at        timestamptz not null default now()
);

-- Every message exactly as exported. Never updated after insert.
create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces (id) on delete cascade,
  source_id     uuid not null references public.sources (id) on delete cascade,
  source_index  integer not null,            -- position in the export file
  local_time    timestamp not null,          -- exactly as written in the export
  sent_at       timestamptz not null,        -- local_time + the source's timezone
  sender_name   text,                        -- null for system messages
  kind          text not null check (kind in
                ('text', 'attachment', 'system', 'deleted', 'omitted_media', 'album', 'unavailable')),
  body          text not null default '',
  edited        boolean not null default false,
  omitted_type  text,                        -- e.g. 'image' for "image omitted"
  album_index   integer,                     -- source_index of the album header, if in an album
  raw           text not null,               -- the original line(s), untouched
  dedup_key     text not null,
  search        tsvector generated always as (
                  to_tsvector('simple'::regconfig, coalesce(sender_name, '') || ' ' || body)
                ) stored,
  created_at    timestamptz not null default now(),
  unique (source_id, source_index),
  unique (space_id, dedup_key)               -- re-imports of the same chat skip duplicates
);

create index messages_timeline_idx on public.messages (space_id, sent_at);
create index messages_search_idx on public.messages using gin (search);

create or replace function public.prevent_message_update()
returns trigger language plpgsql as $$
begin
  raise exception 'Original messages cannot be edited. Add your changes in the curated layer instead.';
end;
$$;

create trigger messages_are_immutable
before update on public.messages
for each row execute function public.prevent_message_update();

-- One row per unique file, identified by its content hash.
create table public.media (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces (id) on delete cascade,
  sha256             text not null,
  kind               text not null check (kind in
                     ('photo', 'video', 'audio', 'sticker', 'gif', 'contact', 'document', 'other')),
  mime_type          text,
  byte_size          bigint,
  storage_path       text not null,          -- {space_id}/originals/{sha256}.{ext}
  thumb_path         text,                   -- {space_id}/thumbs/{sha256}.webp
  width              integer,
  height             integer,
  duration_seconds   numeric,
  taken_at           timestamptz,
  original_filename  text,
  created_at         timestamptz not null default now(),
  unique (space_id, sha256)
);

-- Links a message to the file(s) it referenced. media_id stays empty
-- until the file is uploaded, or forever if the export left it out.
create table public.message_attachments (
  message_id       uuid not null references public.messages (id) on delete cascade,
  position         smallint not null default 0,
  space_id         uuid not null references public.spaces (id) on delete cascade,
  export_filename  text not null,
  media_id         uuid references public.media (id) on delete set null,
  primary key (message_id, position)
);

create index message_attachments_media_idx on public.message_attachments (media_id);
create index message_attachments_filename_idx on public.message_attachments (space_id, export_filename);

-- ---------- CURATED layer ----------

-- One row per real person, however they appear in different exports.
create table public.people (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces (id) on delete cascade,
  display_name  text not null,
  user_id       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

-- "Lisa" and "Lisa Walker" can both point at the same person.
create table public.person_aliases (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces (id) on delete cascade,
  person_id  uuid not null references public.people (id) on delete cascade,
  alias      text not null,
  unique (space_id, alias)
);

-- ---------- Row Level Security ----------

alter table public.spaces              enable row level security;
alter table public.space_members       enable row level security;
alter table public.sources             enable row level security;
alter table public.messages            enable row level security;
alter table public.media               enable row level security;
alter table public.message_attachments enable row level security;
alter table public.people              enable row level security;
alter table public.person_aliases      enable row level security;

-- spaces
create policy "members can view their spaces" on public.spaces
  for select to authenticated using (public.is_space_member(id));
create policy "signed-in users can create spaces" on public.spaces
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "owners can rename spaces" on public.spaces
  for update to authenticated using (public.is_space_owner(id));
create policy "owners can delete spaces" on public.spaces
  for delete to authenticated using (public.is_space_owner(id));

-- space_members
create policy "members can see who is in the space" on public.space_members
  for select to authenticated using (public.is_space_member(space_id));
create policy "owners can add members" on public.space_members
  for insert to authenticated with check (public.is_space_owner(space_id));
create policy "owners can change roles" on public.space_members
  for update to authenticated using (public.is_space_owner(space_id));
create policy "owners can remove members" on public.space_members
  for delete to authenticated using (public.is_space_owner(space_id));

-- messages: read, add, delete – never update
create policy "members can read messages" on public.messages
  for select to authenticated using (public.is_space_member(space_id));
create policy "editors can import messages" on public.messages
  for insert to authenticated with check (public.can_edit_space(space_id));
create policy "owners can delete messages" on public.messages
  for delete to authenticated using (public.is_space_owner(space_id));

-- the remaining tables share one pattern: members read, editors write, owners delete
do $$
declare t text;
begin
  foreach t in array array['sources', 'media', 'message_attachments', 'people', 'person_aliases'] loop
    execute format('create policy "members can read" on public.%I for select to authenticated using (public.is_space_member(space_id))', t);
    execute format('create policy "editors can add" on public.%I for insert to authenticated with check (public.can_edit_space(space_id))', t);
    execute format('create policy "editors can update" on public.%I for update to authenticated using (public.can_edit_space(space_id)) with check (public.can_edit_space(space_id))', t);
    execute format('create policy "owners can delete" on public.%I for delete to authenticated using (public.is_space_owner(space_id))', t);
  end loop;
end $$;

-- Access for signed-in users only (RLS above narrows it to their spaces).
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.spaces, public.space_members, public.sources, public.messages,
  public.media, public.message_attachments, public.people, public.person_aliases
  to authenticated;
grant execute on function public.is_space_member(uuid), public.can_edit_space(uuid),
  public.is_space_owner(uuid) to authenticated;
revoke all on
  public.spaces, public.space_members, public.sources, public.messages,
  public.media, public.message_attachments, public.people, public.person_aliases
  from anon;

-- ---------- Private storage for photos, videos and voice notes ----------

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- Files live under {space_id}/..., so the first folder decides who can see them.
create or replace function public.space_id_from_path(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

grant execute on function public.space_id_from_path(text) to authenticated;

create policy "members can view media files" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and public.is_space_member(public.space_id_from_path(name)));
create policy "editors can upload media files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.can_edit_space(public.space_id_from_path(name)));
create policy "editors can replace media files" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.can_edit_space(public.space_id_from_path(name)));
create policy "owners can delete media files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.is_space_owner(public.space_id_from_path(name)));
