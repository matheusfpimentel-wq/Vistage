import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ListOrdered, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
  createPartyRunsheetItem,
  deletePartyRunsheetItem,
  getPartyHousePending,
  listPartyRunsheet,
  reorderPartyRunsheet,
  setPartyHousePending,
  updatePartyRunsheetItem,
} from "../api";
import type { PartyRunsheetItem } from "../types";

type Performer = { id: number; name: string };
type RowPatch = Partial<Omit<PartyRunsheetItem, "id" | "party_id" | "created_at">>;

/**
 * Aba Operação / Dia D — o cronograma do dia (run-of-show): load-in, passagem de
 * som, portas, sets por DJ, last call, encerramento, load-out — amarrado ao
 * line-up. Mais um campo único de "pendências com a casa" (a casa resolve o
 * pesado na sua escala; aqui é só o que você precisa confirmar com ela).
 */

/** "HH:MM" → minutos desde a meia-noite; null se inválido. */
function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutos → "HH:MM" no relógio de 24h (envolve a meia-noite pra trás). */
function fmtHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function OperacaoTab({ partyId, performers }: { partyId: number; performers: Performer[] }) {
  const [rows, setRows] = useState<PartyRunsheetItem[]>([]);
  const [housePending, setHousePending] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [anchorTime, setAnchorTime] = useState("");

  // Cronograma reverso: recalcula os horários de trás pra frente pela duração de
  // cada item, pra tudo TERMINAR na hora-âncora (ex.: portas às 23h). O último
  // item acaba na âncora; cada anterior termina onde o próximo começa.
  async function reverseSchedule() {
    const anchor = parseHHMM(anchorTime);
    if (anchor == null) {
      toast.error("Informe a hora-âncora (ex.: 23:00)");
      return;
    }
    let cursor = anchor;
    const updates: { id: number; time: string; end_time: string }[] = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const dur = rows[i].duration_min ?? 0;
      const end = cursor;
      const start = cursor - dur;
      updates.push({ id: rows[i].id, time: fmtHHMM(start), end_time: fmtHHMM(end) });
      cursor = start;
    }
    try {
      for (const u of updates) {
        await updatePartyRunsheetItem(u.id, { time: u.time, end_time: u.end_time });
      }
      await reload();
      toast.success("Cronograma recalculado de trás pra frente.");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  const reload = useCallback(async () => {
    const [r, hp] = await Promise.all([listPartyRunsheet(partyId), getPartyHousePending(partyId)]);
    setRows(r);
    setHousePending(hp ?? "");
    setLoaded(true);
  }, [partyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function addRow() {
    try {
      await createPartyRunsheetItem({
        party_id: partyId,
        position: rows.length,
        time: null,
        end_time: null,
        title: "",
        performer_contact_id: null,
        notes: null,
        duration_min: null,
      });
      void reload();
    } catch (e) {
      toast.error(`Não consegui adicionar a linha: ${String(e)}`);
    }
  }

  async function seedFromLineup() {
    const have = new Set(rows.map((r) => r.performer_contact_id).filter(Boolean));
    const missing = performers.filter((p) => !have.has(p.id));
    if (missing.length === 0) {
      toast.info("O line-up já está no cronograma.");
      return;
    }
    let pos = rows.length;
    let added = 0;
    try {
      for (const p of missing) {
        await createPartyRunsheetItem({
          party_id: partyId,
          position: pos++,
          time: null,
          end_time: null,
          title: `Set — ${p.name}`,
          performer_contact_id: p.id,
          notes: null,
          duration_min: null,
        });
        added++;
      }
      toast.success(`${missing.length} set(s) adicionado(s) do line-up.`);
    } catch (e) {
      toast.error(`Adicionei ${added} de ${missing.length} set(s); o resto falhou: ${String(e)}`);
    } finally {
      void reload();
    }
  }

  async function patch(id: number, updates: RowPatch) {
    // Otimista primeiro (digitar fica responsivo); se a gravação falhar,
    // ressincroniza do banco para a tela não ficar mostrando o que não salvou.
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    try {
      await updatePartyRunsheetItem(id, updates);
    } catch (e) {
      toast.error(`Não consegui salvar a alteração no cronograma: ${String(e)}`);
      void reload();
    }
  }

  async function remove(id: number) {
    try {
      await deletePartyRunsheetItem(id);
    } catch (e) {
      toast.error(`Não consegui remover a linha: ${String(e)}`);
    } finally {
      void reload();
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[idx], next[j]] = [next[j], next[idx]];
    setRows(next);
    try {
      await reorderPartyRunsheet(next.map((r) => r.id));
    } catch (e) {
      toast.error(`Não consegui reordenar o cronograma: ${String(e)}`);
      void reload();
    }
  }

  async function saveHousePending() {
    try {
      await setPartyHousePending(partyId, housePending.trim() || null);
    } catch (e) {
      toast.error(`Não consegui salvar as pendências com a casa: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-5">
      {/* Run-of-show */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <ListOrdered className="h-4 w-4 text-primary" /> Cronograma do dia
          </h3>
          <div className="flex gap-1.5">
            {performers.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => void seedFromLineup()}>
                <Users className="mr-1 h-3.5 w-3.5" /> Sets do line-up
              </Button>
            )}
            <Button size="sm" onClick={() => void addRow()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Linha
            </Button>
          </div>
        </div>

        {!loaded ? null : rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Load-in · passagem de som · abertura de portas · sets por DJ · last call · encerramento · load-out.
            Comece em "Linha" ou puxe os "Sets do line-up".
          </p>
        ) : (
          <ul className="space-y-1">
            {rows.map((r, i) => (
              <li key={r.id} className="flex items-center gap-1.5 rounded-md border p-1.5">
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="text-muted-foreground/50 transition hover:text-foreground disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => void move(i, -1)}
                    title="Subir"
                    aria-label="Subir"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground/50 transition hover:text-foreground disabled:opacity-30"
                    disabled={i === rows.length - 1}
                    onClick={() => void move(i, 1)}
                    title="Descer"
                    aria-label="Descer"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
                <input
                  type="time"
                  value={r.time ?? ""}
                  onChange={(e) => void patch(r.id, { time: e.target.value || null })}
                  className="h-8 w-[84px] rounded border bg-background px-1.5 text-xs"
                  title="Início"
                />
                <span className="text-xs text-muted-foreground/50">→</span>
                <input
                  type="time"
                  value={r.end_time ?? ""}
                  onChange={(e) => void patch(r.id, { end_time: e.target.value || null })}
                  className="h-8 w-[84px] rounded border bg-background px-1.5 text-xs"
                  title="Fim"
                />
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={r.duration_min ?? ""}
                  placeholder="min"
                  onChange={(e) => void patch(r.id, { duration_min: e.target.value ? Number(e.target.value) : null })}
                  className="h-8 w-[56px] rounded border bg-background px-1.5 text-xs"
                  title="Duração (min): base do cronograma reverso"
                />
                <input
                  value={r.title}
                  placeholder="O que acontece"
                  onChange={(e) => void patch(r.id, { title: e.target.value })}
                  className="h-8 flex-1 rounded border bg-background px-2 text-sm"
                />
                <select
                  value={r.performer_contact_id ?? ""}
                  onChange={(e) =>
                    void patch(r.id, { performer_contact_id: e.target.value ? Number(e.target.value) : null })
                  }
                  className="h-8 w-[130px] rounded border bg-background px-1 text-xs"
                  title="Quem"
                >
                  <option value="">Quem?</option>
                  {performers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void remove(r.id)}
                  className="text-muted-foreground transition hover:text-destructive"
                  title="Remover linha"
                  aria-label="Remover linha"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cronograma reverso — recalcula os horários pra trás a partir da âncora */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-2">
          <span className="text-xs font-medium">Cronograma reverso</span>
          <input
            type="time"
            value={anchorTime}
            onChange={(e) => setAnchorTime(e.target.value)}
            className="h-8 w-[92px] rounded border bg-background px-1.5 text-xs"
            title="Tudo pronto até esta hora (âncora)"
          />
          <Button size="sm" variant="outline" className="h-8" onClick={() => void reverseSchedule()}>
            Recalcular ao contrário
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Preencha a duração (min) de cada item; isto reescreve os horários pra tudo terminar na hora-âncora.
          </span>
        </div>
      )}

      {/* Pendências com a casa */}
      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold">Pendências com a casa</h3>
        <textarea
          value={housePending}
          onChange={(e) => setHousePending(e.target.value)}
          onBlur={() => void saveHousePending()}
          rows={3}
          placeholder="Ex.: confirmar segurança extra, bar abre 22h, alvará até 4h…"
          className="w-full resize-y rounded-md border bg-background p-2 text-sm"
        />
      </section>
    </div>
  );
}

