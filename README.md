# 💑 Finanças do Casal

App web (celular e computador) para o casal controlar o mês e juntar dinheiro em caixinhas
(casamento, viagem, reserva…). Os dados ficam no Supabase e só os e-mails do casal acessam.

- **Resumo do mês:** quanto entrou, saiu, foi guardado e sobrou; gastos por categoria e por pessoa.
- **Lançar:** gasto, entrada, guardar numa caixinha ou tirar dela.
- **Caixinhas:** meta, prazo, quanto falta e quanto guardar por mês para chegar lá.
- **Fixas:** aluguel, internet… cadastradas uma vez e lançadas sozinhas todo mês, com o total por mês.
- **Histórico:** lançamentos do mês, com quem lançou.

## Ligar o banco (uma vez)

1. Crie uma conta grátis em https://supabase.com e um projeto novo (região São Paulo).
2. **SQL Editor › New query:** cole o `supabase.sql`, troque os dois e-mails no final e clique em **Run**. Depois, numa nova query, rode o `fixas.sql`.
3. **Authentication › URL Configuration:** em *Site URL*, coloque o endereço do app no GitHub Pages.
4. **Project Settings › API:** copie a *Project URL* e a chave *anon public* para o `config.js`.
5. Cada um abre o app, toca em **Criar conta** com o e-mail cadastrado e confirma pelo link do e-mail.
6. Depois que os dois entrarem, desligue novos cadastros em **Authentication › Sign In / Providers ›
   Allow new users to sign up** (opcional: mesmo cadastrado, quem não está em `membros` não vê nada).

No celular, abra o endereço e use **Adicionar à tela inicial** para virar um app.
