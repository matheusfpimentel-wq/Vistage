import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Link } from "react-router-dom";
import { LevelBadge } from "./LevelBadge";
import { listVipFansDerived, listVipGigsForFan } from "../api";
import type { FanLevel } from "../types";

type VipFan = { fan_id: number; name: string; level: FanLevel; lists: number };

/**
 * Visão DERIVADA e read-only de "Fãs que já foram VIP". A montagem das listas
 * VIP agora mora na aba Preparação de cada GIG (GigVipList); aqui só listamos
 * quem é membro de alguma lista, com link pro perfil e em quais GIGs.
 */
export function FanVipDerivedPanel({ onOpenFan }: { onOpenFan?: (id: number) => void }) {
  const [fans, setFans] = useState<VipFan[]>([]);
  const [gigsByFan, setGigsByFan] = useState<
    Record<number, { gig_id: number; gig_name: string; list_name: string }[]>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const rows = await listVipFansDerived();
        if (!alive) return;
        setFans(rows);
        const entries = await Promise.all(
          rows.map(async (r) => [r.fan_id, await listVipGigsForFan(r.fan_id)] as const)
        );
        if (!alive) return;
        setGigsByFan(Object.fromEntries(entries));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
        As listas VIP agora são montadas na aba <strong>Preparação</strong> de cada GIG.
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : fans.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum fã foi VIP ainda. Monte listas na aba Preparação de uma GIG.
        </p>
      ) : (
        <div className="space-y-2">
          {fans.map((f) => {
            const vipGigs = gigsByFan[f.fan_id] ?? [];
            return (
              <div key={f.fan_id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left text-sm font-medium hover:underline"
                    onClick={() => onOpenFan?.(f.fan_id)}
                  >
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    {f.name}
                  </button>
                  <LevelBadge level={f.level} />
                </div>
                {vipGigs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {vipGigs.map((g) => (
                      <Link
                        key={`${g.gig_id}-${g.list_name}`}
                        to={`/gigs?open=${g.gig_id}`}
                        className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs hover:border-primary"
                      >
                        <span className="font-medium">{g.gig_name}</span>
                        <span className="text-muted-foreground">· {g.list_name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
