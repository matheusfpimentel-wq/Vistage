import type { ReactNode } from "react";
import { Loader2, AlertTriangle, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Spinner centralizado para enquanto os dados de uma tela carregam. */
export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Estado de erro com botão de tentar novamente. */
export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <AlertTriangle className="h-7 w-7 text-destructive" />
      <div className="space-y-1">
        <p className="text-sm font-medium">Não foi possível carregar</p>
        {message && (
          <p className="max-w-md text-xs text-muted-foreground">{message}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

/** Estado vazio consistente, com CTA opcional ("Criar primeiro X"). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {Icon && <Icon className="h-10 w-10 text-muted-foreground/50" />}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * Mostra loading/erro e só renderiza os filhos quando os dados chegaram.
 * Usar junto de `useAsyncData`:
 *
 *   <AsyncBoundary loading={loading} error={error} onRetry={reload}>
 *     ...conteúdo...
 *   </AsyncBoundary>
 */
export function AsyncBoundary({
  loading,
  error,
  onRetry,
  loadingLabel,
  children,
}: {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  loadingLabel?: string;
  children: ReactNode;
}) {
  if (loading) return <LoadingState label={loadingLabel} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return <>{children}</>;
}
