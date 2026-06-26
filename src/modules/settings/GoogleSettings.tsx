import { useEffect, useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  HardDrive,
  Loader2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { ConnectedBadge, IntegrationActions } from "@/components/shared/IntegrationCard";
import { CalendarDriftDialog } from "@/components/shared/CalendarDriftDialog";
import { InfoHint } from "@/components/ui/tooltip";
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
import {
  connectDrive,
  disconnectDrive,
  isDriveConnected,
  isDriveSyncMedia,
  isDriveSyncDocs,
  setDriveSyncMedia,
  setDriveSyncDocs,
  getDriveRootFolderId,
  setDriveRootFolderId,
} from "@/lib/gdrive";

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

/**
 * Card único do Google: agenda (Calendar) e arquivos (Drive) compartilham as
 * mesmas credenciais (Client ID/Secret), que só aparecem enquanto NÃO estiver
 * conectado — depois ficam escondidas atrás de "Editar credenciais".
 */
export function GoogleSettings() {
  const [cfg, setCfg] = useState<GcalConfig | null>(null);
  const [showCreds, setShowCreds] = useState(false);

  // Calendar
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

  // Drive
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [syncMedia, setSyncMediaState] = useState(isDriveSyncMedia());
  const [syncDocs, setSyncDocsState] = useState(isDriveSyncDocs());
  const [rootInput, setRootInput] = useState("");

  async function refresh() {
    const [c, a] = await Promise.all([loadGcalConfig(), loadAuth()]);
    setCfg(c);
    setAuthConnected(!!a?.access_token);
    setActiveCalendarId(a?.calendar_id ?? null);
    setModuleCalendars(await loadModuleCalendarIds());
    setDriveConnected(await isDriveConnected().catch(() => false));
    setRootInput((await getDriveRootFolderId()) ?? "");
    if (a?.access_token) {
      setLoadingCalendars(true);
      try {
        setCalendars(await listCalendars());
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
    setShowCreds(false);
    toast.success("Credenciais salvas");
  }

  async function handleConnectCalendar() {
    if (!cfg?.clientId || !cfg?.clientSecret) {
      toast.error("Preencha Client ID e Client Secret antes");
      return;
    }
    if (!/\.apps\.googleusercontent\.com\s*$/.test(cfg.clientId.trim())) {
      toast.error("Client ID inválido — deve terminar com .apps.googleusercontent.com");
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
      toast.success("Agenda conectada!");
      await refresh();
    } catch (e) {
      toast.error(`Falha na conexão: ${String(e)}`);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnectCalendar() {
    if (!(await confirmDialog("Desconectar a agenda do Google? Os tokens locais serão apagados."))) return;
    await disconnect();
    toast.success("Agenda desconectada");
    await refresh();
  }

  async function handleSaveTimezone(tz: string) {
    setCfg((c) => (c ? { ...c, timezone: tz } : c));
    await saveGcalConfig({ timezone: tz });
  }

  async function handlePickCalendar(id: string) {
    await setCalendarId(id);
    setActiveCalendarId(id);
    toast.success("Calendário definido");
  }

  async function handlePickModuleCalendar(module: GcalModule, value: string) {
    const id = value === "__main__" ? null : value;
    await setModuleCalendarId(module, id);
    setModuleCalendars((prev) => ({ ...prev, [module]: id }));
  }

  async function handleSync() {
    if (!calendarId) {
      toast.error("Selecione um calendário antes");
      return;
    }
    setSyncing(true);
    try {
      const { pushed } = await syncAll();
      toast.success(`Sync concluído — ${pushed} GIG(s) enviada(s)`);
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
        toast.success("Nada mudou no Google desde o último envio.");
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

  async function handleConnectDrive() {
    setDriveConnecting(true);
    try {
      await connectDrive();
      toast.success("Drive conectado — a mídia nova vai pra lá.");
      await refresh();
    } catch (e) {
      toast.error(`Erro ao conectar o Drive: ${String(e)}`);
    } finally {
      setDriveConnecting(false);
    }
  }

  async function handleDisconnectDrive() {
    await disconnectDrive();
    toast.success("Drive desconectado. A mídia nova passa a ser embutida no arquivo.");
    await refresh();
  }

  async function handleSaveRoot() {
    await setDriveRootFolderId(rootInput.trim() || null);
    toast.success(rootInput.trim() ? "Pasta do Drive definida" : "Pasta padrão (Vistage) restaurada");
    await refresh();
  }

  if (!cfg) {
    return <div className="text-sm text-muted-foreground">Carregando…</div>;
  }

  const anyConnected = authConnected || driveConnected;
  const credsVisible = !anyConnected || showCreds;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Google
          {anyConnected && <ConnectedBadge />}
          <InfoHint>
            Agenda (Calendar) e arquivos (Drive) usam a mesma conta e as mesmas
            credenciais do Google.
          </InfoHint>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Credenciais (só enquanto não conectado, ou ao editar) ── */}
        {credsVisible ? (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Credenciais do Google
              </Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  openExternal("https://console.cloud.google.com/apis/credentials").catch(() => {})
                }
              >
                <ExternalLink className="h-3.5 w-3.5" /> Cloud Console
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Client ID</Label>
                <Input
                  value={cfg.clientId ?? ""}
                  onChange={(e) => setCfg((c) => (c ? { ...c, clientId: e.target.value } : c))}
                  placeholder="…apps.googleusercontent.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Client Secret</Label>
                <Input
                  type="password"
                  value={cfg.clientSecret ?? ""}
                  onChange={(e) => setCfg((c) => (c ? { ...c, clientSecret: e.target.value } : c))}
                  placeholder="GOCSPX-…"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSaveCreds}>
                Salvar credenciais
              </Button>
              {anyConnected && (
                <Button variant="ghost" size="sm" onClick={() => setShowCreds(false)}>
                  Fechar
                </Button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCreds(true)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Editar credenciais do Google
          </button>
        )}

        {/* ── Agenda (Calendar) ── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="h-4 w-4 text-primary" /> Agenda
          </div>

          {!authConnected ? (
            <Button onClick={handleConnectCalendar} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Conectar agenda
            </Button>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Calendário principal</Label>
                  {loadingCalendars ? (
                    <div className="text-sm text-muted-foreground">Carregando…</div>
                  ) : (
                    <Select value={calendarId ?? ""} onValueChange={handlePickCalendar}>
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
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fuso horário</Label>
                  <Select value={cfg.timezone} onValueChange={handleSaveTimezone}>
                    <SelectTrigger>
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
              </div>

              {!loadingCalendars && calendars.length > 0 && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Calendário por módulo
                  </Label>
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

              <IntegrationActions
                timestampLabel={
                  cfg.lastSyncAt
                    ? `Última sincronização: ${new Date(cfg.lastSyncAt).toLocaleString("pt-BR")}`
                    : "Ainda não sincronizado"
                }
                onSync={() => void handleSync()}
                syncing={syncing}
                syncDisabled={!calendarId}
                onDisconnect={() => void handleDisconnectCalendar()}
                extraActions={
                  <Button variant="outline" onClick={() => void handleCheckDrift()} disabled={checkingDrift || !calendarId}>
                    {checkingDrift ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Verificar mudanças
                  </Button>
                }
              />
            </>
          )}
        </section>

        {/* ── Arquivos (Drive) ── */}
        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <HardDrive className="h-4 w-4 text-primary" /> Arquivos (Drive)
            <InfoHint>
              Tira a mídia pesada de dentro do .vistage e guarda no seu Drive,
              baixando sob demanda. Fotos de contatos/venues/fãs, logo, isótipo,
              fontes e templates ficam sempre locais.
            </InfoHint>
          </div>

          {!driveConnected ? (
            <Button onClick={handleConnectDrive} disabled={driveConnecting}>
              {driveConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
              Conectar Drive
            </Button>
          ) : (
            <>
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-medium">O que mandar pro Drive</p>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={syncMedia}
                    onChange={(e) => {
                      setSyncMediaState(e.target.checked);
                      setDriveSyncMedia(e.target.checked);
                    }}
                  />
                  Imagens e vídeos
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={syncDocs}
                    onChange={(e) => {
                      setSyncDocsState(e.target.checked);
                      setDriveSyncDocs(e.target.checked);
                    }}
                  />
                  Documentos
                </label>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Pasta no Drive</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="ID da pasta (vazio = pasta padrão Vistage)"
                    value={rootInput}
                    onChange={(e) => setRootInput(e.target.value)}
                  />
                  <Button variant="outline" onClick={() => void handleSaveRoot()}>
                    Salvar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  É a parte final da URL <code>drive.google.com/drive/folders/<strong>ID</strong></code>.
                </p>
              </div>

              <Button variant="outline" onClick={() => void handleDisconnectDrive()}>
                <Unplug className="h-4 w-4" /> Desconectar
              </Button>
            </>
          )}
        </section>
      </CardContent>

      <CalendarDriftDialog
        open={driftOpen}
        onOpenChange={setDriftOpen}
        drifts={drifts}
        onResolved={() => void refresh()}
      />
    </Card>
  );
}
