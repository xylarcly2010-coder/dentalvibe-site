create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create policy "Admins can view their own access"
  on public.admin_users
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

create or replace function public.is_dental_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_dental_admin() from public, anon;
grant execute on function public.is_dental_admin() to authenticated;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null check (char_length(btrim(patient_name)) between 1 and 100),
  patient_email text not null check (
    char_length(patient_email) <= 254
    and patient_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  service text not null check (service in ('Oral cleaning', 'Tooth restoration', 'Dentures (Pustiso)')),
  appointment_date date not null,
  appointment_time text not null default 'To be confirmed' check (char_length(appointment_time) <= 50),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'completed', 'cancelled')),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_appointment_date_idx on public.bookings (appointment_date);
create index if not exists bookings_patient_email_idx on public.bookings (lower(patient_email));
create index if not exists bookings_created_at_idx on public.bookings (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

alter table public.bookings enable row level security;

create policy "Visitors can request bookings"
  on public.bookings
  for insert
  to anon, authenticated
  with check (
    status = 'requested'
    and appointment_time = 'To be confirmed'
    and notes = ''
    and appointment_date >= current_date
  );

create policy "Admins can manage bookings"
  on public.bookings
  for all
  to authenticated
  using ((select public.is_dental_admin()))
  with check ((select public.is_dental_admin()));

revoke all on public.bookings from anon, authenticated;
grant insert (patient_name, patient_email, service, appointment_date) on public.bookings to anon, authenticated;
grant select, update, delete on public.bookings to authenticated;

create table if not exists public.integration_settings (
  provider text primary key check (provider in ('google_calendar', 'email', 'sms', 'payments')),
  enabled boolean not null default false,
  configured boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.integration_settings (provider)
values ('google_calendar'), ('email'), ('sms'), ('payments')
on conflict (provider) do nothing;

drop trigger if exists integration_settings_set_updated_at on public.integration_settings;
create trigger integration_settings_set_updated_at
  before update on public.integration_settings
  for each row execute function public.set_updated_at();

alter table public.integration_settings enable row level security;

create policy "Admins can view integration settings"
  on public.integration_settings
  for select
  to authenticated
  using ((select public.is_dental_admin()));

create policy "Admins can change integration availability"
  on public.integration_settings
  for update
  to authenticated
  using ((select public.is_dental_admin()))
  with check ((select public.is_dental_admin()));

revoke all on public.integration_settings from anon, authenticated;
grant select on public.integration_settings to authenticated;
grant update (enabled) on public.integration_settings to authenticated;

create table if not exists public.clinic_settings (
  setting_key text primary key check (setting_key in ('clinic_profile')),
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.clinic_settings (setting_key, setting_value)
values (
  'clinic_profile',
  '{"name":"Dentalvibe Dental Clinic","location":"Tagum City, Davao del Norte, Philippines","phone":""}'::jsonb
)
on conflict (setting_key) do nothing;

drop trigger if exists clinic_settings_set_updated_at on public.clinic_settings;
create trigger clinic_settings_set_updated_at
  before update on public.clinic_settings
  for each row execute function public.set_updated_at();

alter table public.clinic_settings enable row level security;

create policy "Admins can manage clinic settings"
  on public.clinic_settings
  for all
  to authenticated
  using ((select public.is_dental_admin()))
  with check ((select public.is_dental_admin()));

revoke all on public.clinic_settings from anon, authenticated;
grant select, update (setting_value) on public.clinic_settings to authenticated;
