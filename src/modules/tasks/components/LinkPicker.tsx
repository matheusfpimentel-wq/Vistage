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

type EntityOption = { id: number; label: string };

async function loadOptions(type: TaskLinkType): Promise<EntityOption[]> {
  switch (type) {
    case "fan": {
      const { listFans } = await import("@/modules/fans/api");
      const items = await listFans();
      return items.map((f) => ({ id: f.id, label: f.name }));
    }
    case "student": {
      const { listStudents } = await import("@/modules/classes/api");
      const items = await listStudents();
      return items.map((s) => ({ id: s.id, label: s.name }));
    }
    case "supplier": {
      const { listSuppliers } = await import("@/modules/suppliers/api");
      const items = await listSuppliers();
      return items.map((s) => ({ id: s.id, label: s.name }));
    }
    case "venue": {
      const { listVenues } = await import("@/modules/venues/api");
      const items = await listVenues();
      return items.map((v) => ({ id: v.id, label: v.name }));
    }
    case "track": {
      const { listTracks } = await import("@/modules/music/api");
      const items = await listTracks();
      return items.map((t) => ({
        id: t.id,
        label: t.title_final ?? t.title_working,
      }));
    }
    case "party": {
      const { listParties } = await import("@/modules/parties/api");
      const items = await listParties();
      return items.map((p) => ({ id: p.id, label: p.title }));
    }
    case "content": {
      const { listContent } = await import("@/modules/content/api");
      const items = await listContent();
      return items.map((c) => ({ id: c.id, label: c.title }));
    }
    case "meeting": {
      const { listMeetings } = await import("@/modules/meetings/api");
      const items = await listMeetings();
      return items.map((m) => ({ id: m.id, label: m.title }));
    }
  }
}

type Props = {
  links: PendingLink[];
  onChange: (links: PendingLink[]) => void;
};

export function LinkPicker({ links, onChange }: Props) {
  const [type, setType] = useState<TaskLinkType | "">("");
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [entityId, setEntityId] = useState<string>("");

  useEffect(() => {
    if (!type) {
      setOptions([]);
      setEntityId("");
      return;
    }
    setLoadingOptions(true);
    setEntityId("");
    void loadOptions(type as TaskLinkType)
      .then(setOptions)
      .finally(() => setLoadingOptions(false));
  }, [type]);

  function add() {
    if (!type || !entityId) return;
    const opt = options.find((o) => o.id === Number(entityId));
    if (!opt) return;
    const already = links.some(
      (l) => l.entity_type === type && l.entity_id === opt.id
    );
    if (already) return;
    onChange([
      ...links,
      { entity_type: type as TaskLinkType, entity_id: opt.id, label: opt.label },
    ]);
    setEntityId("");
  }

  function remove(idx: number) {
    onChange(links.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {links.map((l, i) => (
            <Badge key={i} variant="outline" className="gap-1 pr-1">
              <span className="text-muted-foreground text-[10px]">
                {TASK_LINK_LABELS[l.entity_type]}
              </span>
              {l.label}
              <button
                type="button"
                onClick={() => remove(i)}
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
        <Select
          value={type}
          onValueChange={(v) => setType(v as TaskLinkType | "")}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            {TASK_LINK_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TASK_LINK_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={entityId}
          onValueChange={setEntityId}
          disabled={!type || loadingOptions}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={loadingOptions ? "Carregando…" : "Entidade"} />
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
          disabled={!type || !entityId}
        >
          Vincular
        </Button>
      </div>
    </div>
  );
}
