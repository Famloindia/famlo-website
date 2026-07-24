-- Recover shared host languages missed when a multi-property owner's newest
-- family was not the family linked to their populated legacy host row.
with language_source as (
  select distinct on (h.user_id)
    h.user_id,
    public.famlo_normalize_text_array(h.languages) as languages
  from public.hosts h
  where h.user_id is not null
    and cardinality(coalesce(h.languages, '{}'::text[])) > 0
  order by h.user_id, h.updated_at desc nulls last, h.id
)
update public.users u
set
  host_languages = language_source.languages,
  updated_at = now()
from language_source
where u.id = language_source.user_id
  and cardinality(coalesce(u.host_languages, '{}'::text[])) = 0;

notify pgrst, 'reload schema';
