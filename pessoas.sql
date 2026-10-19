-- Quem paga cada despesa fixa (para o filtro Pedro/Giovanna). Rodar uma vez, depois do fixas.sql.
alter table fixas add column if not exists quem text;
