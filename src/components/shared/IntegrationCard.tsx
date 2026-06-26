import type { ReactNode } from "react";
import { CheckCircle2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Padrão visual ÚNICO dos cards de Integração. Conectado → mesmos 4 itens em
 * toda integração: selo "Conectado" (V circulado) ao lado do nome, carimbo de
 * tempo, botão Sincronizar e botão Desconectar. Só o TEXTO do carimbo muda
 * ("Última sincronização: …" vs "Último envio: …").
 */

/** Selo "Conectado" com V circulado — vai ao lado do nome no título do card. */
export function ConnectedBadge() {
  return (
    <span className="flex items-center gap-1 text-xs font-normal text-emerald-500">
      <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
    </span>
  );
}

type ActionsProps = {
  /** Carimbo de tempo já formatado (ex.: "Última sincronização: 25 de jun., 19:40"). */
  timestampLabel?: string | null;
  onSync?: () => void;
  syncing?: boolean;
  syncLabel?: string;
  syncDisabled?: boolean;
  onDisconnect: () => void;
  /** Opções específicas da integração, renderizadas acima da linha de botões. */
  children?: ReactNode;
  /** Botões extras na linha (ex.: "Trocar senha"), entre Sincronizar e Desconectar. */
  extraActions?: ReactNode;
};

/** Rodapé padrão do card conectado: carimbo + Sincronizar + Desconectar. */
export function IntegrationActions({
  timestampLabel,
  onSync,
  syncing,
  syncLabel = "Sincronizar",
  syncDisabled,
  onDisconnect,
  children,
  extraActions,
}: ActionsProps) {
  return (
    <div className="space-y-3">
      {timestampLabel && <p className="text-xs text-muted-foreground">{timestampLabel}</p>}
      {children}
      <div className="flex flex-wrap gap-2">
        {onSync && (
          <Button onClick={onSync} disabled={syncing || syncDisabled}>
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {syncLabel}
          </Button>
        )}
        {extraActions}
        <Button variant="outline" onClick={onDisconnect}>
          <Unplug className="h-4 w-4" /> Desconectar
        </Button>
      </div>
    </div>
  );
}
