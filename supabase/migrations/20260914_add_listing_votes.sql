create table if not exists public.listing_votes (
  listing_id bigint not null references public.listings(id) on delete cascade,
  voter_sub text not null,
  created_at timestamptz not null default now(),
  primary key (listing_id, voter_sub)
);

alter table public.listing_votes enable row level security;
revoke all on table public.listing_votes from anon, authenticated;
grant all on table public.listing_votes to service_role;

create index if not exists listing_votes_listing_id_idx
  on public.listing_votes (listing_id);
