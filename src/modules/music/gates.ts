import type { Stage } from "./stages";

// Gates decisórios entre stages (Stage-Gate, Cooper). Cada gate tem
// critérios objetivos que precisam ser preenchidos pra decidir avançar.
// Reprovar num gate manda a track pro estado Stand-by (reativável) —
// reduz o custo emocional da decisão e enfrenta o viés de sunk-cost
// (Kahneman), em vez de "Cancelar".

type GateFieldType = "boolean" | "tri" | "scale" | "number" | "select" | "text";

export type GateField = {
  key: string;
  label: string;
  type: GateFieldType;
  options?: string[];
  hint?: string;
};

export type Gate = {
  id: string;
  /** Gate dispara ao tentar avançar A PARTIR deste stage. */
  afterStage: Stage;
  title: string;
  question: string;
  /** Mostra a paleta/briefing da Identidade Artística como referência. */
  showIdentity?: boolean;
  fields: GateField[];
};

export const GATES: Gate[] = [
  {
    id: "gate1",
    afterStage: "Composição",
    title: "Gate 1: Vale produzir?",
    question: "Essa composição merece virar uma produção completa?",
    showIdentity: true,
    fields: [
      {
        key: "fit_identity",
        label: "Fit com a identidade artística",
        type: "boolean",
        hint: "Compare com a paleta/briefing ao lado.",
      },
      { key: "tech_viability", label: "Viabilidade técnica", type: "tri" },
      { key: "originality", label: "Originalidade percebida", type: "scale" },
      {
        key: "self_interest",
        label: "Nível de interesse próprio agora",
        type: "scale",
      },
    ],
  },
  {
    id: "gate3",
    afterStage: "Master",
    title: "Gate de Lançamento: Momento certo?",
    question: "É o momento certo pra lançar?",
    fields: [
      {
        key: "energy",
        label: "Energia da track (1-5)",
        type: "scale",
      },
      {
        key: "market_timing",
        label: "Timing de mercado",
        type: "select",
        options: ["favorável", "neutro", "desfavorável"],
      },
      {
        key: "personal_calendar",
        label: "Calendário pessoal nos próximos 60 dias",
        type: "select",
        options: ["livre", "apertado", "inviável"],
      },
      { key: "partnerships", label: "Parcerias confirmadas", type: "boolean" },
    ],
  },
  {
    id: "gate4",
    afterStage: "Pós-lançamento",
    title: "Gate 4: Manter promovendo?",
    question: "Vale seguir investindo em promoção (3 meses pós-lançamento)?",
    fields: [
      { key: "roi_current", label: "ROI atual", type: "text" },
      { key: "organic_traction", label: "Tração orgânica", type: "scale" },
      {
        key: "open_opportunities",
        label: "Oportunidades abertas",
        type: "text",
      },
    ],
  },
];

export function gateAfter(stage: Stage): Gate | null {
  return GATES.find((g) => g.afterStage === stage) ?? null;
}

export type GateCriteria = Record<string, string | number | boolean | null>;

export type GateDecisionRecord = {
  gate_id: string;
  decision: "approved" | "rejected";
  criteria: GateCriteria;
  decided_at: string;
};

/** Todos os campos precisam estar preenchidos pra registrar a decisão. */
export function gateCriteriaComplete(gate: Gate, criteria: GateCriteria): boolean {
  return gate.fields.every((f) => {
    const v = criteria[f.key];
    return v !== null && v !== undefined && v !== "";
  });
}
