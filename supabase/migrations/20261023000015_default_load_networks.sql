-- Offer a basic load product for each network the owner has not configured.
-- Leave costs unset so the seller enters the actual cost of each sale.
insert into public.load_products (network, label)
select defaults.network, defaults.network
from (values ('TM'), ('GLOBE'), ('SUN'), ('SMART'), ('DITO'), ('GoMo'), ('TnT')) as defaults(network)
where not exists (
  select 1
  from public.load_products as existing
  where lower(btrim(existing.network)) = lower(defaults.network)
)
on conflict (network, label) do nothing;
