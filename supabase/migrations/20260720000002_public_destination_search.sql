create extension if not exists pg_trgm;

create index if not exists hosts_public_city_trgm_idx
  on public.hosts
  using gin (lower(city) gin_trgm_ops)
  where status = 'published' and city is not null;

create index if not exists hosts_public_state_trgm_idx
  on public.hosts
  using gin (lower(state) gin_trgm_ops)
  where status = 'published' and state is not null;

create index if not exists hosts_public_locality_trgm_idx
  on public.hosts
  using gin (lower(locality) gin_trgm_ops)
  where status = 'published' and locality is not null;

create or replace function public.search_public_destinations(search_query text, result_limit integer default 8)
returns table (
  name text,
  slug text,
  state text,
  country text,
  property_count integer,
  match_kind text,
  similarity_score real
)
language sql
stable
set search_path = public
as $$
  with input as (
    select
      lower(trim(coalesce(search_query, ''))) as q,
      least(greatest(coalesce(result_limit, 8), 1), 8) as lim
  ),
  source_rows as (
    select
      coalesce(nullif(trim(city), ''), nullif(trim(locality), '')) as destination_name,
      nullif(trim(state), '') as destination_state
    from public.public_home_cards_v1
    where status = 'published'
      and property_marketplace_status = 'approved'
      and trust_status <> 'blocked'
      and coalesce(is_accepting, true) = true
      and coalesce(room_count, 0) > 0
      and coalesce(starting_room_price, 0) > 0
      and (
        coalesce(array_length(image_urls, 1), 0) > 0 or
        coalesce(array_length(room_image_urls, 1), 0) > 0
      )
  ),
  grouped_destinations as (
    select
      lower(destination_name) as normalized_name,
      lower(coalesce(destination_state, '')) as normalized_state,
      initcap(lower(destination_name)) as canonical_name,
      case
        when destination_state is null then null
        else initcap(lower(destination_state))
      end as canonical_state,
      count(*)::integer as property_count
    from source_rows
    where destination_name is not null
    group by 1, 2, 3, 4
  ),
  scored_destinations as (
    select
      destination.canonical_name as name,
      trim(both '-' from regexp_replace(
        lower(
          concat_ws(
            '-',
            destination.canonical_name,
            nullif(destination.canonical_state, '')
          )
        ),
        '[^a-z0-9]+',
        '-',
        'g'
      )) as slug,
      destination.canonical_state as state,
      'India'::text as country,
      destination.property_count,
      case
        when destination.normalized_name = input.q then 'exact'
        when destination.normalized_name like input.q || '%' then 'prefix'
        when concat_ws(' ', destination.normalized_name, destination.normalized_state) like '%' || input.q || '%' then 'partial'
        else 'fuzzy'
      end as match_kind,
      greatest(
        similarity(destination.normalized_name, input.q),
        similarity(concat_ws(' ', destination.normalized_name, destination.normalized_state), input.q)
      )::real as similarity_score
    from grouped_destinations destination
    cross join input
    where char_length(input.q) >= 2
      and (
        destination.normalized_name = input.q
        or destination.normalized_name like input.q || '%'
        or concat_ws(' ', destination.normalized_name, destination.normalized_state) like '%' || input.q || '%'
        or destination.normalized_name % input.q
        or concat_ws(' ', destination.normalized_name, destination.normalized_state) % input.q
        or similarity(destination.normalized_name, input.q) >= 0.24
        or similarity(concat_ws(' ', destination.normalized_name, destination.normalized_state), input.q) >= 0.24
      )
  )
  select
    scored.name,
    scored.slug,
    scored.state,
    scored.country,
    scored.property_count,
    scored.match_kind,
    scored.similarity_score
  from scored_destinations scored
  cross join input
  order by
    case scored.match_kind
      when 'exact' then 4
      when 'prefix' then 3
      when 'partial' then 2
      else 1
    end desc,
    case
      when scored.match_kind <> 'fuzzy' then scored.property_count
      else null
    end desc nulls last,
    scored.similarity_score desc,
    scored.property_count desc,
    scored.name asc,
    scored.state asc nulls last
  limit input.lim;
$$;
