import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { getDb } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  /** Habilita o modo recorrente — só quando a categoria é "Festa". */
  enabled?: boolean;
  recurringName: string | null;
  eventName: string;
  onChangeRecurring: (v: string | null) => void;
  onChangeEventName: (v: string) => void;
};

async function listFests(): Promise<string[]> {
  try {
    const db = getDb();
    const rows = await db.select<{ name: string }[]>(
      "SELECT name FROM recurring_fests ORDER BY name"
    );
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

async function saveFest(name: string): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT OR IGNORE INTO recurring_fests (name) VALUES ($1)",
    [name]
  );
}

async function deleteFest(name: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM recurring_fests WHERE name = $1", [name]);
}

export function RecurringFestField({ enabled = true, recurringName, eventName, onChangeRecurring, onChangeEventName }: Props) {
  const isRecurring = enabled && recurringName !== null;
  const [fests, setFests] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newFestName, setNewFestName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void listFests().then(setFests);
  }, []);

  useEffect(() => {
    if (!dropdownOpen && !manageOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setManageOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [dropdownOpen, manageOpen]);

  async function handleAddFest() {
    const name = newFestName.trim();
    if (!name) return;
    await saveFest(name);
    const updated = await listFests();
    setFests(updated);
    setNewFestName("");
    onChangeRecurring(name);
  }

  async function handleDeleteFest(name: string) {
    await deleteFest(name);
    const updated = await listFests();
    setFests(updated);
    if (recurringName === name) onChangeRecurring("");
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">
        {isRecurring ? "Festa recorrente" : "Nome da festa / evento"}
      </span>

      {!isRecurring ? (
        <Input
          placeholder='Ex: "Festa de aniversário do clube"'
          value={eventName}
          onChange={(e) => onChangeEventName(e.target.value)}
        />
      ) : (
        <div className="space-y-2">
          {/* Combobox de festas salvas */}
          <div ref={dropdownRef} className="relative">
            <div className="flex gap-1.5">
              <div
                className="flex flex-1 cursor-pointer items-center rounded-md border bg-background px-3 py-2 text-sm"
                onClick={() => { setDropdownOpen((o) => !o); setManageOpen(false); }}
              >
                <span className={cn("flex-1 truncate", !recurringName && "text-muted-foreground")}>
                  {recurringName || "Selecionar ou digitar nome…"}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 text-xs"
                onClick={() => { setManageOpen((o) => !o); setDropdownOpen(false); }}
                title="Gerenciar festas salvas"
              >
                Gerenciar
              </Button>
            </div>

            {/* Dropdown de seleção */}
            {dropdownOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border bg-popover shadow-lg">
                <div className="flex gap-1.5 border-b p-2">
                  <Input
                    className="h-7 text-xs"
                    placeholder="Buscar ou criar nova…"
                    value={recurringName ?? ""}
                    onChange={(e) => onChangeRecurring(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void (async () => {
                          const name = (recurringName ?? "").trim();
                          if (name && !fests.includes(name)) {
                            await saveFest(name);
                            setFests(await listFests());
                          }
                          setDropdownOpen(false);
                        })();
                      }
                    }}
                    autoFocus
                  />
                </div>
                <div className="max-h-40 overflow-y-auto py-1">
                  {fests.filter((f) => !recurringName || f.toLowerCase().includes(recurringName.toLowerCase())).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => { onChangeRecurring(f); setDropdownOpen(false); }}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-sm transition hover:bg-accent",
                        recurringName === f && "bg-primary/10 font-medium"
                      )}
                    >
                      {f}
                    </button>
                  ))}
                  {fests.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma festa salva. Digite e pressione Enter.</p>
                  )}
                </div>
              </div>
            )}

            {/* Painel de gerenciamento */}
            {manageOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border bg-popover shadow-lg">
                <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Festas salvas</p>
                <div className="max-h-40 overflow-y-auto py-1">
                  {fests.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma festa salva.</p>
                  ) : (
                    fests.map((f) => (
                      <div key={f} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <span className="flex-1 truncate">{f}</span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteFest(f)}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-1.5 border-t p-2">
                  <Input
                    className="h-7 text-xs"
                    placeholder="Nova festa…"
                    value={newFestName}
                    onChange={(e) => setNewFestName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleAddFest(); }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 shrink-0"
                    onClick={() => void handleAddFest()}
                    aria-label="Adicionar"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Campo de edição */}
          <Input
            placeholder='Edição (ex: "Aniversário 10 anos")'
            value={eventName}
            onChange={(e) => onChangeEventName(e.target.value)}
          />
        </div>
      )}

      {/* Toggle "Festa recorrente?" — só quando a categoria é Festa */}
      {enabled && (
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            className="h-3.5 w-3.5"
            checked={isRecurring}
            onChange={(e) => {
              onChangeRecurring(e.target.checked ? "" : null);
            }}
          />
          Festa recorrente?
        </label>
      )}
    </div>
  );
}
