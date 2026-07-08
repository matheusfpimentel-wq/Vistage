import { useState, type CSSProperties } from "react";

// Cor por coluna do Kanban — preferência da MÁQUINA (localStorage), NÃO viaja no
// .vistage. Compartilhado entre Tarefas e Ideias. A cor tinge o FUNDO da coluna/
// agrupador (não os cards), então os cards seguem num fundo neutro e legível.

export function loadColumnColors(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Estado + setter da cor por coluna, persistindo em localStorage sob `key`. */
export function useColumnColors(
  key: string
): [Record<string, string>, (column: string, hex: string | null) => void] {
  const [colors, setColors] = useState<Record<string, string>>(() => loadColumnColors(key));

  function setColor(column: string, hex: string | null) {
    setColors((prev) => {
      const next = { ...prev };
      if (hex) next[column] = hex;
      else delete next[column];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage indisponível */
      }
      return next;
    });
  }

  return [colors, setColor];
}

/** Estilo de fundo tingido pra coluna: a cor escolhida em ~14% de opacidade
 *  (hex de 8 dígitos), suave o bastante pros cards ficarem legíveis por cima.
 *  Devolve undefined quando não há cor (aí vale a classe padrão da coluna). */
export function columnTintStyle(hex: string | null | undefined): CSSProperties | undefined {
  if (!hex) return undefined;
  return { backgroundColor: `${hex}24` };
}
