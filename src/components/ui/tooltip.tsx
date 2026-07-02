import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-xs overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-xs leading-snug text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent };

/**
 * "?" padrão de ajuda de campo: ícone HelpCircle discreto + tooltip.
 * Componente único para toda explicação de campo/regra/comportamento —
 * a EXPLICAÇÃO mora aqui, não em texto solto na tela. Estado/dado
 * (contadores, datas, avisos de segurança) permanece visível.
 */
export function InfoHint({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary"
          aria-label="Mais informações"
        >
          <HelpCircle className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Nome canônico do "?" de ajuda de campo. Alias de {@link InfoHint} — mesma
 * implementação (HelpCircle + Tooltip), um só componente pra padronizar as
 * migrações de explicação pro "?".
 */
export const FieldHelp = InfoHint;
