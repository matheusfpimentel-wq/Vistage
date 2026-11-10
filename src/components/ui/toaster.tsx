import { Toaster as Sonner } from "sonner";
import { isDarkTheme, useThemeStore } from "@/lib/theme";

export function Toaster() {
  const theme = useThemeStore((s) => s.theme);
  // Sonner só conhece light/dark/system. Centro de Comando é família ESCURA:
  // com `theme === "dark"` aqui, o toast saía branco sobre a tela escura.
  const sonnerTheme = isDarkTheme(theme) ? "dark" : "light";
  return (
    <Sonner
      theme={sonnerTheme}
      position="bottom-left"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
        },
      }}
    />
  );
}

export { toast } from "sonner";
