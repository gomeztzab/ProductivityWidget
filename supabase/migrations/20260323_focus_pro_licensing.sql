begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table if not exists public.plans (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    price_usd numeric(10,2) not null,
    billing_type text not null,
    max_devices integer not null check (max_devices > 0),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.license_statuses (
    code text primary key,
    description text not null
);

create table if not exists public.licenses (
    id uuid primary key default gen_random_uuid(),
    plan_id uuid not null references public.plans(id),
    gumroad_sale_id text unique,
    gumroad_product_id text,
    gumroad_license_key text not null unique,
    buyer_email text,
    buyer_name text,
    source text not null default 'gumroad',
    status text not null references public.license_statuses(code),
    max_devices integer not null check (max_devices > 0),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.devices (
    id uuid primary key default gen_random_uuid(),
    device_fingerprint text not null unique,
    device_name text,
    os_name text,
    os_version text,
    app_version text,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.license_activations (
    id uuid primary key default gen_random_uuid(),
    license_id uuid not null references public.licenses(id) on delete cascade,
    device_id uuid not null references public.devices(id) on delete cascade,
    activation_status text not null default 'active',
    activated_at timestamptz not null default now(),
    last_validated_at timestamptz not null default now(),
    revoked_at timestamptz,
    revoke_reason text,
    metadata jsonb not null default '{}'::jsonb,
    unique (license_id, device_id)
);

create table if not exists public.feature_sets (
    id uuid primary key default gen_random_uuid(),
    plan_id uuid not null references public.plans(id) on delete cascade,
    feature_key text not null,
    enabled boolean not null default true,
    unique (plan_id, feature_key)
);

create table if not exists public.webhook_events (
    id uuid primary key default gen_random_uuid(),
    provider text not null default 'gumroad',
    event_type text not null,
    external_event_id text,
    payload jsonb not null,
    processed boolean not null default false,
    processed_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    license_id uuid references public.licenses(id) on delete set null,
    device_id uuid references public.devices(id) on delete set null,
    event_type text not null,
    message text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_licenses_status on public.licenses(status);
create index if not exists idx_licenses_buyer_email on public.licenses(buyer_email);
create index if not exists idx_devices_last_seen_at on public.devices(last_seen_at desc);
create index if not exists idx_license_activations_license_id on public.license_activations(license_id);
create index if not exists idx_license_activations_device_id on public.license_activations(device_id);
create index if not exists idx_license_activations_status on public.license_activations(activation_status);
create index if not exists idx_feature_sets_plan_id on public.feature_sets(plan_id);
create index if not exists idx_webhook_events_provider_type on public.webhook_events(provider, event_type);
create index if not exists idx_webhook_events_processed on public.webhook_events(processed);
create index if not exists idx_audit_logs_license_id on public.audit_logs(license_id);
create index if not exists idx_audit_logs_device_id on public.audit_logs(device_id);
create index if not exists idx_audit_logs_event_type on public.audit_logs(event_type);

drop trigger if exists trg_plans_updated_at on public.plans;
create trigger trg_plans_updated_at
before update on public.plans
for each row
execute function public.set_updated_at();

drop trigger if exists trg_licenses_updated_at on public.licenses;
create trigger trg_licenses_updated_at
before update on public.licenses
for each row
execute function public.set_updated_at();

insert into public.license_statuses (code, description)
values
    ('active', 'License can be activated'),
    ('refunded', 'License refunded and revoked'),
    ('revoked', 'License manually revoked'),
    ('disabled', 'License disabled by admin')
on conflict (code) do update
set description = excluded.description;

insert into public.plans (code, name, price_usd, billing_type, max_devices, is_active)
values ('focus_pro', 'Focus Pro', 6.99, 'lifetime', 1, true)
on conflict (code) do update
set
    name = excluded.name,
    price_usd = excluded.price_usd,
    billing_type = excluded.billing_type,
    max_devices = excluded.max_devices,
    is_active = excluded.is_active,
    updated_at = now();

with focus_pro_plan as (
    select id
    from public.plans
    where code = 'focus_pro'
)
insert into public.feature_sets (plan_id, feature_key, enabled)
select focus_pro_plan.id, features.feature_key, true
from focus_pro_plan
cross join (
    values
        ('windowModeBar'),
        ('windowModeCollapsed'),
        ('pomodoroSound'),
        ('pomodoroSoundIntensity'),
        ('customAccentColors'),
        ('customTextColors'),
        ('customThemes'),
        ('customFonts'),
        ('customBackground'),
        ('strictScreenLock'),
        ('strictInteractionLock'),
        ('strictWebsiteBlock')
) as features(feature_key)
on conflict (plan_id, feature_key) do update
set enabled = excluded.enabled;

alter table public.plans enable row level security;
alter table public.license_statuses enable row level security;
alter table public.licenses enable row level security;
alter table public.devices enable row level security;
alter table public.license_activations enable row level security;
alter table public.feature_sets enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "deny_all_plans" on public.plans;
create policy "deny_all_plans"
on public.plans
for all
to public
using (false)
with check (false);

drop policy if exists "deny_all_license_statuses" on public.license_statuses;
create policy "deny_all_license_statuses"
on public.license_statuses
for all
to public
using (false)
with check (false);

drop policy if exists "deny_all_licenses" on public.licenses;
create policy "deny_all_licenses"
on public.licenses
for all
to public
using (false)
with check (false);

drop policy if exists "deny_all_devices" on public.devices;
create policy "deny_all_devices"
on public.devices
for all
to public
using (false)
with check (false);

drop policy if exists "deny_all_license_activations" on public.license_activations;
create policy "deny_all_license_activations"
on public.license_activations
for all
to public
using (false)
with check (false);

drop policy if exists "deny_all_feature_sets" on public.feature_sets;
create policy "deny_all_feature_sets"
on public.feature_sets
for all
to public
using (false)
with check (false);

drop policy if exists "deny_all_webhook_events" on public.webhook_events;
create policy "deny_all_webhook_events"
on public.webhook_events
for all
to public
using (false)
with check (false);

drop policy if exists "deny_all_audit_logs" on public.audit_logs;
create policy "deny_all_audit_logs"
on public.audit_logs
for all
to public
using (false)
with check (false);

commit;