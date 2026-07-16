import { useEffect, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Flame,
  ListChecks,
  Snowflake,
  Sparkles,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { formatDate, toLocalISODate } from "@/lib/format";
import { loadCoolingAlerts } from "@/modules/revisao/cooling";
import type { AlertItem } from "@/modules/revisao/alerts";
import { listIdeas } from "@/modules/ideas/api";
import type { Idea } from "@/modules/ideas/types";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { listOkrs, updateOkr, type Okr } from "@/modules/objetivos/api";
import {
  getJournal,
  getPriorities,
  listOverdueTasks,
  saveJournal,
  setPriorities,
  todayISO,
  weekMondayISO,
  type OpenTask,
} from "./api";

const SLOTS = 3;
const HOT_MIN = 4; // calor efetivo ≥ 4 = esquentando/quente

const STEPS = [
  { key: "atrasadas", title: "Atrasadas", icon: ListChecks },
  { key: "esfriando", title: "Esfriando", icon: Snowflake },
  { key: "ideias", title: "Ideias quentes", icon: Flame },
  { key: "gigs", title: "GIGs da semana", icon: CalendarClock },
  { key: "kr", title: "Check-in de KR", icon: Target },
  { key: "top3", title: "Top 3 da semana", icon: Sparkles },
] as const;

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>;
}

/**
 * Revisão semanal guiada (~10 min): um passo por vez — atrasadas → esfriando →
 * ideias quentes → GIGs da semana → 1 check-in de KR → Top 3 da semana. Cada
 * passo mostra os dados reais (reusa os helpers existentes) e deixa agir; fecha
 * gravando o Top 3 da semana + 1 nota de revisão. Base: revisão semanal do GTD.
 */
export function WeeklyReviewDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [overdue, setOverdue] = useState<OpenTask[]>([]);
  const [cooling, setCooling] = useState<AlertItem[]>([]);
  const [hotIdeas, setHotIdeas] = useState<Idea[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [okrs, setOkrs] = useState<Okr[]>([]);
  const [slots, setSlots] = useState<string[]>(Array.from({ length: SLOTS }, () => ""));
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingKr, setSavingKr] = useState(false);

  const week = weekMondayISO();

  async function loadOkrs() {
    setOkrs(await listOkrs());
  }

  useEffect(() => {
    if (!open) return;
    setStep(0);
    void (async () => {
      const today = todayISO();
      const end = new Date();
      end.setDate(end.getDate() + 7);
      const [ov, cool, ideas, gg, okr, existing, journal] = await Promise.all([
        listOverdueTasks(),
        loadCoolingAlerts(),
        listIdeas(),
        listGigs({ fromDate: today, toDate: toLocalISODate(end) }),
        listOkrs(),
        getPriorities("week", week),
        getJournal("week", week),
      ]);
      setOverdue(ov);
      setCooling(cool);
      setHotIdeas(
        ideas.filter((i) => (i.currentHeat ?? i.heat) >= HOT_MIN).slice(0, 8)
      );
      setGigs(gg);
      setOkrs(okr);
      const next = Array.from({ length: SLOTS }, () => "");
      existing.slice(0, SLOTS).forEach((p, i) => (next[i] = p.title));
      setSlots(next);
      setReflection(journal);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function updateKrCurrent(okr: Okr, krIndex: number, value: number) {
    setSavingKr(true);
    try {
      const key_results = okr.key_results.map((kr, i) =>
        i === krIndex ? { ...kr, current: value } : kr
      );
      await updateOkr({
        id: okr.id,
        quarter: okr.quarter,
        objective: okr.objective,
        key_results,
      });
      await loadOkrs();
    } catch (e) {
      toast.error(`Não consegui salvar o KR: ${String(e)}`);
    } finally {
      setSavingKr(false);
    }
  }

  async function handleFinish() {
    setSaving(true);
    try {
      await setPriorities(
        "week",
        week,
        slots.map((title) => ({ title: title.trim() })).filter((s) => s.title)
      );
      await saveJournal("week", week, reflection.trim());
      toast.success("Semana revisada. Top 3 da semana definido.");
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao fechar a revisão: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" /> Revisão da semana
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {step + 1} de {STEPS.length}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Trilha de passos */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                "h-1 flex-1 rounded-full",
                i <= step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        <div className="min-h-[220px] py-2">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <current.icon className="h-4 w-4 text-muted-foreground" /> {current.title}
          </div>

          {current.key === "atrasadas" &&
            (overdue.length === 0 ? (
              <EmptyLine>Nada atrasado. 👏</EmptyLine>
            ) : (
              <ul className="space-y-1">
                {overdue.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border bg-card/40 px-2.5 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {t.due_date && (
                      <span className="shrink-0 text-xs text-red-500">{formatDate(t.due_date)}</span>
                    )}
                  </li>
                ))}
                <li className="pt-1 text-right">
                  <Link to="/tarefas" className="text-xs text-primary hover:underline">
                    Abrir Tarefas →
                  </Link>
                </li>
              </ul>
            ))}

          {current.key === "esfriando" &&
            (cooling.length === 0 ? (
              <EmptyLine>Nada esfriando agora. Tudo aquecido. 🔥</EmptyLine>
            ) : (
              <ul className="space-y-1">
                {cooling.map((a) => (
                  <li key={a.key}>
                    <Link
                      to={a.to}
                      className="flex items-center gap-2 rounded-md border bg-card/40 px-2.5 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <Snowflake className="h-4 w-4 shrink-0 text-sky-400" />
                      <span className="min-w-0 flex-1 truncate">{a.label}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            ))}

          {current.key === "ideias" &&
            (hotIdeas.length === 0 ? (
              <EmptyLine>Sem ideias quentes no radar. Que tal colidir duas?</EmptyLine>
            ) : (
              <ul className="space-y-1">
                {hotIdeas.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center gap-2 rounded-md border bg-card/40 px-2.5 py-1.5 text-sm"
                  >
                    <Flame className="h-4 w-4 shrink-0 text-orange-500" />
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    {i.category && (
                      <span className="shrink-0 text-xs text-muted-foreground">{i.category}</span>
                    )}
                  </li>
                ))}
                <li className="pt-1 text-right">
                  <Link to="/ideias" className="text-xs text-primary hover:underline">
                    Abrir Ideias →
                  </Link>
                </li>
              </ul>
            ))}

          {current.key === "gigs" &&
            (gigs.length === 0 ? (
              <EmptyLine>Nenhuma GIG nos próximos 7 dias.</EmptyLine>
            ) : (
              <ul className="space-y-1">
                {gigs.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center gap-2 rounded-md border bg-card/40 px-2.5 py-1.5 text-sm"
                  >
                    <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{gigDisplayName(g)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(g.date)}</span>
                  </li>
                ))}
              </ul>
            ))}

          {current.key === "kr" &&
            (okrs.length === 0 ? (
              <EmptyLine>
                Nenhum OKR neste trimestre.{" "}
                <Link to="/objetivos" className="text-primary hover:underline">
                  Definir
                </Link>
              </EmptyLine>
            ) : (
              <div className="space-y-3">
                {okrs.map((okr) => (
                  <div key={okr.id} className="rounded-md border p-2.5">
                    <div className="mb-1.5 truncate text-sm font-medium">{okr.objective}</div>
                    <div className="space-y-1.5">
                      {okr.key_results.map((kr, ki) => {
                        const pct = kr.target > 0 ? Math.min(100, Math.round((kr.current / kr.target) * 100)) : 0;
                        const manual = kr.metric_source === "manual";
                        return (
                          <div key={kr.id} className="text-xs">
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate">{kr.description}</span>
                              {manual ? (
                                <Input
                                  type="number"
                                  defaultValue={kr.current}
                                  disabled={savingKr}
                                  className="h-7 w-20 text-right"
                                  onBlur={(e) => {
                                    const v = Number(e.target.value);
                                    if (!Number.isNaN(v) && v !== kr.current) {
                                      void updateKrCurrent(okr, ki, v);
                                    }
                                  }}
                                />
                              ) : (
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                  {kr.current}/{kr.target} {kr.unit}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  KRs manuais dá pra atualizar aqui; os automáticos se atualizam sozinhos.
                </p>
              </div>
            ))}

          {current.key === "top3" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">O que move a agulha nesta semana?</Label>
                {slots.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        s.trim() ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {i + 1}
                    </span>
                    <Input
                      value={s}
                      placeholder="Uma prioridade da semana…"
                      onChange={(e) =>
                        setSlots((sl) => sl.map((x, idx) => (idx === i ? e.target.value : x)))
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Nota da revisão (opcional)</Label>
                <Input
                  value={reflection}
                  placeholder="Um aprendizado, um ajuste, um foco…"
                  onChange={(e) => setReflection(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Button>
          {isLast ? (
            <Button onClick={() => void handleFinish()} disabled={saving}>
              <ClipboardCheck className="h-4 w-4" /> Concluir revisão
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Avançar <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
