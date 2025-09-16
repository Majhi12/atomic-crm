-- Deals: add multi-purpose fields
alter table deals
  add column if not exists deal_kind text not null default 'sales' check (deal_kind in ('sales','procurement','partnership')),
  add column if not exists vendor_company_id bigint,
  add column if not exists cost numeric;

-- Stage sets per kind
create table if not exists deal_stage_sets (
  id bigserial primary key,
  deal_kind text not null,
  stage text not null,
  position int not null,
  unique (deal_kind, stage)
);

-- Helpful index to lookup default first stage per kind
create index if not exists deal_stage_sets_kind_pos_idx on deal_stage_sets (deal_kind, position);

-- Seed default stages
insert into deal_stage_sets (deal_kind, stage, position) values
('sales','Lead',1),('sales','Qualified',2),('sales','Proposal',3),('sales','Won',4),('sales','Lost',5),
('procurement','Sourcing',1),('procurement','RFQ',2),('procurement','Negotiation',3),('procurement','Ordered',4),('procurement','Received',5)
on conflict do nothing;

-- RLS for deal_stage_sets: read-only for authenticated users
alter table deal_stage_sets enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'deal_stage_sets' and policyname = 'Allow read deal_stage_sets'
  ) then
    create policy "Allow read deal_stage_sets" on deal_stage_sets for select using (auth.uid() is not null);
  end if;
end $$;
