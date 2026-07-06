// Página Estratégia — indicadores estratégicos espelhados do PC
// (strategy_mirror): OKRs com progresso, matriz de Eisenhower e SWOT.
// Abre pelo círculo verde da Home; leitura pura (edição é no PC).

export type StrategyPayload = {
  okrs?: {
    objective: string;
    quarter: string;
    progress: number; // 0–100
    krs: { description: string; current: number; target: number; unit: string }[];
  }[];
  eisenhower?: {
    counts: Record<string, number>;
    top: { title: string; quadrant: string; due_date: string | null }[];
  };
  swot?: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
};

const QUADRANTS: { id: string; label: string; cls: string }[] = [
  { id: "do", label: "Fazer agora", cls: "q-do" },
  { id: "schedule", label: "Agendar", cls: "q-schedule" },
  { id: "delegate", label: "Delegar", cls: "q-delegate" },
  { id: "eliminate", label: "Eliminar", cls: "q-eliminate" },
];

const SWOT_BLOCKS: { key: keyof NonNullable<StrategyPayload["swot"]>; label: string; cls: string }[] = [
  { key: "strengths", label: "Forças", cls: "sw-s" },
  { key: "weaknesses", label: "Fraquezas", cls: "sw-w" },
  { key: "opportunities", label: "Oportunidades", cls: "sw-o" },
  { key: "threats", label: "Ameaças", cls: "sw-t" },
];

function fmtKrValue(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function Estrategia({ data, onClose }: { data: StrategyPayload | null; onClose: () => void }) {
  const okrs = data?.okrs ?? [];
  const eis = data?.eisenhower ?? null;
  const swot = data?.swot ?? null;
  const empty = okrs.length === 0 && !eis && !swot;

  return (
    <div className="fullpage" role="dialog" aria-label="Estratégia">
      <div className="fullpage-head">
        <button className="iconbtn" onClick={onClose} aria-label="Voltar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <strong>Estratégia</strong>
        <span className="fullpage-spacer" />
      </div>

      <div className="fullpage-body">
        {empty && (
          <p className="muted small" style={{ marginTop: "1rem" }}>
            Sem indicadores ainda. Crie OKRs, classifique tarefas na matriz e preencha o SWOT no PC — eles chegam aqui no próximo sync.
          </p>
        )}

        {okrs.length > 0 && (
          <section className="home-section">
            <h2 className="section-head">OKRs</h2>
            <div className="okr-list">
              {okrs.map((o, i) => (
                <div key={i} className="card okr-card">
                  <div className="okr-head">
                    <span className="okr-objective">{o.objective}</span>
                    <span className="okr-quarter">{o.quarter}</span>
                  </div>
                  <div className="okr-bar" role="progressbar" aria-valuenow={o.progress} aria-valuemin={0} aria-valuemax={100}>
                    <span className="okr-bar-fill" style={{ width: `${Math.min(100, Math.max(0, o.progress))}%` }} />
                  </div>
                  <span className="okr-pct">{o.progress}%</span>
                  {o.krs.length > 0 && (
                    <ul className="okr-krs">
                      {o.krs.map((kr, j) => (
                        <li key={j}>
                          <span className="okr-kr-desc">{kr.description}</span>
                          <span className="okr-kr-val">{fmtKrValue(kr.current)}/{fmtKrValue(kr.target)}{kr.unit ? ` ${kr.unit}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {eis && (
          <section className="home-section">
            <h2 className="section-head">Eisenhower</h2>
            <div className="eis-grid">
              {QUADRANTS.map((q) => (
                <div key={q.id} className={"eis-cell " + q.cls}>
                  <span className="eis-num">{eis.counts?.[q.id] ?? 0}</span>
                  <span className="eis-label">{q.label}</span>
                </div>
              ))}
            </div>
            {eis.top?.length > 0 && (
              <div className="card" style={{ marginTop: "0.55rem" }}>
                <ul className="mini-list">
                  {eis.top.map((t, i) => (
                    <li key={i} className="eis-top-row">
                      <span className={"eis-dot " + (t.quadrant === "do" ? "q-do" : "q-schedule")} aria-hidden />
                      <span className="eis-top-title">{t.title}</span>
                      {t.due_date && <span className="eis-top-due">{t.due_date.slice(8, 10)}/{t.due_date.slice(5, 7)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {swot && (
          <section className="home-section">
            <h2 className="section-head">SWOT</h2>
            <div className="swot-grid">
              {SWOT_BLOCKS.map((b) => {
                const items = swot[b.key] ?? [];
                return (
                  <div key={b.key} className={"swot-cell " + b.cls}>
                    <span className="swot-title">{b.label}</span>
                    {items.length === 0 ? (
                      <span className="swot-empty">—</span>
                    ) : (
                      <ul className="swot-items">
                        {items.slice(0, 6).map((it, i) => <li key={i}>{it}</li>)}
                        {items.length > 6 && <li className="swot-more">+{items.length - 6}</li>}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
