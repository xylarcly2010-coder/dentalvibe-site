alter table public.bookings
  add column if not exists patient_id uuid references auth.users (id) on delete set null;

create index if not exists bookings_patient_id_idx on public.bookings (patient_id);

drop policy if exists "Visitors can request bookings" on public.bookings;
drop policy if exists "Patients can view own bookings" on public.bookings;
drop policy if exists "Patients can request bookings" on public.bookings;

create policy "Patients can request bookings"
  on public.bookings
  for insert
  to authenticated
  with check (
    patient_id = (select auth.uid())
    and lower(patient_email) = lower((select auth.jwt() ->> 'email'))
    and status = 'requested'
    and appointment_time = 'To be confirmed'
    and notes = ''
    and appointment_date >= current_date
  );

create policy "Patients can view own bookings"
  on public.bookings
  for select
  to authenticated
  using (patient_id = (select auth.uid()));

revoke insert on public.bookings from anon, authenticated;
revoke insert (patient_name, patient_email, service, appointment_date)
  on public.bookings from anon, authenticated;
grant insert (patient_id, patient_name, patient_email, service, appointment_date)
  on public.bookings to authenticated;
grant select on public.bookings to authenticated;
