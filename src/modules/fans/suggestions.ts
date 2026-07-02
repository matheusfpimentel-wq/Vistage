// Regras das SUGESTÕES automáticas que alimentam a aba "Próximas ações".
// Não são tabela nem regras editáveis: são a lógica embutida que decide quem
// aparece em cada balde (agradecer, convidar, parabenizar, reativar,
// aniversários, boas-vindas). Ficam aqui como FONTE ÚNICA pra:
//  - a UI de Próximas ações (FanTodayView) rotular os baldes; e
//  - o diálogo "Ações programadas" mostrar cada regra de forma explícita
//    (transparência: o usuário vê o "se… então…" por trás de cada sugestão).

/** Chave de cada sugestão — casa 1:1 com as chaves de FanTodayBuckets. */
export type FanSuggestionKey =
  | "agradecer"
  | "convidar"
  | "parabenizar"
  | "reativar"
  | "aniversarios"
  | "boasVindas";

export type FanSuggestionRule = {
  key: FanSuggestionKey;
  /** Título do balde / da regra. */
  title: string;
  /** "Se…" — condição que faz o fã aparecer nesta sugestão. */
  when: string;
  /** "Então…" — o que a sugestão propõe. */
  then: string;
};

// A ORDEM aqui define a ordem dos baldes em Próximas ações e das regras no
// diálogo. Mantida igual à ordem histórica dos baldes.
export const FAN_SUGGESTION_RULES: FanSuggestionRule[] = [
  {
    key: "agradecer",
    title: "Agradecer presença",
    when: "Esteve num show nos últimos 21 dias e ainda não teve retorno.",
    then: "Sugere agradecer a presença (vira tarefa).",
  },
  {
    key: "convidar",
    title: "Convidar pro próximo show",
    when: "Esteve num show recente e há uma próxima GIG marcada.",
    then: "Sugere convidar pro próximo show (vira tarefa).",
  },
  {
    key: "parabenizar",
    title: "Parabenizar",
    when: "Subiu de nível nos últimos 14 dias.",
    then: "Sugere parabenizar pela evolução (vira tarefa).",
  },
  {
    key: "reativar",
    title: "Reativar",
    when: "Fã, Superfã ou Embaixador sem contato há 30+ dias.",
    then: "Sugere reativar o contato (vira tarefa).",
  },
  {
    key: "aniversarios",
    title: "Aniversários",
    when: "Aniversário nos próximos 7 dias (contato vinculado).",
    then: "Sugere mensagem de aniversário (vira tarefa).",
  },
  {
    key: "boasVindas",
    title: "Boas-vindas",
    when: "Fã novo, sem nenhuma interação ainda.",
    then: "Sugere dar boas-vindas (vira tarefa).",
  },
];
