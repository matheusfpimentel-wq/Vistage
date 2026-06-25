import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isBackupEnabled,
  setBackupEnabled,
  getBackupKeep,
  setBackupKeep,
  getBackupDirOverride,
  setBackupDirOverride,
  resolveBackupDir,
} from "@/lib/rotatingBackup";
import { isReopenLastEnabled, setReopenLast } from "@/lib/document";

/** Controles dos backups rotativos (cópia de segurança a cada salvamento). */
export function BackupSettings() {
  const [enabled, setEnabled] = useState(isBackupEnabled());
  const [keep, setKeep] = useState(getBackupKeep());
  const [dir, setDir] = useState<string>("");
  const [custom, setCustom] = useState<boolean>(!!getBackupDirOverride());

  useEffect(() => {
    void resolveBackupDir().then(setDir);
  }, [custom]);

  async function pickFolder() {
    try {
      const picked = await open({ directory: true, title: "Pasta dos backups automáticos" });
      if (typeof picked === "string") {
        setBackupDirOverride(picked);
        setCustom(true);
      }
    } catch {
      /* cancelado / sem suporte */
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Backups automáticos</CardTitle>
        <CardDescription>
          A cada salvamento, o Vistage guarda uma cópia do <code>.vistage</code> numa pasta de
          segurança e mantém as últimas {keep}. Rede contra arquivo corrompido ou sobrescrita por
          engano.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-sm">Guardar uma cópia a cada salvamento</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setBackupEnabled(e.target.checked);
            }}
          />
        </label>

        <div className="space-y-1.5">
          <Label className="text-xs">Quantas cópias manter</Label>
          <Input
            type="number"
            min={1}
            value={keep}
            onChange={(e) => {
              const n = Number(e.target.value);
              setKeep(n);
              setBackupKeep(n);
            }}
            className="w-24"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Pasta dos backups</Label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border bg-muted/40 px-2 py-1 text-xs">
              {dir || "…"}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={pickFolder}>
              Escolher…
            </Button>
            {custom && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBackupDirOverride(null);
                  setCustom(false);
                }}
              >
                Padrão
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Dica: aponte para um 2º HD ou uma pasta sincronizada para ter cópia fora da máquina
            (regra 3-2-1).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Comportamento de inicialização: reabrir o último documento. */
export function StartupSettings() {
  const [on, setOn] = useState(isReopenLastEnabled());
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Inicialização</CardTitle>
        <CardDescription>
          Por padrão o Vistage abre em branco e você abre seu <code>.vistage</code> manualmente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-sm">Reabrir o último documento ao iniciar</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={on}
            onChange={(e) => {
              setOn(e.target.checked);
              setReopenLast(e.target.checked);
            }}
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Documento com senha não reabre sozinho — abra pelo menu para digitar a senha.
        </p>
      </CardContent>
    </Card>
  );
}
