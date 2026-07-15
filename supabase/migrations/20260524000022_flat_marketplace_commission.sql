begin;

alter table public.hosts
  alter column platform_commission_pct set default 16;

alter table public.hommie_profiles_v2
  alter column platform_commission_pct set default 16;

update public.hosts
set platform_commission_pct = 16
where coalesce(platform_commission_pct, 16) <> 16;

update public.hommie_profiles_v2
set platform_commission_pct = 16
where coalesce(platform_commission_pct, 16) <> 16;

update public.users
set commission_rate_override = null
where commission_rate_override is not null;

update public.commission_rules
set rate_bps = 1600,
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'commission_model', 'flat_16_percent',
      'migrated_at', now()
    )
where code = 'famlo_default_commission'
   or (
     product_type = 'host_stay'
     and coalesce(target_type, 'product_type') = 'product_type'
     and rate_bps in (1200, 1500, 1800)
   );

update public.finance_rule_sets
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'commission_model', 'flat_16_percent',
  'flat_commission_pct', 16
)
where code = 'famlo_default_mvp';

commit;
