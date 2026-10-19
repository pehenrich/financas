-- Despesas fixas (aluguel, internet, academia…): o app lança cada uma sozinho, uma vez por mês.
-- Rodar uma vez no Supabase (SQL Editor > New query > colar > Run), depois do supabase.sql.

create table if not exists fixas (
  id        uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria text not null default '💡 Contas',
  valor     numeric(12,2) not null check (valor > 0),
  dia       int not null default 5 check (dia between 1 and 31),
  ativa     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- lançamento gerado por uma fixa: guarda de qual fixa e de qual mês (AAAA-MM), para não lançar duas vezes
alter table lancamentos add column if not exists fixa_id  uuid references fixas(id) on delete set null;
alter table lancamentos add column if not exists fixa_mes text;
create unique index if not exists lancamentos_fixa_mes on lancamentos (fixa_id, fixa_mes);

alter table fixas enable row level security;
drop policy if exists "casal" on fixas;
create policy "casal" on fixas for all using (eh_membro()) with check (eh_membro());
