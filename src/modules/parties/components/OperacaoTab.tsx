import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ListOrdered, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toaster";
import { deleteWithUndo } from "@/lib/deleteWithUndo";
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

/**
 * Duração (min) entre início e fim quando AMBOS estão preenchidos (§2.9). Envolve
 * a meia-noite pra frente (ex.: 23:30 → 00:15 = 45 min). null se faltar um deles.
 */
function durationFromTimes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const a = parseHHMM(start);
  const b = parseHHMM(end);
  if (a == null || b == null) return null;
  return ((b - a) % 1440 + 1440) % 1440;
}

/**
 * Pendências com a casa: lista de itens serializada em JSON no campo
 * `house_pending`. Aceita o formato antigo (texto livre) migrando cada linha
 * num item, pra não perder o que já estava escrito.
 */
function parseHousePending(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.map((x) => String(x)).filter((s) => s.trim());
  } catch { /* texto legado */ }
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

export function OperacaoTab({ partyId, performers }: { partyId: number; performers: Performer[] }) {
  const [rows, setRows] = useState<PartyRunsheetItem[]>([]);
  const [pendItems, setPendItems] = useState<string[]>([]);
  const [newPend, setNewPend] = useState("");
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
    setPendItems(parseHousePending(hp));
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

  // §8.4 — puxa do line-up (espelho unidirecional): `performers` já chega na
  // ordem do line-up, então os sets que faltam entram nessa sequência. É
  // aditivo — não remove nem reordena o que já está no cronograma, e nunca
  // mexe no line-up (a Operação só LÊ a ordem; a fonte é a aba Equipe).
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
          title: `Set: ${p.name}`,
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
    const item = rows.find((r) => r.id === id);
    if (!item) return;
    await deleteWithUndo({
      label: "Linha do run-of-show",
      remove: () => deletePartyRunsheetItem(id),
      restore: async () => {
        await createPartyRunsheetItem(item);
      },
      onChange: reload,
    });
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

  // Salva a lista como JSON (ou null quando vazia, pra regras de "campo vazio"
  // continuarem valendo). Otimista: já reflete na tela antes do await.
  async function savePend(items: string[]) {
    setPendItems(items);
    try {
      await setPartyHousePending(partyId, items.length ? JSON.stringify(items) : null);
    } catch (e) {
      toast.error(`Não consegui salvar as pendências com a casa: ${String(e)}`);
    }
  }
  function addPend() {
    const v = newPend.trim();
    if (!v) return;
    setNewPend("");
    void savePend([...pendItems, v]);
  }
  function removePend(idx: number) {
    void savePend(pendItems.filter((_, i) => i !== idx));
  }
  function editPend(idx: number, value: string) {
    setPendItems((prev) => prev.map((s, i) => (i === idx ? value : s)));
  }
  function commitPend() {
    void savePend(pendItems.map((s) => s.trim()).filter(Boolean));
  }

  return (
    <div className="space-y-5">
      {/* Run-of-show */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <ListOrdered className="h-4 w-4 text-primary" /> Cronograma do dia
          </h3>
          <div className="flex items-center gap-1.5">
            {performers.length > 0 && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => void seedFromLineup()}>
                  <Users className="mr-1 h-3.5 w-3.5" /> Sets do line-up
                </Button>
                <InfoHint>
                  O line-up (aba Equipe) é a fonte da ordem. Isto puxa os sets que
                  faltam, na sequência do line-up. Reordenar ou mexer nos horários
                  aqui não altera o line-up.
                </InfoHint>
              </div>
            )}
            <Button size="sm" onClick={() => void addRow()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Linha
            </Button>
          </div>
        </div>

        {!loaded ? null : rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Load-in / passagem de som / abertura de portas / sets por DJ / last call / encerramento / load-out.
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
                  onChange={(e) => {
                    // Início + fim preenchidos → "min" calcula sozinho (§2.9).
                    const time = e.target.value || null;
                    const dur = durationFromTimes(time, r.end_time);
                    void patch(r.id, dur != null ? { time, duration_min: dur } : { time });
                  }}
                  className="h-8 w-[84px] rounded border bg-background px-1.5 text-xs"
                  title="Início"
                />
                <span className="text-xs text-muted-foreground/50">→</span>
                <input
                  type="time"
                  value={r.end_time ?? ""}
                  onChange={(e) => {
                    const end_time = e.target.value || null;
                    const dur = durationFromTimes(r.time, end_time);
                    void patch(r.id, dur != null ? { end_time, duration_min: dur } : { end_time });
                  }}
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
                  title="Duração (min): calculada de início→fim, ou base do cronograma reverso"
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
          <InfoHint>
            Preencha a duração (min) de cada item; isto reescreve os horários pra tudo terminar na hora-âncora.
          </InfoHint>
        </div>
      )}

      {/* Pendências com a casa — itens adicionados um a um. */}
      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold">Pendências com a casa</h3>
        {pendItems.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma pendência ainda.</p>
        )}
        {pendItems.length > 0 && (
          <ul className="space-y-1.5">
            {pendItems.map((p, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <input
                  value={p}
                  onChange={(e) => editPend(idx, e.target.value)}
                  onBlur={commitPend}
                  className="h-8 flex-1 rounded border bg-background px-2 text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                  aria-label="Remover pendência"
                  onClick={() => removePend(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <input
            value={newPend}
            onChange={(e) => setNewPend(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPend(); } }}
            placeholder="Ex.: confirmar segurança extra, bar abre 22h…"
            className="h-8 flex-1 rounded border bg-background px-2 text-sm"
          />
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={addPend}>
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </Button>
        </div>
      </section>
    </div>
  );
}

