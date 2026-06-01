import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  CheckSquare,
  CircleDot,
  Clock,
  Disc3,
  ExternalLink,
  Film,
  Music,
  PartyPopper,
  Square,
  Star,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatRating, todayISO } from "@/lib/format";
import { loadWeekStats, loadFocusTasks, type WeekStats, type FocusTask } from "./api";
import { priorityVariant } from "@/modules/tasks/types";
import { listOkrs, okrProgress, type Okr } from "@/modules/objetivos/api";
import { countPendingOutcomes } from "@/modules/decisoes/api";
import { listHighlights, type Highlight } from "@/modules/foco/api";
import { toast } from "@/components/ui/toaster";
import { getDb } from "@/lib/db";

function weekLabel(): string {
  const today = new Date(todayISO());
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

const CHECKLIST_ITEMS = [
  { id: "ideias", label: "Banco de Ideias revisado", to: "/ideias", desc: "Mover ideias esquecidas, capturar novas" },
  { id: "tarefas", label: "Tarefas da semana revisadas", to: "/tarefas", desc: "Concluídas, atrasadas, próximas" },
  { id: "okrs", label: "OKRs em dia", to: "/objetivos", desc: "Atualizar key results manuais" },
  { id: "financeiro", label: "Financeiro conferido", to: "/financeiro", desc: "Transações, receitas, contas a pagar" },
  { id: "decisoes", label: "Decision Log atualizado", to: "/decisoes", desc: "Preencher outcomes de decisões antigas" },
  { id: "insights", label: "Insights consolidados", to: "/insights", desc: "Revisar aprendizados da semana" },
] as const;

type ChecklistId = (typeof CHECKLIST_ITEMS)[number]["id"];

async function loadChecklist(weekKey: string): Promise<Set<ChecklistId>> {
  const db = getDb();
  try {
    const rows = await db.select<{ value: string }[]>(
      `SELECT value FROM app_settings WHERE key=$1`,
      [`weekly_review_${weekKey}`]
    );
    if (rows[0]?.value) {
      return new Set(JSON.parse(rows[0].value) as ChecklistId[]);
    }
  } catch { /* ignore */ }
  return new Set();
}

async function saveChecklist(weekKey: string, checked: Set<ChecklistId>): Promise<void> {
  const db = getDb();
  const val = JSON.stringify([...checked]);
  await db.execute(
    `INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)`,
    [`weekly_review_${weekKey}`, val]
  );
}

function weekKey(): string {
  const today = new Date(todayISO());
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export function RevisaoPage() {
  const [stats, setStats] = useState<WeekStats | null>(null);
  const [focus, setFocus] = useState<FocusTask[]>([]);
  const [okrs, setOkrs] = useState<Okr[]>([]);
  const [pendingDecisions, setPendingDecisions] = useState(0);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [checked, setChecked] = useState<Set<ChecklistId>>(new Set());
  const wk = weekKey();

  const load = useCallback(async () => {
    const [s, f, o, pd, hl, ck] = await Promise.all([
      loadWeekStats(),
      loadFocusTasks(),
      listOkrs(),
      countPendingOutcomes(),
      listHighlights(),
      loadChecklist(wk),
    ]);
    setStats(s);
    setFocus(f);
    setOkrs(o.slice(0, 3));
    setPendingDecisions(pd);
    setHighlights(hl.slice(0, 5));
    setChecked(ck);
  }, [wk]);

  useEffect(() => { void load(); }, [load]);

  async function toggleCheck(id: ChecklistId) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
    await saveChecklist(wk, next);
    if (next.size === CHECKLIST_ITEMS.length) {
      toast.success("Revisão semanal completa! 🎯");
    }
  }

  const allDone = checked.size === CHECKLIST_ITEMS.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Revisão Semanal</h2>
        <p className="text-sm text-muted-foreground">{weekLabel()}</p>
      </div>

      {stats ? (
        <>
          <StatsGrid stats={stats} />

          <div className="grid gap-4 lg:grid-cols-2">
            <ChecklistCard
              checked={checked}
              onToggle={toggleCheck}
              allDone={allDone}
            />
            <FocusTasksCard tasks={focus} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AlertsCard stats={stats} pendingDecisions={pendingDecisions} />
            <OkrsCard okrs={okrs} />
          </div>

          {highlights.length > 0 && <HighlightsCard highlights={highlights} />}

          <ReflectionPrompts />
        </>
      ) : (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      )}
    </div>
  );
}

function StatsGrid({ stats }: { stats: WeekStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<Disc3 className="h-4 w-4 text-primary" />}
        label="GIGs na semana"
        value={stats.gigsThisWeek.toString()}
        to="/gigs"
        sub={stats.avgGigRating !== null ? `Média: ${formatRating(stats.avgGigRating)}` : "Sem avaliações"}
      />
      <StatCard
        icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
        label="Tarefas concluídas"
        value={stats.tasksCompleted.toString()}
        to="/tarefas"
        sub={`${stats.tasksPending} pendentes · ${stats.tasksOverdue} atrasadas`}
        highlight={stats.tasksOverdue > 0 ? "amber" : undefined}
      />
      <StatCard
        icon={<Film className="h-4 w-4 text-emerald-400" />}
        label="Conteúdos publicados"
        value={stats.contentPublished.toString()}
        to="/conteudo"
        sub={`${stats.contentInProgress} em produção`}
      />
      <StatCard
        icon={<Music className="h-4 w-4 text-primary" />}
        label="Tracks ativas"
        value={stats.tracksActive.toString()}
        to="/musica"
        sub={stats.tracksStalled > 0 ? `${stats.tracksStalled} paradas >30d` : "Pipeline fluindo"}
        highlight={stats.tracksStalled > 0 ? "amber" : undefined}
      />
    </div>
  );
}

function StatCard({
  icon, label, value, to, sub, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  to: string;
  sub?: string;
  highlight?: "amber";
}) {
  return (
    <Link to={to} className="block">
      <Card className={cn("h-full transition hover:border-primary", highlight === "amber" && "border-amber-500/30 bg-amber-500/5")}>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5 text-xs">{icon}{label}</CardDescription>
          <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        </CardHeader>
        {sub && (
          <CardContent className="pt-0">
            <p className={cn("text-xs", highlight === "amber" ? "text-amber-500" : "text-muted-foreground")}>{sub}</p>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}

function ChecklistCard({
  checked,
  onToggle,
  allDone,
}: {
  checked: Set<ChecklistId>;
  onToggle: (id: ChecklistId) => void;
  allDone: boolean;
}) {
  return (
    <Card className={cn(allDone && "border-emerald-500/40")}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckSquare className={cn("h-4 w-4", allDone ? "text-emerald-400" : "text-primary")} />
          Checklist da revisão
        </CardTitle>
        <CardDescription>
          {checked.size}/{CHECKLIST_ITEMS.length} itens concluídos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {CHECKLIST_ITEMS.map((item) => {
          const done = checked.has(item.id);
          return (
            <div key={item.id} className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-input hover:border-primary"
                )}
                aria-label={done ? "Desmarcar" : "Marcar como feito"}
              >
                {done && <CheckCircle2 className="h-3 w-3" />}
                {!done && <Square className="h-3 w-3 opacity-0" />}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm", done && "line-through text-muted-foreground")}>
                    {item.label}
                  </span>
                  <Link to={item.to} className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          );
        })}
        {allDone && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Revisão completa! Boa semana. 🎯
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FocusTasksCard({ tasks }: { tasks: FocusTask[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleDot className="h-4 w-4 text-primary" />
          Foco da próxima semana
        </CardTitle>
        <CardDescription>Alta prioridade ou vencendo em 7 dias.</CardDescription>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nenhuma tarefa urgente. Ótimo sinal!
          </div>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((t) => (
              <Link
                key={t.id}
                to="/tarefas"
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition hover:border-primary"
              >
                <span className="flex-1 truncate">{t.title}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {t.due_date && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      <Clock className="mr-0.5 inline h-3 w-3" />{t.due_date.slice(5)}
                    </span>
                  )}
                  <Badge variant={priorityVariant(t.priority as never)} className="text-[10px]">
                    {t.priority}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Link to="/tarefas" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
            Ver todas as tarefas →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertsCard({ stats, pendingDecisions }: { stats: WeekStats; pendingDecisions: number }) {
  const alerts: { icon: React.ReactNode; label: string; to: string }[] = [];

  if (stats.pendingDebriefs > 0)
    alerts.push({ icon: <Star className="h-3.5 w-3.5 text-amber-500" />, label: `${stats.pendingDebriefs} debrief${stats.pendingDebriefs > 1 ? "s" : ""} de GIG pendente${stats.pendingDebriefs > 1 ? "s" : ""}`, to: "/gigs" });
  if (stats.tasksOverdue > 0)
    alerts.push({ icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />, label: `${stats.tasksOverdue} tarefa${stats.tasksOverdue > 1 ? "s" : ""} atrasada${stats.tasksOverdue > 1 ? "s" : ""}`, to: "/tarefas" });
  if (stats.tracksStalled > 0)
    alerts.push({ icon: <Music className="h-3.5 w-3.5 text-amber-500" />, label: `${stats.tracksStalled} track${stats.tracksStalled > 1 ? "s" : ""} parada${stats.tracksStalled > 1 ? "s" : ""} há +30 dias`, to: "/musica" });
  if (stats.partiesConfirmed === 0)
    alerts.push({ icon: <PartyPopper className="h-3.5 w-3.5 text-muted-foreground" />, label: "Nenhuma festa confirmada à frente", to: "/festas" });
  if (pendingDecisions > 0)
    alerts.push({ icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />, label: `${pendingDecisions} decisão${pendingDecisions > 1 ? "ões" : ""} aguardando avaliação de outcome`, to: "/decisoes" });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="h-4 w-4 text-primary" />
          Pontos de atenção
        </CardTitle>
        <CardDescription>Itens que precisam de ação esta semana.</CardDescription>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Tudo em ordem — nenhum ponto crítico no radar.
          </div>
        ) : (
          <div className="space-y-1.5">
            {alerts.map((a, i) => (
              <Link key={i} to={a.to} className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm transition hover:border-amber-500/50">
                {a.icon}
                <span>{a.label}</span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OkrsCard({ okrs }: { okrs: Okr[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleDot className="h-4 w-4 text-primary" />
          OKRs ativos
        </CardTitle>
        <CardDescription>Progresso dos objetivos do trimestre.</CardDescription>
      </CardHeader>
      <CardContent>
        {okrs.length === 0 ? (
          <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Nenhum OKR. <Link to="/objetivos" className="text-primary hover:underline">Criar →</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {okrs.map((o) => {
              const pct = Math.round(okrProgress(o) * 100);
              return (
                <div key={o.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{o.objective}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-primary/60")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3">
          <Link to="/objetivos" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
            Ver todos os OKRs →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function HighlightsCard({ highlights }: { highlights: Highlight[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-4 w-4 text-amber-400" />
          Highlights recentes
        </CardTitle>
        <CardDescription>Momentos marcantes da sua carreira.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {highlights.map((h) => (
            <div key={h.id} className="flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-400">
              <Star className="h-3 w-3" />
              <span>{h.title}</span>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Link to="/foco" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
            Ver todos os highlights →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

const PROMPTS = [
  "O que funcionou bem esta semana que vale repetir?",
  "O que te travou ou consumiu energia desnecessária?",
  "Qual decisão você tomou que se mostrou acertada?",
  "Que hábito ou processo você quer ajustar na próxima semana?",
  "Teve algum aprendizado criativo que merece registro nos Insights?",
];

function ReflectionPrompts() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Perguntas de reflexão</CardTitle>
        <CardDescription>Anote suas respostas em Insights ou no seu diário.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {PROMPTS.map((p, i) => (
            <li key={i} className="flex gap-2.5 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary">{i + 1}</span>
              <span className="text-muted-foreground">{p}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex gap-4">
          <Link to="/insights" className="text-xs text-primary underline-offset-2 hover:underline">Abrir Insights →</Link>
          <Link to="/decisoes" className="text-xs text-primary underline-offset-2 hover:underline">Registrar decisão →</Link>
        </div>
      </CardContent>
    </Card>
  );
}
