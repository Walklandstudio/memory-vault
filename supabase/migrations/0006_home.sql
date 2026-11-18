-- =====================================================================
-- Memory Vault – 0006: home page summaries
--
-- archive_summary()  the numbers on each archive's card
-- featured_day()     a photo-rich day to revisit; changes every day
-- Both run with the caller's permissions, so Row Level Security applies.
-- =====================================================================

create or replace function public.archive_summary(p_space_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'messages', (select count(*) from public.messages m
                 where m.space_id = p_space_id and m.kind <> 'system'),
    'files',    (select count(*) from public.media x where x.space_id = p_space_id),
    'people',   (select count(distinct m.sender_name) from public.messages m
                 where m.space_id = p_space_id and m.sender_name is not null),
    'since',    (select min(m.local_time) from public.messages m
                 where m.space_id = p_space_id and m.kind <> 'system'),
    'onlyInstagram',
      exists (select 1 from public.sources s where s.space_id = p_space_id)
      and not exists (select 1 from public.sources s
                      where s.space_id = p_space_id and s.kind <> 'instagram')
  );
$$;

create or replace function public.featured_day(p_space_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with days as (
    select
      m.local_time::date as day,
      count(*) filter (where x.kind = 'photo') as photos,
      array_agg(x.thumb_path order by m.sent_at, a.position)
        filter (where x.kind = 'photo' and x.thumb_path is not null) as thumbs,
      (array_agg(m.body order by m.sent_at) filter (where m.body <> ''))[1] as caption
    from public.messages m
    join public.message_attachments a on a.message_id = m.id
    join public.media x on x.id = a.media_id
    where m.space_id = p_space_id
    group by 1
    having count(*) filter (where x.kind = 'photo') >= 4
  )
  select coalesce(
    (select jsonb_build_object(
       'day', d.day,
       'photos', d.photos,
       'thumbs', to_jsonb(d.thumbs[1:2]),
       'caption', d.caption)
     from days d
     order by md5(d.day::text || current_date::text)
     limit 1),
    'null'::jsonb
  );
$$;

revoke execute on function public.archive_summary(uuid) from public, anon;
revoke execute on function public.featured_day(uuid) from public, anon;
grant execute on function public.archive_summary(uuid) to authenticated;
grant execute on function public.featured_day(uuid) to authenticated;
