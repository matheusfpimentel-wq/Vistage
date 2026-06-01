import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";
import {
  getProject,
  listTrackMediaTargets,
  setTrackMediaTargets,
  updateProject,
} from "../api";
import type { MusicProject, ReleaseStrategy } from "../types";

type Props = {
  projectId: number;
  trackId: number;
};

const MEDIA_TYPES = ["Imprensa", "Curador", "Influencer", "Jornalista", "Booker"];

type MarketingDates = {
  anuncio: string;
  teaser: string;
  presave_open: string;
  release: string;
  follow_up: string;
};

const EMPTY_DATES: MarketingDates = {
  anuncio: "",
  teaser: "",
  presave_open: "",
  release: "",
  follow_up: "",
};

const MEDIA_ROLES = ["Imprensa", "Curador", "Influencer"] as const;

export function MarketingPanel({ projectId, trackId }: Props) {
  const [project, setProject] = useState<MusicProject | null>(null);
  const [releaseStrategy, setReleaseStrategy] = useState<string>("");
  const [presaveLink, setPresaveLink] = useState("");
  const [pressReleaseDraft, setPressReleaseDraft] = useState("");
  const [marketingDates, setMarketingDates] = useState<MarketingDates>(EMPTY_DATES);
  const [partnershipsConfirmed, setPartnershipsConfirmed] = useState("");
  const [mediaContacts, setMediaContacts] = useState<Contact[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<
    { contact_id: number; role: string | null }[]
  >([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [proj, targets, allContacts] = await Promise.all([
      getProject(projectId),
      listTrackMediaTargets(trackId),
      listContacts(),
    ]);

    if (proj) {
      setProject(proj);
      setReleaseStrategy(proj.release_strategy ?? "");
      setPresaveLink(proj.presave_link ?? "");
      setPressReleaseDraft(proj.press_release_draft ?? "");
      setPartnershipsConfirmed(proj.partnerships_confirmed ?? "");

      try {
        const parsed = proj.marketing_dates
          ? (JSON.parse(proj.marketing_dates) as Partial<MarketingDates>)
          : {};
        setMarketingDates({ ...EMPTY_DATES, ...parsed });
      } catch {
        setMarketingDates(EMPTY_DATES);
      }
    }

    const filtered = allContacts.filter((c) =>
      c.types.some((t) => MEDIA_TYPES.includes(t))
    );
    setMediaContacts(filtered.length > 0 ? filtered : allContacts);
    setSelectedTargets(targets);
  }, [projectId, trackId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function toggleTarget(contactId: number) {
    setSelectedTargets((prev) => {
      const exists = prev.find((t) => t.contact_id === contactId);
      if (exists) return prev.filter((t) => t.contact_id !== contactId);
      return [...prev, { contact_id: contactId, role: null }];
    });
  }

  function setTargetRole(contactId: number, role: string) {
    setSelectedTargets((prev) =>
      prev.map((t) => (t.contact_id === contactId ? { ...t, role } : t))
    );
  }

  async function handleSave() {
    if (!project) return;
    setSaving(true);
    try {
      await updateProject({
        id: projectId,
        release_strategy: (releaseStrategy as ReleaseStrategy) || null,
        presave_link: presaveLink.trim() || null,
        press_release_draft: pressReleaseDraft.trim() || null,
        marketing_dates: JSON.stringify(marketingDates),
        partnerships_confirmed: partnershipsConfirmed.trim() || null,
      });
      await setTrackMediaTargets(trackId, selectedTargets);
      toast.success("Marketing salvo");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-xs">Estratégia de lançamento</Label>
        <Select value={releaseStrategy} onValueChange={setReleaseStrategy}>
          <SelectTrigger>
            <SelectValue placeholder="Não definido" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Não definido</SelectItem>
            <SelectItem value="waterfall">Waterfall</SelectItem>
            <SelectItem value="drop_unico">Drop único</SelectItem>
            <SelectItem value="album_direto">Álbum direto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Link de pré-save</Label>
        <Input
          value={presaveLink}
          onChange={(e) => setPresaveLink(e.target.value)}
          placeholder="https://..."
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Press release (rascunho)</Label>
        <Textarea
          rows={5}
          value={pressReleaseDraft}
          onChange={(e) => setPressReleaseDraft(e.target.value)}
          placeholder="Rascunho do press release..."
        />
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">
          Datas de marketing
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              { key: "anuncio", label: "Anúncio" },
              { key: "teaser", label: "Teaser" },
              { key: "presave_open", label: "Pré-save" },
              { key: "release", label: "Lançamento" },
              { key: "follow_up", label: "Follow-up" },
            ] as { key: keyof MarketingDates; label: string }[]
          ).map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input
                type="date"
                value={marketingDates[key]}
                onChange={(e) =>
                  setMarketingDates((d) => ({ ...d, [key]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Parcerias confirmadas</Label>
        <Textarea
          rows={3}
          value={partnershipsConfirmed}
          onChange={(e) => setPartnershipsConfirmed(e.target.value)}
          placeholder="Marcas, curadores, influencers confirmados..."
        />
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">
          Lista de mídia alvo
        </div>
        {mediaContacts.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum contato encontrado.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {mediaContacts.map((c) => {
              const target = selectedTargets.find((t) => t.contact_id === c.id);
              const selected = !!target;
              return (
                <div key={c.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => toggleTarget(c.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input hover:bg-accent"
                    )}
                  >
                    {c.name}
                  </button>
                  {selected && (
                    <Select
                      value={target.role ?? ""}
                      onValueChange={(v) => setTargetRole(c.id, v)}
                    >
                      <SelectTrigger className="h-6 text-xs">
                        <SelectValue placeholder="Papel" />
                      </SelectTrigger>
                      <SelectContent>
                        {MEDIA_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );
}
