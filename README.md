# BANKAI

Controle de caixa pessoal: entradas, gastos, cartões com limite e fatura, metas, orçamento,
leitura de comprovante e extrato. React + Vite + Tailwind + Supabase. Cadastro livre: qualquer
pessoa cria conta e usa, sem liberação.

## Rodar no seu computador

1. `npm install`
2. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   (Supabase: Project Settings > API).
3. `npm run dev` e abra o endereço que aparecer no terminal.

## Montar o banco (Supabase), uma vez

1. SQL Editor > New query: cole o arquivo `supabase/schema.sql` inteiro e toque em Run.
   Pode rodar de novo sem problema e não apaga dados.
2. Authentication > Providers > Email: desligue **Confirm email** para a conta nova entrar na hora.
   Se deixar ligado, a pessoa precisa clicar no link que chega no e-mail antes de entrar.
3. Authentication > URL Configuration: coloque o endereço do app em **Site URL**
   (necessário para o link de "Esqueci a senha" voltar para o app).

## Publicar na Vercel

1. Importe o repositório. Framework Preset: **Vite** (sem comandos personalizados).
2. Em Environment Variables, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Opcional, leitura de comprovante por IA (qualquer banco): `ANTHROPIC_API_KEY`.
   Sem ela, o app lê comprovantes pelo OCR do navegador.
4. Deploy. Para instalar no celular, abra o link no Chrome e use "Adicionar à tela inicial".
   Depois de instalado, dá para compartilhar comprovantes direto do app do banco para o BANKAI.

## Onde fica cada coisa

- `src/auth/`: login, cadastro, recuperar senha e sessão.
- `src/lib/finance/`: regras do caixa (`logic.ts`), leitura de comprovante (`parser.ts`),
  gravação no Supabase (`api.ts`), Caixa de Entrada (`inbox.ts`).
- `src/components/finance/`: telas.
- `api/ler-comprovante.js`: leitura por IA (só para quem está logado).
- `supabase/schema.sql`: banco de dados.
- `public/sw.js` e `public/manifest.webmanifest`: app instalável e recebimento de compartilhamento.

## Testes

`npm test` roda os testes do leitor de comprovante e das regras do caixa.
