-- =====================================================================
-- Memory Vault – 0002: importing messages
--
-- import_messages() saves one batch of parsed messages and the
-- attachment records they reference, in a single transaction.
--   * Times are converted using the source's timezone.
--   * Messages already in the archive are skipped, so an interrupted
--     import can simply be run again.
--   * Runs with the caller's permissions, so Row Level Security applies.
-- =====================================================================

create or replace function public.import_messages(p_source_id uuid, p_messages jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_space     uuid;
  v_tz        text;
  v_inserted  integer;
  v_attached  integer;
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

  with input as (
    select *
    from jsonb_to_recordset(p_messages) as m(
      source_index  integer,
      local_time    timestamp,
      sender_name   text,
      kind          text,
      body          text,
      edited        boolean,
      omitted_type  text,
      album_index   integer,
      raw           text,
      dedup_key     text,
      attachments   jsonb
    )
  ),
  inserted as (
    insert into public.messages (
      space_id, source_id, source_index, local_time, sent_at, sender_name,
      kind, body, edited, omitted_type, album_index, raw, dedup_key
    )
    select
      v_space, p_source_id, i.source_index, i.local_time,
      i.local_time at time zone v_tz,
      i.sender_name, i.kind, coalesce(i.body, ''), coalesce(i.edited, false),
      i.omitted_type, i.album_index, i.raw, i.dedup_key
    from input i
    on conflict do nothing
    returning id, source_index
  ),
  attached as (
    insert into public.message_attachments (message_id, position, space_id, export_filename)
    select ins.id, (a.ord - 1)::smallint, v_space, a.value ->> 'fileName'
    from inserted ins
    join input i on i.source_index = ins.source_index
    cross join lateral jsonb_array_elements(coalesce(i.attachments, '[]'::jsonb))
      with ordinality as a(value, ord)
    returning 1
  )
  select (select count(*) from inserted), (select count(*) from attached)
  into v_inserted, v_attached;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', jsonb_array_length(p_messages) - v_inserted,
    'attachments', v_attached
  );
end;
$$;

revoke execute on function public.import_messages(uuid, jsonb) from public, anon;
grant execute on function public.import_messages(uuid, jsonb) to authenticated;
