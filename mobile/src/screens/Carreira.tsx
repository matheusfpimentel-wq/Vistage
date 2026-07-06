// Página Carreira em números — os MESMOS agregados da página do desktop
// (career_stats: loadWrapped em dois cortes, vida inteira e ano corrente).
// Abre pelo círculo azul da Home; leitura pura.
import { useState } from "react";

type Wrapped = {
  totalGigs?: number;
  totalRevenue?: number;
  avgCache?: number;
  topCity?: string | null;
  topCityCount?: number;
  topContractor?: string | null;
  topContractorRevenue?: number;
  topMonth?: string | null;
  topMonthCount?: number;
  avgRating?: number | null;
  newFans?: number;
  focusSessionCount?: number;
  focusHours?: number;
  uniqueCities?: number;
  bestGig?: { name: string; date: string; cache: number } | null;
  newTracks?: number;
  aulasGiven?: number;
  teachingRevenue?: number;
  activeStudents?: number;
  partiesRealized?: number;
  contentPublished?: number;
  ideasCaptured?: number;
  tasksCompleted?: number;
  tasksCreated?: number;
};

export type CareerPayload = {
  year_label?: string;
  all_time?: Wrapped;
  year?: Wrapped;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string | null }) {
  return (
    <div className="career-tile">
      <span className="career-value">{value}</span>
      <span className="career-label">{label}</span>
      {sub && <span className="career-sub">{sub}</span>}
    </div>
  );
}

export function Carreira({ data, onClose }: { data: CareerPayload | null; onClose: () => void }) {
  const [cut, setCut] = useState<"all" | "year">("all");
  const w: Wrapped = (cut === "all" ? data?.all_time : data?.year) ?? {};
  const yearLabel = data?.year_label ?? String(new Date().getFullYear());
  const has = (n?: number | null) => (n ?? 0) > 0;

  const empty =
    !has(w.totalGigs) && !has(w.newTracks) && !has(w.aulasGiven) && !has(w.partiesRealized) &&
    !has(w.contentPublished) && !has(w.ideasCaptured) && !has(w.newFans) && !has(w.focusSessionCount);

  return (
    <div className="fullpage" role="dialog" aria-label="Carreira em números">
      <div className="fullpage-head">
        <button className="iconbtn" onClick={onClose} aria-label="Voltar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <strong>Carreira em números</strong>
        <span className="fullpage-spacer" />
      </div>

      <div className="fullpage-body">
        <div className="career-cut" role="tablist" aria-label="Período">
          <button role="tab" aria-selected={cut === "all"} className={"career-cut-btn" + (cut === "all" ? " on" : "")} onClick={() => setCut("all")}>Tudo</button>
          <button role="tab" aria-selected={cut === "year"} className={"career-cut-btn" + (cut === "year" ? " on" : "")} onClick={() => setCut("year")}>{yearLabel}</button>
        </div>

        {empty ? (
          <p className="muted small" style={{ marginTop: "1rem" }}>
            Sem números neste corte ainda. Eles chegam do PC no próximo sync.
          </p>
        ) : (
          <>
            <section className="home-section">
              <h2 className="section-head">GIGs</h2>
              <div className="career-grid">
                <Tile label="Shows" value={w.totalGigs ?? 0} />
                <Tile label="Cidades" value={w.uniqueCities ?? 0} sub={w.topCity ? `top: ${w.topCity} (${w.topCityCount}×)` : null} />
                {w.topMonth && <Tile label="Mês mais agitado" value={w.topMonth} sub={`${w.topMonthCount} shows`} />}
                {w.avgRating != null && <Tile label="Nota média" value={`${w.avgRating.toFixed(1)} / 5`} />}
              </div>
            </section>

            {(has(w.totalRevenue) || w.bestGig) && (
              <section className="home-section">
                <h2 className="section-head">Financeiro</h2>
                <div className="career-grid">
                  <Tile label="Receita (concluídas)" value={BRL.format(w.totalRevenue ?? 0)} />
                  <Tile label="Cachê médio" value={BRL.format(w.avgCache ?? 0)} />
                  {w.bestGig && <Tile label="Maior cachê" value={BRL.format(w.bestGig.cache)} sub={w.bestGig.name} />}
                </div>
              </section>
            )}

            {(has(w.aulasGiven) || has(w.activeStudents)) && (
              <section className="home-section">
                <h2 className="section-head">Ensino</h2>
                <div className="career-grid">
                  <Tile label="Aulas" value={w.aulasGiven ?? 0} />
                  <Tile label="Alunos" value={w.activeStudents ?? 0} />
                  {has(w.teachingRevenue) && <Tile label="Receita com aulas" value={BRL.format(w.teachingRevenue ?? 0)} />}
                </div>
              </section>
            )}

            <section className="home-section">
              <h2 className="section-head">Produção & Comunidade</h2>
              <div className="career-grid">
                <Tile label="Músicas iniciadas" value={w.newTracks ?? 0} />
                <Tile label="Festas realizadas" value={w.partiesRealized ?? 0} />
                <Tile label="Conteúdos publicados" value={w.contentPublished ?? 0} />
                <Tile label="Ideias capturadas" value={w.ideasCaptured ?? 0} />
                <Tile label="Novos fãs" value={w.newFans ?? 0} />
                {w.topContractor && <Tile label="Contratante top" value={w.topContractor} sub={BRL.format(w.topContractorRevenue ?? 0)} />}
              </div>
            </section>

            <section className="home-section">
              <h2 className="section-head">Foco & Gestão</h2>
              <div className="career-grid">
                <Tile label="Sessões de foco" value={w.focusSessionCount ?? 0} />
                <Tile label="Horas em foco" value={`${w.focusHours ?? 0}h`} />
                <Tile label="Tarefas concluídas" value={w.tasksCompleted ?? 0} />
                <Tile label="Tarefas novas" value={w.tasksCreated ?? 0} />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
