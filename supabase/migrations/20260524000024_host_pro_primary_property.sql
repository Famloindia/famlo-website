begin;

alter table public.host_pro_subscriptions
  add column if not exists primary_pro_property_id uuid references public.families(id) on delete set null;

create index if not exists host_pro_subscriptions_primary_property_idx
  on public.host_pro_subscriptions(primary_pro_property_id, created_at desc);

with resolved_primary as (
  select
    subscription_rows.id,
    coalesce(
      first_value(coalesce(subscription_rows.primary_pro_property_id, subscription_rows.family_id)) over (
        partition by coalesce(subscription_rows.host_user_id::text, family_rows.user_id::text, subscription_rows.family_id::text)
        order by subscription_rows.created_at asc nulls last, subscription_rows.family_id asc nulls last
      ),
      subscription_rows.family_id
    ) as primary_property_id
  from public.host_pro_subscriptions as subscription_rows
  left join public.families as family_rows
    on family_rows.id = subscription_rows.family_id
)
update public.host_pro_subscriptions as target
set primary_pro_property_id = resolved_primary.primary_property_id
from resolved_primary
where target.id = resolved_primary.id
  and target.primary_pro_property_id is null
  and resolved_primary.primary_property_id is not null;

notify pgrst, 'reload schema';

commit;
