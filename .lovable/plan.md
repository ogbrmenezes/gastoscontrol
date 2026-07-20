# Sistema de Controle de Gastos

App mobile-first para lançar gastos rapidamente pelo celular, com leitura de foto (OCR via IA), categorização, dashboards e alertas.

## Funcionalidades

**1. Login / conta pessoal**
- Cadastro e login por e-mail e senha (Lovable Cloud)
- Cada usuário vê só os próprios gastos (RLS)

**2. Fluxo rápido "algum gasto hoje?"**
- Tela inicial mobile-first pergunta se houve gasto
- Duas opções:
  - **Tirar/enviar foto** do cupom, nota ou tela → IA lê valor, estabelecimento e sugere categoria automaticamente (Lovable AI, modelo com visão)
  - **Digitar manualmente** valor + descrição
- Seleção de categoria: Fast food, Lifestyle, Casa (aluguel, água, luz), Transporte (Uber, combustível), Cartão de crédito, Outros (editável)
- Marcar se é gasto no cartão de crédito (entra na fatura)

**3. Dashboards**
- Visão **mensal**: total gasto, gráfico por categoria (pizza), evolução por dia (linha), comparação com mês anterior
- Visão **anual**: total por mês (barras), top categorias do ano
- Filtros por categoria e período

**4. Orçamentos e alertas**
- Definir **limite mensal geral** (valor livre de uso)
- Definir **limite da fatura do cartão**
- Quando o gasto acumulado passa de 80% e 100% do limite → alerta

**5. Alertas no WhatsApp**
- Integração via **webhook do Zapier** (usuário cola a URL do webhook nas configurações)
- Zap conecta no WhatsApp (Twilio, WATI ou similar do lado do Zapier)
- Dispara mensagens tipo:
  - "Você já usou 80% do seu limite mensal (R$ 2.400 de R$ 3.000)"
  - "Sua fatura do cartão ultrapassou R$ X"
- Verificação roda toda vez que um gasto é lançado

## Detalhes técnicos

- **Stack**: TanStack Start + Lovable Cloud (Postgres + Auth + Storage)
- **OCR/leitura da foto**: Lovable AI Gateway com `google/gemini-2.5-flash` (aceita imagem, retorna JSON estruturado: valor, comerciante, data, categoria sugerida)
- **Tabelas**:
  - `categories` (id, user_id, name, icon, color)
  - `expenses` (id, user_id, amount, category_id, description, spent_at, is_credit_card, receipt_url, created_at)
  - `budgets` (id, user_id, type: 'monthly'|'credit_card', limit_amount, month)
  - `user_settings` (user_id, zapier_webhook_url, alert_threshold_pct)
- **Storage bucket** `receipts` para fotos
- **Server function** `analyzeReceipt` (chama Lovable AI com a imagem)
- **Server function** `checkBudgetAndNotify` (roda após criar gasto; se passou do limite, faz POST no webhook do Zapier)
- Categorias-padrão criadas automaticamente no primeiro login

## O que você precisa depois

- Criar um **Zap no Zapier** com trigger "Webhooks by Zapier → Catch Hook" e ação "WhatsApp / Twilio → Send Message". Colar a URL do webhook nas configurações do app.

## Escopo desta primeira entrega

Tudo acima em uma primeira versão funcional. Se preferir, posso começar só pelo lançamento + OCR + dashboard e deixar alertas/WhatsApp para uma segunda etapa — mas por padrão vou entregar o pacote completo.
