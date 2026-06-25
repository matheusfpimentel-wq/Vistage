import { Toaster as Sonner } from "sonner";
import { useThemeStore } from "@/lib/theme";

export function Toaster() {
  const theme = useThemeStore((s) => s.theme);
  // Sonner só conhece light/dark/system; "modo cor" é família clara.
  const sonnerTheme = theme === "dark" ? "dark" : "light";
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
