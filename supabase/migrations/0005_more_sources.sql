-- =====================================================================
-- Memory Vault – 0005: allow Instagram (and, later, Facebook) imports
-- =====================================================================

alter table public.sources drop constraint if exists sources_kind_check;
alter table public.sources add constraint sources_kind_check
  check (kind in ('whatsapp_ios', 'whatsapp_android', 'instagram', 'facebook', 'manual'));
