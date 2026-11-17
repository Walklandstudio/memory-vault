-- =====================================================================
-- Memory Vault – 0003: importing photos, videos and voice notes
--
-- pending_media()   lists the files an import still needs to upload,
--                   so an interrupted upload simply carries on.
-- register_media()  records uploaded files and links them to the
--                   exact messages that referenced them.
-- Both run with the caller's permissions, so Row Level Security applies.
-- =====================================================================

create or replace function public.pending_media(p_source_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(distinct a.export_filename order by a.export_filename),
    '[]'::jsonb
  )
  from public.message_attachments a
  join public.messages m on m.id = a.message_id
  where m.source_id = p_source_id
    and a.media_id is null;
$$;

create or replace function public.register_media(p_source_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_space   uuid;
  v_tz      text;
  v_item    jsonb;
  v_media   uuid;
  v_rows    integer;
  v_linked  integer := 0;
begin
  select s.space_id, s.timezone into v_space, v_tz
  from public.sources s
  where s.id = p_source_id;

  if v_space is null then
    raise exception 'Import source not found, or you do not have access to it';
  end if;
  if not public.can_edit_space(v_space) then
    raise exception 'You do not have permission to import into this archive';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    -- One row per unique file. If the same file arrived before (for
    -- example in another export), keep it and fill in anything missing.
    insert into public.media as md (
      space_id, sha256, kind, mime_type, byte_size, storage_path, thumb_path,
      width, height, duration_seconds, taken_at, original_filename
    )
    values (
      v_space,
      v_item ->> 'sha256',
      v_item ->> 'kind',
      v_item ->> 'mimeType',
      (v_item ->> 'byteSize')::bigint,
      v_item ->> 'storagePath',
      v_item ->> 'thumbPath',
      (v_item ->> 'width')::integer,
      (v_item ->> 'height')::integer,
      (v_item ->> 'durationSeconds')::numeric,
      (v_item ->> 'takenLocal')::timestamp at time zone v_tz,
      v_item ->> 'fileName'
    )
    on conflict (space_id, sha256) do update set
      thumb_path       = coalesce(md.thumb_path, excluded.thumb_path),
      width            = coalesce(md.width, excluded.width),
      height           = coalesce(md.height, excluded.height),
      duration_seconds = coalesce(md.duration_seconds, excluded.duration_seconds),
      taken_at         = coalesce(md.taken_at, excluded.taken_at)
    returning md.id into v_media;

    -- Link every message in this import that referenced the file.
    update public.message_attachments a
    set media_id = v_media
    from public.messages m
    where m.id = a.message_id
      and m.source_id = p_source_id
      and a.export_filename = v_item ->> 'fileName'
      and a.media_id is null;

    get diagnostics v_rows = row_count;
    v_linked := v_linked + v_rows;
  end loop;

  return jsonb_build_object('linked', v_linked);
end;
$$;

revoke execute on function public.pending_media(uuid) from public, anon;
revoke execute on function public.register_media(uuid, jsonb) from public, anon;
grant execute on function public.pending_media(uuid) to authenticated;
grant execute on function public.register_media(uuid, jsonb) to authenticated;
