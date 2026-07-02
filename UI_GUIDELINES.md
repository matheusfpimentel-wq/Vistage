# UI_GUIDELINES.md — Diretrizes de UI do Vistage

Regras adotadas nos redesenhos recentes (Festas: Ideação · Viabilidade · Marketing ·
Execução · Concretização). Servem de referência daqui pra frente. **Não** reescreva
formulários existentes só por causa delas — **aplique quando tocar um formulário**,
mais as varreduras ativas descritas em "Varreduras" abaixo.

---

## 1. Superfície minimalista

- **Mínimo obrigatório na tela.** Só o que o usuário precisa preencher/decidir.
- **Inputs de 1 linha com auto-grow** em vez de textareas gigantes vazios. Use
  `AutoGrowInput` (`src/modules/parties/components/AutoGrowInput.tsx`) como
  referência: começa com 1 linha e cresce com o conteúdo.
- **Grid de 2 colunas** para campos curtos; empilha em telas estreitas
  (`grid gap-3 sm:grid-cols-2`).
- **Adição inline** (campo + Enter/＋ que adiciona e foca o próximo), não
  modal-sobre-modal.
- **Um clique por mudança de estado**: chips de status avançam ao clicar; itens
  sugeridos criam com um toque.

## 2. Explicações só atrás de "?"

- **Nenhum helper text impresso na tela.** Toda explicação de campo ou de cálculo
  (ex.: como o break-even é computado, o que é "acordo com a casa") vive num ícone
  **"?"** discreto ao lado do rótulo, revelado em tooltip/popover.
- Use `InfoHint` (`src/components/ui/tooltip.tsx`). A tela mostra **campos**, não
  texto corrido.
- **Exceções que podem ficar na tela** (estado ≠ explicação):
  - mensagens de estado ("Rascunho salvo automaticamente", contadores, erros);
  - avisos de **segurança** (ex.: o aviso da aba Backup).

## 3. Acordeão

- Blocos de uma etapa/seção em **acordeão — um aberto por vez**.
- Bloco **fechado mostra uma linha de resumo** (ex.: "4 peças · 1 atrasada",
  "5/7 confirmados · 1 atrasado", "Vai · empata com 54 pessoas").

## 4. Stepper de linha única

- Estágios/etapas viram um **stepper horizontal de uma linha só** que **nunca
  quebra** para a 2ª linha; o nome trunca (com tooltip) em telas apertadas.
- Cada segmento tem um ponto de status; clicar expande a etapa abaixo.

## 5. Tokens de urgência (fonte única)

- Urgência de prazo vem de **tokens únicos**, não de cores locais soltas:
  `src/lib/urgency.ts` — `vencido` (alerta/vermelho), `proximo` (âmbar), `ok`
  (neutro), com limiar default configurável por contexto (ex.: 48h GIG/prep,
  7 dias confirmações de festa).
- Ao renderizar um prazo, use `urgencyOf(date, { doneOrResolved, horizonDays })` +
  `urgencyClass(u)` em vez de recalcular datas e escolher cores na mão.

## 6. Fonte única de verdade

- **Dinheiro = Orçamento** (`party_budget_items`). Valores digitados em outras abas
  (patrocínio, produção, cachê, acordo com a casa) criam/atualizam itens no
  Orçamento e são exibidos **read-through** onde aparecem.
- **Capacidade** da festa mora em um lugar (Info/Viabilidade) e é lida pelo cockpit,
  break-even e mensuração.
- **Status/confirmação** vive no próprio registro (ex.: membro da Equipe), não é
  redigitado em outra etapa; a outra etapa exibe o mesmo chip.

## 7. Política de salvamento (nenhum modal perde alteração)

- Ordem de preferência:
  1. **Autosave de rascunho** (padrão do Debrief de GIGs) onde o custo for baixo;
     ou painéis que **persistem cada mudança na hora** (padrão dos painéis de etapa
     das Festas — trocar de etapa não perde nada).
  2. Senão, **aviso ao fechar/trocar** com mudanças não salvas.
- Aplica-se a: modal de festa (todas as abas), Editar GIG, Editar track, Reuniões.

## 8. Migrations & dados

- **Migrations aditivas** (nunca destrutivas): `ALTER TABLE ... ADD COLUMN` e
  `CREATE TABLE IF NOT EXISTS`, idempotentes (o runner pré-filtra ADD COLUMN
  existente). Uma versão por passo, sequencial.
- Toda tabela/coluna nova viaja no backup/restore/clear/CSV — como o backup usa
  `SELECT *` e `Object.keys(row)`, colunas novas viajam sozinhas; **tabelas** novas
  precisam entrar no array `TABLES` de `src/lib/backup.ts` (pais antes de filhos).
- **Backfill preserva tudo**: ao migrar um campo antigo, mova o texto para as Notas
  (ou converta em itens/tarefas) **antes** de criar linhas novas, guardado por um
  flag `_..._migrated` + guarda de concorrência. Nada se perde.

---

## Varreduras ativas (fazer, não só "quando tocar")

- **A.1 — "?"**: migrar helper texts impressos para ícone "?" por módulo, em passes
  pequenos (um módulo por commit): GIGs, Produção Musical, Aulas, Conteúdo,
  Reuniões, Configurações. Manter na tela apenas mensagens de estado/segurança.
- **A.2 — urgência**: substituir cores/limiares locais pelos tokens de
  `src/lib/urgency.ts` em tarefas (desktop e mobile), prep/debrief de GIGs,
  confirmações/formalidades de festas e peças/ações de marketing.
- **A.3 — salvamento**: garantir autosave ou aviso de não-salvo nos modais listados
  em §7.
