-- Finanças do casal: rodar uma vez no Supabase (SQL Editor > New query > colar > Run).
-- Só os e-mails da tabela "membros" enxergam ou alteram os dados (Row Level Security).

create table if not exists membros (
  email text primary key,
  nome  text
);

create or replace function eh_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

create table if not exists caixinhas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  emoji     text not null default '💰',
  meta      numeric(12,2) not null default 0 check (meta >= 0),
  prazo     date,
  arquivada boolean not null default false,
  criado_em timestamptz not null default now()
);

create table if not exists lancamentos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('entrada', 'saida', 'deposito', 'retirada')),
  valor       numeric(12,2) not null check (valor > 0),
  descricao   text,
  categoria   text,
  caixinha_id uuid references caixinhas(id) on delete cascade,
  quem        text not null default (auth.jwt() ->> 'email'),
  data        date not null default current_date,
  criado_em   timestamptz not null default now(),
  -- depósito/retirada sempre têm caixinha; entrada/saída nunca têm
  check ((tipo in ('deposito', 'retirada')) = (caixinha_id is not null))
);

create index if not exists lancamentos_data on lancamentos (data desc);

alter table membros     enable row level security;
alter table caixinhas   enable row level security;
alter table lancamentos enable row level security;

drop policy if exists "membros leem" on membros;
create policy "membros leem" on membros for select using (eh_membro());

drop policy if exists "casal" on caixinhas;
create policy "casal" on caixinhas for all using (eh_membro()) with check (eh_membro());

drop policy if exists "casal" on lancamentos;
create policy "casal" on lancamentos for all using (eh_membro()) with check (eh_membro());

-- TROQUE pelos e-mails de vocês dois (os mesmos que vão usar para entrar no app):
insert into membros (email, nome) values
  ('EMAIL_DO_PEDRO@exemplo.com', 'Pedro'),
  ('EMAIL_DA_GIOVANNA@exemplo.com', 'Giovanna')
on conflict (email) do update set nome = excluded.nome;
