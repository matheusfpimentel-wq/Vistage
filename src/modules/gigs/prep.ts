/**
 * Checklist de preparação fixo por GIG. A lista mora aqui pra ser
 * consistente entre formulário, dashboard e visualizações. O estado
 * de cada item é serializado como JSON em `gigs.prep_state`.
 */
export type PrepItem = {
  id: string;
  label: string;
};

export type PrepGroup = {
  id: string;
  title: string;
  items: PrepItem[];
};

export const PREP_GROUPS: PrepGroup[] = [
  {
    id: "musical",
    title: "Preparação Musical",
    items: [
      { id: "set-analisado", label: "Set analisado" },
      { id: "tagging", label: "Tagging" },
      { id: "hot-cues", label: "Hot cues" },
      { id: "set-exportado", label: "Set exportado" },
      { id: "rider-confirmado", label: "Rider confirmado" },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    items: [
      { id: "flyers-recebidos", label: "Flyers e mídias recebidos" },
      { id: "stories-publicado", label: "Stories publicado" },
      { id: "fas-acionados", label: "Fãs acionados" },
    ],
  },
  {
    id: "logistica",
    title: "Logística",
    items: [
      { id: "equip-carregados", label: "Equipamentos carregados (fone, Phase, powerbank)" },
      { id: "backup-separado", label: "Backup separado" },
      { id: "timetable-recebida", label: "Timetable recebida" },
      { id: "outfit-escolhido", label: "Outfit escolhido" },
      { id: "check-equipamentos", label: "Check geral de equipamentos" },
    ],
  },
];

export const PREP_ITEMS: PrepItem[] = PREP_GROUPS.flatMap((g) => g.items);

/** Parse seguro do JSON salvo em prep_state. */
export function parsePrepState(raw: string | null): Record<string, 1> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, 1>) : {};
  } catch {
    return {};
  }
}

export type PrepProgress = { done: number; total: number };

export function prepProgress(state: Record<string, 1>): PrepProgress {
  const total = PREP_ITEMS.length;
  const done = PREP_ITEMS.filter((it) => state[it.id] === 1).length;
  return { done, total };
}

export function prepProgressByGroup(
  state: Record<string, 1>
): { group: PrepGroup; progress: PrepProgress }[] {
  return PREP_GROUPS.map((group) => {
    const total = group.items.length;
    const done = group.items.filter((it) => state[it.id] === 1).length;
    return { group, progress: { done, total } };
  });
}
