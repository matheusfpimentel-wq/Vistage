import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDarkTheme, useThemeStore } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggle } = useThemeStore();
  // Vale pro Centro de Comando também, que é escuro: `toggle` leva pro claro,
  // então o ícone e o rótulo têm que dizer "claro". Com `theme === "dark"`
  // escrito à mão, o botão prometia o oposto do que fazia.
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
