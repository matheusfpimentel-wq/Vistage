import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Loader2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import {
  connect,
  disconnect,
  listCalendars,
  loadAuth,
  loadGcalConfig,
  loadModuleCalendarIds,
  saveGcalConfig,
  setCalendarId,
  setModuleCalendarId,
  syncAll,
  checkCalendarDrift,
  GCAL_MODULES,
  GCAL_MODULE_LABELS,
  type CalendarListItem,
  type CalendarDrift,
  type GcalConfig,
  type GcalModule,
} from "@/lib/gcal";
import { CalendarDriftDialog } from "@/components/shared/CalendarDriftDialog";
import { InfoHint } from "@/components/ui/tooltip";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Recife",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Bahia",
  "Europe/Lisbon",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

export function GoogleCalendarSettings() {
  const [cfg, setCfg] = useState<GcalConfig | null>(null);
  const [authConnected, setAuthConnected] = useState(false);
  const [calendarId, setActiveCalendarId] = useState<string | null>(null);
  const [moduleCalendars, setModuleCalendars] = useState<Record<GcalModule, string | null>>({
    gigs: null,
    classes: null,
    parties: null,
    okrs: null,
  });
  const [calendars, setCalendars] = useState<CalendarListItem[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [checkingDrift, setCheckingDrift] = useState(false);
  const [drifts, setDrifts] = useState<CalendarDrift[]>([]);
  const [driftOpen, setDriftOpen] = useState(false);
  const [showCredHelp, setShowCredHelp] = useState(false);

  async function refresh() {
    const [c, a] = await Promise.all([loadGcalConfig(), loadAuth()]);
    setCfg(c);
    setAuthConnected(!!a?.access_token);
    setActiveCalendarId(a?.calendar_id ?? null);
    setModuleCalendars(await loadModuleCalendarIds());
    if (a?.access_token) {
      setLoadingCalendars(true);
      try {
        const list = await listCalendars();
        setCalendars(list);
      } catch (e) {
        toast.error(`Erro ao listar calendários: ${String(e)}`);
      } finally {
        setLoadingCalendars(false);
      }
    } else {
      setCalendars([]);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleSaveCreds() {
    if (!cfg) return;
    await saveGcalConfig({
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      timezone: cfg.timezone,
    });
    toast.success("Credenciais salvas");
  }

  async function handleConnect() {
    if (!cfg?.clientId || !cfg?.clientSecret) {
      toast.error("Preencha Client ID e Client Secret antes");
      return;
    }
    if (!/\.apps\.googleusercontent\.com\s*$/.test(cfg.clientId.trim())) {
      toast.error(
        "Client ID inválido. Ele deve terminar com .apps.googleusercontent.com"
      );
      return;
    }
    setConnecting(true);
    try {
      await saveGcalConfig({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        timezone: cfg.timezone,
      });
      await connect();
      toast.success("Conectado ao Google Calendar!");
      await refresh();
    } catch (e) {
      toast.error(`Falha na conexão: ${String(e)}`);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!(await confirmDialog("Desconectar do Google Calendar? Os tokens locais serão apagados."))) return;
    await disconnect();
    toast.success("Desconectado");
    await refresh();
  }

  async function handlePickCalendar(id: string) {
    await setCalendarId(id);
    setActiveCalendarId(id);
    toast.success("Calendário definido");
  }

  async function handlePickModuleCalendar(module: GcalModule, value: string) {
    // "__main__" = usar o calendário principal (fallback)
    const id = value === "__main__" ? null : value;
    await setModuleCalendarId(module, id);
    setModuleCalendars((prev) => ({ ...prev, [module]: id }));
    toast.success(`Calendário de ${GCAL_MODULE_LABELS[module]} definido`);
  }

  async function handleSync() {
    if (!calendarId) {
      toast.error("Selecione um calendário antes");
      return;
    }
    setSyncing(true);
    try {
      const { pushed } = await syncAll();
      toast.success(`Sync concluído — ${pushed} GIG(s) enviada(s) ao calendário`);
      await refresh();
    } catch (e) {
      toast.error(`Erro na sync: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleCheckDrift() {
    if (!calendarId) {
      toast.error("Selecione um calendário antes");
      return;
    }
    setCheckingDrift(true);
    try {
      const found = await checkCalendarDrift();
      if (found.length === 0) {
        toast.success("Nenhuma GIG foi editada no Google desde o último envio.");
        return;
      }
      setDrifts(found);
      setDriftOpen(true);
    } catch (e) {
      toast.error(`Erro ao verificar: ${String(e)}`);
    } finally {
      setCheckingDrift(false);
    }
  }

  if (!cfg) {
    return <div className="text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Google Calendar
                <InfoHint>
                  Sincronização bidirecional entre suas GIGs e um calendário do
                  Google. Recomendado usar um calendário dedicado tipo "GIGs" pra
                  não misturar com sua agenda pessoal.
                </InfoHint>
                {authConnected && (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> conectado
                  </Badge>
                )}
              </CardTitle>
            </div>
            {authConnected && (
              <Button variant="outline" size="sm" onClick={handleDisconnect}>
                <Unplug className="h-3.5 w-3.5" /> Desconectar
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  openExternal("https://console.cloud.google.com/apis/credentials").catch(() => {})
                }
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir Google Cloud Console
              </Button>
              <button
                type="button"
                onClick={() => setShowCredHelp((v) => !v)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary"
                aria-label="Como obter Client ID e Client Secret"
                aria-expanded={showCredHelp}
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
            {showCredHelp && (
              <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
                <li>Acesse o Google Cloud Console (botão acima)</li>
                <li>Crie um projeto novo (ou use um existente)</li>
                <li>"APIs &amp; Services" → "Library" → ative <strong>Google Calendar API</strong></li>
                <li>"APIs &amp; Services" → "OAuth consent screen" → escolha <strong>External</strong>, preencha os básicos e adicione seu email como Test user</li>
                <li>"APIs &amp; Services" → "Credentials" → "Create credentials" → <strong>OAuth client ID</strong> → tipo <strong>Desktop app</strong></li>
                <li>Copie o <strong>Client ID</strong> e <strong>Client secret</strong> que aparecem e cole aqui</li>
              </ol>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client ID</Label>
              <Input
                value={cfg.clientId ?? ""}
                onChange={(e) =>
                  setCfg((c) => (c ? { ...c, clientId: e.target.value } : c))
                }
                placeholder="000000000000-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Client Secret</Label>
              <Input
                type="password"
                value={cfg.clientSecret ?? ""}
                onChange={(e) =>
                  setCfg((c) =>
                    c ? { ...c, clientSecret: e.target.value } : c
                  )
                }
                placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Fuso horário</Label>
            <Select
              value={cfg.timezone}
              onValueChange={(v) =>
                setCfg((c) => (c ? { ...c, timezone: v } : c))
              }
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            {!authConnected ? (
              <>
                <Button variant="outline" onClick={handleSaveCreds}>
                  Salvar credenciais
                </Button>
                <Button onClick={handleConnect} disabled={connecting}>
                  {connecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Conectar Google Calendar
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={handleSaveCreds}>
                Salvar fuso / credenciais
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {authConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calendário e sincronização</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Calendário principal (padrão)</Label>
              {loadingCalendars ? (
                <div className="text-sm text-muted-foreground">Carregando…</div>
              ) : (
                <Select
                  value={calendarId ?? ""}
                  onValueChange={handlePickCalendar}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {calendars.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.summary}
                        {c.primary ? " (principal)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                Usado para qualquer módulo que não tenha um calendário próprio definido abaixo.
              </p>
            </div>

            {!loadingCalendars && calendars.length > 0 && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Calendário por módulo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Defina um calendário separado para cada tipo de evento. Deixe em
                  "Usar principal" para cair no calendário padrão acima.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {GCAL_MODULES.map((module) => (
                    <div key={module} className="space-y-1">
                      <Label className="text-xs">{GCAL_MODULE_LABELS[module]}</Label>
                      <Select
                        value={moduleCalendars[module] ?? "__main__"}
                        onValueChange={(v) => handlePickModuleCalendar(module, v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__main__">Usar principal</SelectItem>
                          {calendars.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.summary}
                              {c.primary ? " (principal)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="text-sm">
                <div className="flex items-center gap-1.5 font-medium">
                  Sincronizar
                  <InfoHint>
                    Ao salvar/editar uma GIG, o evento é criado/atualizado no
                    Google automaticamente. "Sincronizar" envia de uma vez as GIGs
                    ainda não enviadas.
                  </InfoHint>
                </div>
                <div className="text-xs text-muted-foreground">
                  Última sync:{" "}
                  {cfg.lastSyncAt
                    ? new Date(cfg.lastSyncAt).toLocaleString("pt-BR")
                    : "—"}
                </div>
              </div>
              <Button
                onClick={handleSync}
                disabled={syncing || !calendarId}
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sincronizar
              </Button>
            </div>

            {/* Drift: o que foi editado direto no Google desde o último envio. */}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="text-sm">
                <div className="font-medium">Mudou algo no Google?</div>
                <div className="text-xs text-muted-foreground">
                  Verifica se alguma GIG foi remarcada (data/hora) direto no
                  calendário e deixa você aceitar ou descartar — sem duplicar.
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleCheckDrift}
                disabled={checkingDrift || !calendarId}
              >
                {checkingDrift ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Verificar mudanças
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <CalendarDriftDialog
        open={driftOpen}
        onOpenChange={setDriftOpen}
        drifts={drifts}
        onResolved={() => void refresh()}
      />
    </div>
  );
}
