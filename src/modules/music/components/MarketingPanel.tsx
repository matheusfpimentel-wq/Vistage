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

const STRATEGIES: { value: string; label: string; description: string }[] = [
  { value: "waterfall", label: "Waterfall (Cascata)", description: "Lançamento de singles em sequência, onde cada novo lançamento agrupa e anexa as faixas lançadas anteriormente no mesmo arquivo para acumular reproduções." },
  { value: "drop_unico", label: "Drop Único (Single Isolado)", description: "Lançamento de apenas uma música com 100% da verba, foco promocional e criação de conteúdo direcionados para um único link." },
  { value: "album_direto", label: "Álbum Direto (Full Drop)", description: "Disponibilização de um projeto completo (8+ faixas) de uma só vez, focado em narrativa, conceito e retenção de fãs fiéis." },
  { value: "surprise_drop", label: "Surprise Drop", description: "Lançamento sem aviso prévio, sem teasers ou campanha de pré-save, contando com o choque e o engajamento instantâneo das redes sociais." },
  { value: "ep_focus_track", label: "EP com Focus Track", description: "Lançamento de um projeto curto (3 a 5 faixas), mas com todos os esforços de marketing e pitching focados estritamente em uma única música principal." },
  { value: "singles_sequenciais", label: "Singles Sequenciais (Drip Feed)", description: "Lançamento constante de singles (ex: um por mês) para manter o algoritmo sempre alimentado e garantir presença no 'Radar de Novidades'." },
  { value: "split_release", label: "Split Release (Collab / Feat)", description: "Lançamento conjunto onde a faixa é registrada com dois ou mais 'Artistas Principais', aparecendo no perfil de todos e unindo as bases de fãs." },
  { value: "edits_bootlegs", label: "Edits / Bootlegs (Teste de Pista)", description: "Lançamento de versões não oficiais e remixes de hits no SoundCloud e YouTube para validar a sonoridade e ganhar tração na cena club e de DJs." },
  { value: "sped_up", label: "Sped Up / Slowed Down", description: "Lançamento de versões com andamento acelerado ou desacelerado (com reverb) semanas após a original, visando viralização no TikTok e Reels." },
  { value: "direct_to_fan", label: "Direct-to-Fan (Bandcamp/Patreon)", description: "Lançamento pago ou exclusivo diretamente para a comunidade de super fãs antes de disponibilizar gratuitamente nos streamings." },
  { value: "live_set_id", label: "Live Set 'ID' (Estreia em Mixtape)", description: "Tocar a faixa de forma anônima ('ID') em um DJ set, podcast ou festa ao vivo, criando expectativa e escassez antes de revelar o lançamento oficial." },
  { value: "dj_pool_promo", label: "DJ Pool Promo (Club First)", description: "Envio antecipado da faixa para plataformas exclusivas de DJs (DJ Pools), garantindo que a música já esteja tocando nas boates antes de chegar à internet." },
  { value: "double_single", label: "Double Single (A/B Drop)", description: "Lançamento de duas faixas no mesmo dia (como um disco de vinil: um 'Lado A' mais comercial e um 'Lado B' conceitual) para testar a recepção do algoritmo." },
  { value: "remix_pack", label: "Remix Pack", description: "Lançamento de um EP com a faixa original acompanhada de diversas versões feitas por produtores convidados, espalhando a música por outros nichos e gêneros." },
  { value: "deluxe_edition", label: "Deluxe Edition (Re-lançamento)", description: "Relançamento de um álbum ou EP meses depois do original, adicionando faixas inéditas, remixes ou versões acústicas para reaquecer o projeto." },
  { value: "visual_album", label: "Visual Album (Foco Audiovisual)", description: "Lançamento onde a música é inseparável do vídeo, liberando videoclipes para todas as faixas simultaneamente ou um curta-metragem contínuo." },
  { value: "gated_release", label: "Gated Release (Lançamento Condicionado)", description: "A música ou o link de acesso só é liberado mediante uma ação coletiva dos fãs (ex: bater meta de comentários, meta de pré-saves ou compra de ingresso)." },
];
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
        <Label className="text-xs">Estratégia de lançamento <span className="font-normal text-muted-foreground">(passe o mouse para ver detalhes)</span></Label>
        <div className="max-h-48 overflow-y-auto rounded-md border p-1.5 space-y-0.5">
          <button
            type="button"
            onClick={() => setReleaseStrategy("")}
            className={`w-full flex items-center gap-2 rounded px-2 py-1 text-left text-xs transition hover:bg-accent ${!releaseStrategy ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${!releaseStrategy ? "bg-primary" : "bg-muted-foreground/30"}`} />
            Não definido
          </button>
          {STRATEGIES.map((s) => (
            <button
              key={s.value}
              type="button"
              title={s.description}
              onClick={() => setReleaseStrategy(s.value === releaseStrategy ? "" : s.value)}
              className={`w-full flex items-center gap-2 rounded px-2 py-1 text-left text-xs transition hover:bg-accent ${releaseStrategy === s.value ? "bg-primary/10 text-primary font-medium" : "text-foreground"}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${releaseStrategy === s.value ? "bg-primary" : "bg-muted-foreground/30"}`} />
              {s.label}
            </button>
          ))}
        </div>
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
