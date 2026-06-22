import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_LINK_TYPES, TASK_LINK_LABELS, type TaskLinkType } from "../types";

export type PendingLink = {
  entity_type: TaskLinkType;
  entity_id: number;
  label: string;
};

export type EntityOption = { id: number; label: string };

// Seletor de vínculo UNIFICADO. "gig" e "contact" são vínculos ÚNICOS — gravam
// em gig_id/contact_id da tarefa (1 por tarefa), e por isso entram aqui como
// "tipos" especiais, fora de TASK_LINK_TYPES. O restante é polimórfico (vários
// por tarefa, em task_links). Tudo aparece junto, num só campo "Vínculo".
type Kind = "gig" | "contact" | TaskLinkType;

const KIND_LABELS: Record<Kind, string> = {
  gig: "GIG",
  contact: "Contato",
  ...TASK_LINK_LABELS,
};
const KINDS: Kind[] = ["gig", "contact", ...TASK_LINK_TYPES];

async function loadLinkOptions(type: TaskLinkType): Promise<EntityOption[]> {
  switch (type) {
    case "fan": {
      const { listFans } = await import("@/modules/fans/api");
      return (await listFans()).map((f) => ({ id: f.id, label: f.name }));
    }
    case "student": {
      const { listStudents } = await import("@/modules/classes/api");
      return (await listStudents()).map((s) => ({ id: s.id, label: s.name }));
    }
    case "class": {
      const { listClasses } = await import("@/modules/classes/api");
      return (await listClasses()).map((c) => ({
        id: c.id,
        label: c.title?.trim() || `Aula · ${c.student_name}`,
      }));
    }
    case "supplier": {
      const { listSuppliers } = await import("@/modules/suppliers/api");
      return (await listSuppliers()).map((s) => ({ id: s.id, label: s.name }));
    }
    case "venue": {
      const { listVenues } = await import("@/modules/venues/api");
      return (await listVenues()).map((v) => ({ id: v.id, label: v.name }));
    }
    case "track": {
      const { listTracks } = await import("@/modules/music/api");
      return (await listTracks()).map((t) => ({
        id: t.id,
        label: t.title_final ?? t.title_working,
      }));
    }
    case "party": {
      const { listParties } = await import("@/modules/parties/api");
      return (await listParties()).map((p) => ({ id: p.id, label: p.title }));
    }
    case "content": {
      const { listContent } = await import("@/modules/content/api");
      return (await listContent()).map((c) => ({ id: c.id, label: c.title }));
    }
    case "meeting": {
      const { listMeetings } = await import("@/modules/meetings/api");
      return (await listMeetings()).map((m) => ({ id: m.id, label: m.title }));
    }
  }
}

type Props = {
  /** Vínculos ÚNICOS (colunas gig_id/contact_id). */
  gigId: number | null;
  contactId: number | null;
  onGig: (id: number | null) => void;
  onContact: (id: number | null) => void;
  gigOptions: EntityOption[];
  contactOptions: EntityOption[];
  /** Vínculos polimórficos (task_links). */
  links: PendingLink[];
  onLinks: (links: PendingLink[]) => void;
};

export function LinkPicker({
  gigId,
  contactId,
  onGig,
  onContact,
  gigOptions,
  contactOptions,
  links,
  onLinks,
}: Props) {
  const [kind, setKind] = useState<Kind | "">("");
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [entityId, setEntityId] = useState<string>("");

  useEffect(() => {
    if (!kind) {
      setOptions([]);
      setEntityId("");
      return;
    }
    setEntityId("");
    if (kind === "gig") {
      setOptions(gigOptions);
      return;
    }
    if (kind === "contact") {
      setOptions(contactOptions);
      return;
    }
    setLoadingOptions(true);
    void loadLinkOptions(kind)
      .then(setOptions)
      .finally(() => setLoadingOptions(false));
  }, [kind, gigOptions, contactOptions]);

  function add() {
    if (!kind || !entityId) return;
    const id = Number(entityId);
    const opt = options.find((o) => o.id === id);
    if (!opt) return;
    if (kind === "gig") {
      onGig(id);
      setEntityId("");
      return;
    }
    if (kind === "contact") {
      onContact(id);
      setEntityId("");
      return;
    }
    if (links.some((l) => l.entity_type === kind && l.entity_id === id)) return;
    onLinks([...links, { entity_type: kind, entity_id: id, label: opt.label }]);
    setEntityId("");
  }

  function removeLink(idx: number) {
    onLinks(links.filter((_, i) => i !== idx));
  }

  const gigLabel =
    gigId != null
      ? gigOptions.find((o) => o.id === gigId)?.label ?? `GIG #${gigId}`
      : null;
  const contactLabel =
    contactId != null
      ? contactOptions.find((o) => o.id === contactId)?.label ?? `Contato #${contactId}`
      : null;
  const hasAny = !!gigLabel || !!contactLabel || links.length > 0;

  return (
    <div className="space-y-2">
      {hasAny && (
        <div className="flex flex-wrap gap-1">
          {gigLabel && (
            <Badge variant="outline" className="gap-1 pr-1">
              <span className="text-muted-foreground text-[10px]">GIG</span>
              {gigLabel}
              <button
                type="button"
                onClick={() => onGig(null)}
                className="rounded p-0.5 hover:bg-accent"
                aria-label="Remover vínculo"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {contactLabel && (
            <Badge variant="outline" className="gap-1 pr-1">
              <span className="text-muted-foreground text-[10px]">Contato</span>
              {contactLabel}
              <button
                type="button"
                onClick={() => onContact(null)}
                className="rounded p-0.5 hover:bg-accent"
                aria-label="Remover vínculo"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {links.map((l, i) => (
            <Badge key={i} variant="outline" className="gap-1 pr-1">
              <span className="text-muted-foreground text-[10px]">
                {TASK_LINK_LABELS[l.entity_type]}
              </span>
              {l.label}
              <button
                type="button"
                onClick={() => removeLink(i)}
                className="rounded p-0.5 hover:bg-accent"
                aria-label="Remover vínculo"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as Kind | "")}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={entityId}
          onValueChange={setEntityId}
          disabled={!kind || loadingOptions}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={loadingOptions ? "Carregando…" : "Selecione"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id.toString()}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={!kind || !entityId}
        >
          Vincular
        </Button>
      </div>
    </div>
  );
}
