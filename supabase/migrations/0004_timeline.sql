-- =====================================================================
-- Memory Vault – 0004: the timeline
--
-- Months are based on the time shown on the phone (local_time), so a
-- message sent at 23:30 on 31 December stays in December.
-- =====================================================================

create index if not exists messages_local_time_idx
  on public.messages (space_id, local_time);

-- One row per month that has messages: how many messages and files.
create or replace function public.timeline_months(p_space_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.month), '[]'::jsonb)
  from (
    select
      to_char(m.local_time, 'YYYY-MM') as month,
      count(*) filter (where m.kind <> 'system') as messages,
      count(a.message_id) as files
    from public.messages m
    left join public.message_attachments a
      on a.message_id = m.id and a.media_id is not null
    where m.space_id = p_space_id
    group by 1
  ) t;
$$;

revoke execute on function public.timeline_months(uuid) from public, anon;
grant execute on function public.timeline_months(uuid) to authenticated;
