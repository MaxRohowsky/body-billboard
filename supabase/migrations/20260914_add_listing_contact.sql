alter table public.listings
  add column if not exists contact text;

alter table public.listings
  drop constraint if exists listings_contact_length;

alter table public.listings
  add constraint listings_contact_length
  check (contact is null or char_length(contact) between 1 and 200);
