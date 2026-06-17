import { useNavigate } from "react-router-dom";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { type PartyDeserialized } from "../types";

export function GeralTab({
  party,
  onEdit,
  navigate,
}: {
  party: PartyDeserialized;
  onEdit: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <h3 className="font-semibold">Informações gerais</h3>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 rounded-md border p-4">
        <InfoRow label="Título" value={party.title} />
        <InfoRow label="Status" value={party.status} />
        <InfoRow label="Data" value={party.date ? formatDate(party.date) : "—"} />
        <InfoRow label="Venue" value={party.venue_name ?? "—"} />
        <InfoRow
          label="Capacidade esperada"
          value={party.expected_capacity?.toLocaleString("pt-BR") ?? "—"}
        />
        <InfoRow
          label="Público real"
          value={party.actual_attendance?.toLocaleString("pt-BR") ?? "—"}
        />
        {party.lineup.length > 0 && (
          <InfoRow label="Lineup" value={`${party.lineup.length} DJ(s)`} />
        )}
        {party.sponsors.length > 0 && (
          <InfoRow
            label="Patrocinadores"
            value={party.sponsors.map((s) => s.name).join(", ")}
          />
        )}
      </div>

      {party.description && (
        <div className="rounded-md border p-4">
          <div className="text-xs text-muted-foreground mb-1">Descrição</div>
          <p className="text-sm whitespace-pre-wrap">{party.description}</p>
        </div>
      )}

      {party.notes && (
        <div className="rounded-md border p-4">
          <div className="text-xs text-muted-foreground mb-1">Notas</div>
          <p className="text-sm whitespace-pre-wrap">{party.notes}</p>
        </div>
      )}

      {party.venue_id && (
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={() => navigate("/venues")}
        >
          Ver no mapa →
        </button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
