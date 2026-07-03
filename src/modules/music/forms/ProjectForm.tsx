import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { toast } from "@/components/ui/toaster";
import { useUnsavedConfirm } from "@/lib/dirty";
import { onEnterSave } from "@/lib/formEnter";
import { createProject, updateProject } from "../api";
import type { MusicProject } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: MusicProject | null;
  onSaved: (id: number) => void;
};

export function ProjectForm({ open, onOpenChange, project, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [concept, setConcept] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const confirmClose = useUnsavedConfirm(dirty);

  useEffect(() => {
    if (!open) return;
    setTitle(project?.title ?? "");
    setConcept(project?.concept ?? "");
    setNotes(project?.notes ?? "");
    setDirty(false);
  }, [open, project]);

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("O título é obrigatório");
      return;
    }
    setSaving(true);
    try {
      let id: number;
      if (project) {
        await updateProject({ id: project.id, title: title.trim(), concept: concept.trim() || null, notes: notes.trim() || null });
        id = project.id;
      } else {
        id = await createProject({
          kind: "single",
          title: title.trim(),
          release_strategy: null,
          presave_link: null,
          press_release_draft: null,
          marketing_dates: null,
          partnerships_confirmed: null,
          fans_notified: null,
          concept: concept.trim() || null,
          notes: notes.trim() || null,
        });
      }
      toast.success(project ? "Projeto atualizado" : "Projeto criado");
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}
    >
      <DialogContent className="max-w-lg" onKeyDown={onEnterSave(handleSubmit)}>
        <DialogHeader>
          <DialogTitle>{project ? "Editar projeto" : "Novo projeto"}</DialogTitle>
          <DialogDescription>
            Um projeto agrupa uma ou mais tracks (single, EP, álbum…).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Título <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              placeholder='Ex: "EP Madrugada"'
            />
          </div>
          <div className="space-y-1.5">
            <Label>Conceito do projeto</Label>
            <AutoGrowTextarea
              rows={3}
              value={concept}
              onChange={(v) => {
                setConcept(v);
                setDirty(true);
              }}
              placeholder="A ideia central que une as músicas: vibe, narrativa, estética..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <AutoGrowTextarea
              rows={3}
              value={notes}
              onChange={(v) => {
                setNotes(v);
                setDirty(true);
              }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => confirmClose(false, () => onOpenChange(false))}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {project ? "Salvar" : "Criar projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
