import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDarkTheme, useThemeStore } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggle } = useThemeStore();
  // Lê de `isDarkTheme` em vez de comparar com "dark" à mão: foi escrevendo
  // essa condição aqui que o botão passou a prometer o oposto do que fazia
  // quando existiu um terceiro tema.
  const dark = isDarkTheme(theme);
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={dark ? "Tema claro" : "Tema escuro"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
