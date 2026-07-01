import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { EMPTY_VALUE, formatCurrency } from "@/lib/format";
import {
  buildRoyaltyPlan,
  decodeReportBuffer,
  importRoyaltyTrackMonths,
  parseRoyalties,
  resolveRates,
  type RoyaltyPlatform,
  type RoyaltyTrackMonth,
} from "../royalties";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

const CURRENCIES = ["USD", "EUR", "BRL", "GBP"] as const;

const PLATFORM_LABEL: Record<RoyaltyPlatform, string> = {
  distrokid: "DistroKid",
  beatport: "Beatport",
  generic: "Relatório genérico",
};

export function RoyaltyImportDialog({ open, onOpenChange, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [platform, setPlatform] = useState<RoyaltyPlatform>("generic");
  const [currency, setCurrency] = useState<string>("USD");
  const [fallbackRate, setFallbackRate] = useState("");
  const [basePlan, setBasePlan] = useState<RoyaltyTrackMonth[] | null>(null);
  const [items, setItems] = useState<RoyaltyTrackMonth[]>([]);
  const [parsing, setParsing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFileName(null);
    setPlatform("generic");
    setCurrency("USD");
    setFallbackRate("");
    setBasePlan(null);
    setItems([]);
    setError(null);
  }

  async function applyRates(plan: RoyaltyTrackMonth[], cur: string, fb: string) {
    setResolving(true);
    try {
      const rate = parseFloat(fb.replace(",", "."));
      const resolved = await resolveRates(plan, {
        currency: cur,
        fallbackRate: isNaN(rate) ? null : rate,
      });
      setItems(resolved);
    } finally {
      setResolving(false);
    }
  }

  function handlePick() {
    inputRef.current?.click();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const content = decodeReportBuffer(ev.target?.result as ArrayBuffer);
        const parsed = parseRoyalties(file.name, content);
        const plan = await buildRoyaltyPlan(parsed);
        setFileName(file.name);
        setPlatform(parsed.platform);
        setCurrency(parsed.currency);
        setBasePlan(plan);
        await applyRates(plan, parsed.currency, fallbackRate);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setItems([]);
        setBasePlan(null);
      } finally {
        setParsing(false);
      }
    };
    reader.onerror = () => {
      setError("Não consegui ler o arquivo.");
      setParsing(false);
    };
    reader.readAsArrayBuffer(file);
  }

  function changeCurrency(c: string) {
    setCurrency(c);
    if (basePlan) void applyRates(basePlan, c, fallbackRate);
  }

  function commitFallback() {
    if (basePlan) void applyRates(basePlan, currency, fallbackRate);
  }

  const novos = items.filter((i) => !i.alreadyImported && i.amountBrl != null);
  const jaImportados = items.filter((i) => i.alreadyImported);
  const semCotacao = items.filter((i) => !i.alreadyImported && i.amountBrl == null);
  const linked = novos.filter((i) => i.trackId != null).length;
  const totalBrl = novos.reduce((s, i) => s + (i.amountBrl ?? 0), 0);

  async function handleImport() {
    if (novos.length === 0) return;
    setImporting(true);
    try {
      const res = await importRoyaltyTrackMonths(items);
      const bits = [`${res.created} lançamento(s) criado(s)`];
      if (res.skipped) bits.push(`${res.skipped} já existiam`);
      if (res.noRate) bits.push(`${res.noRate} sem cotação`);
      toast.success(bits.join(" · "));
      onImported();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(`Erro ao importar: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar royalties</DialogTitle>
          <DialogDescription>
            Exporte o relatório de vendas/streams do DistroKid ou Beatport (CSV/TSV)
            e solte aqui. Cada faixa vira uma receita por mês, convertida pela cotação
            da data. Reimportar o mesmo relatório não duplica nada.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          className="hidden"
          onChange={handleFile}
        />

        {/* Escolha do arquivo */}
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handlePick} disabled={parsing}>
            {parsing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {fileName ? "Trocar arquivo" : "Escolher relatório"}
          </Button>
          {fileName && (
            <div className="min-w-0 text-sm text-muted-foreground">
              <span className="truncate">{fileName}</span>{" "}
              <Badge variant="secondary">{PLATFORM_LABEL[platform]}</Badge>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {items.length > 0 && (
          <>
            {/* Controles de moeda/câmbio */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Moeda do relatório</Label>
                <Select value={currency} onValueChange={changeCurrency}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cotação manual (se faltar)</Label>
                <Input
                  className="w-36"
                  inputMode="decimal"
                  placeholder="ex: 5,40"
                  value={fallbackRate}
                  onChange={(e) => setFallbackRate(e.target.value)}
                  onBlur={commitFallback}
                />
              </div>
              {resolving && (
                <div className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> buscando cotações…
                </div>
              )}
            </div>

            {/* Resumo */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="success">{novos.length} novos · {formatCurrency(totalBrl)}</Badge>
              {linked > 0 && <Badge variant="secondary">{linked} vinculados a faixas</Badge>}
              {jaImportados.length > 0 && (
                <Badge variant="outline">{jaImportados.length} já importados</Badge>
              )}
              {semCotacao.length > 0 && (
                <Badge variant="destructive">{semCotacao.length} sem cotação</Badge>
              )}
            </div>

            {/* Prévia */}
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Mês</th>
                    <th className="px-2 py-1.5 text-left font-medium">Faixa</th>
                    <th className="px-2 py-1.5 text-right font-medium">Origem</th>
                    <th className="px-2 py-1.5 text-right font-medium">Cotação</th>
                    <th className="px-2 py-1.5 text-right font-medium">BRL</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const [y, m] = it.period.split("-");
                    return (
                      <tr
                        key={it.source_ref}
                        className={
                          "border-t " +
                          (it.alreadyImported
                            ? "opacity-50"
                            : it.amountBrl == null
                              ? "bg-destructive/5"
                              : "")
                        }
                      >
                        <td className="px-2 py-1.5 tabular-nums">{m}/{y}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{it.title}</span>
                            {it.trackId != null && (
                              <Badge variant="secondary" className="shrink-0 text-[10px]">
                                faixa
                              </Badge>
                            )}
                            {it.alreadyImported && (
                              <Badge variant="outline" className="shrink-0 text-[10px]">
                                importado
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {it.currency} {it.amountSrc.toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {it.rate != null ? it.rate.toFixed(4) : EMPTY_VALUE}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {it.amountBrl != null ? formatCurrency(it.amountBrl) : EMPTY_VALUE}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {semCotacao.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Algumas datas não tiveram cotação automática (offline ou fim de semana
                distante). Informe uma cotação manual acima para incluí-las.
              </p>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleImport()} disabled={importing || novos.length === 0}>
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            Importar {novos.length > 0 ? `${novos.length} lançamentos` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
