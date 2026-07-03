import { useState } from "react";
import { supabase } from "../supabase";
import { sendCapture } from "../capture";
import { haptic } from "../native";

/**
 * §1 — Check-in da GIG, na porta/cabine. Superfície PRÓPRIA (não é o Tempo de
 * palco): marca VIP que chegou, fã presente (busca rápida) e cadastra fã novo já
 * presente. Tudo offline-first via fila; o desktop aplica na revisão de capturas.
 */

export type Vip = { ref_id: number; name: string; arrived: boolean };
type FanHit = { source_id: string; title: string; meta: { instagram?: string | null; city?: string | null } | null };

function XIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
}

export function Checkin({ gigId, gigTitle, vips, onClose }: { gigId: number; gigTitle: string; vips: Vip[]; onClose: () => void }) {
  const [arrived, setArrived] = useState<Set<number>>(() => new Set(vips.filter((v) => v.arrived).map((v) => v.ref_id)));
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<FanHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIg, setNewIg] = useState("");
  const [added, setAdded] = useState(0);

  async function search(t: string) {
    setTerm(t);
    if (t.trim().length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await supabase
        .from("catalog_mirror")
        .select("source_id, title, meta")
        .eq("kind", "fan")
        .ilike("search_text", `%${t.trim()}%`)
        .limit(20);
      setHits((data ?? []) as FanHit[]);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  async function vipArrived(v: Vip) {
    if (arrived.has(v.ref_id)) return;
    setArrived((s) => new Set(s).add(v.ref_id));
    void haptic("medium");
    try {
      await sendCapture("gig_checkin", { gig_id: gigId, ref_id: v.ref_id, kind: "vip" });
    } catch {
      /* a fila reenvia */
    }
  }

  async function fanPresent(f: FanHit) {
    if (present.has(f.source_id)) return;
    setPresent((s) => new Set(s).add(f.source_id));
    void haptic("medium");
    const fid = Number(f.source_id);
    try {
      if (Number.isFinite(fid)) await sendCapture("gig_checkin", { gig_id: gigId, ref_id: fid, kind: "fan" });
    } catch {
      /* a fila reenvia */
    }
  }

  async function quickAdd() {
    const nome = newName.trim();
    if (!nome) return;
    void haptic("medium");
    setNewName("");
    setNewIg("");
    setAdded((c) => c + 1);
    try {
      await sendCapture("fan_quick_add", { gig_id: gigId, nome, instagram: newIg.trim() || null });
    } catch {
      /* a fila reenvia */
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet checkin-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Check-in · {gigTitle}</strong>
          <button className="iconbtn" onClick={onClose} aria-label="Fechar"><XIcon /></button>
        </div>

        <h3 className="checkin-h">Lista VIP</h3>
        {vips.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>Sem VIPs nesta GIG. A lista se cadastra no PC (GIG › Preparação).</p>
        ) : (
          <ul className="mini-list">
            {vips.map((v) => {
              const ok = arrived.has(v.ref_id);
              return (
                <li key={v.ref_id} className="checkin-row">
                  <span className="checkin-name">{v.name}</span>
                  <button type="button" className={"checkin-btn" + (ok ? " ok" : "")} disabled={ok} onClick={() => void vipArrived(v)}>
                    {ok ? "✓ chegou" : "chegou"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <h3 className="checkin-h">Fãs presentes</h3>
        <input className="checkin-search" value={term} onChange={(e) => void search(e.target.value)} placeholder="Buscar fã pelo nome…" />
        {searching && <p className="muted small" style={{ margin: "0.3rem 0 0" }}>Buscando…</p>}
        {hits.length > 0 && (
          <ul className="mini-list">
            {hits.map((f) => {
              const ok = present.has(f.source_id);
              return (
                <li key={f.source_id} className="checkin-row">
                  <span className="checkin-body">
                    <span className="checkin-name">{f.title}</span>
                    {f.meta?.instagram && <span className="cold-sub">{f.meta.instagram}</span>}
                  </span>
                  <button type="button" className={"checkin-btn" + (ok ? " ok" : "")} disabled={ok} onClick={() => void fanPresent(f)}>
                    {ok ? "✓ presente" : "presente"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <h3 className="checkin-h">Novo fã na porta</h3>
        <div className="checkin-add">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome" />
          <input value={newIg} onChange={(e) => setNewIg(e.target.value)} placeholder="@instagram (opcional)" />
          <button className="primary" disabled={!newName.trim()} onClick={() => void quickAdd()}>Adicionar presente</button>
        </div>
        {added > 0 && <p className="muted small" style={{ margin: "0.4rem 0 0" }}>{added} fã(s) novo(s) enviados · entram na revisão do PC.</p>}
      </div>
    </div>
  );
}
