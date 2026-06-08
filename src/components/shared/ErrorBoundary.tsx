import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  /** Rótulo opcional do que falhou (ex.: nome do módulo). */
  label?: string;
  /** Conteúdo alternativo; se omitido, usa o fallback padrão. */
  fallback?: ReactNode;
  children: ReactNode;
  /** Muda este valor (ex.: pathname) para resetar a fronteira ao navegar. */
  resetKey?: string | number;
};

type State = { error: Error | null };

/**
 * Captura erros de render/lifecycle dos filhos para que uma falha em um
 * módulo não derrube o app inteiro (tela branca). Mostra um cartão com a
 * opção de tentar de novo, preservando o resto da aplicação.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // Ao navegar para outra rota, limpa o erro para tentar renderizar de novo.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  // Mantemos a assinatura para futura telemetria; sem console em produção.
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* intencionalmente vazio: o estado já guarda o erro */
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <div className="max-w-md space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
            <div className="font-semibold text-destructive">
              {this.props.label
                ? `Algo quebrou em ${this.props.label}`
                : "Algo deu errado nesta tela"}
            </div>
            <div className="text-xs text-muted-foreground">
              O resto do app continua funcionando. Você pode tentar recarregar
              esta seção.
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Detalhes técnicos</summary>
              <div className="mt-1 break-words font-mono">
                {this.state.error.message}
              </div>
            </details>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
