import { getDb } from "./db";

/**
 * Popula o banco com dados de exemplo: 4 GIGs em estados diferentes,
 * 5 contatos, 6 tarefas e algumas transações financeiras.
 * Só roda se o banco estiver vazio (sem GIGs, contatos ou tarefas).
 */

function isoDaysOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function isDatabaseEmpty(): Promise<boolean> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT (
      (SELECT COUNT(*) FROM gigs) +
      (SELECT COUNT(*) FROM contacts) +
      (SELECT COUNT(*) FROM tasks) +
      (SELECT COUNT(*) FROM finance_transactions WHERE recurring_id IS NULL)
    ) as n`
  );
  return (rows[0]?.n ?? 0) === 0;
}

export async function seedExampleData(): Promise<{
  contacts: number;
  gigs: number;
  tasks: number;
  transactions: number;
}> {
  const db = getDb();

  // ---------------------------------------------------------- Contatos
  const audioId = Number(
    (
      await db.execute(
        `INSERT INTO contacts (name, types, phone, email, instagram, city, tags, notes, rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          "Audio Club",
          JSON.stringify(["Casa / Estabelecimento"]),
          "(11) 99999-1111",
          "contato@audioclub.com",
          "@audioclubsp",
          "São Paulo",
          JSON.stringify(["techno", "house"]),
          "Casa principal de techno em SP. Sempre paga em dia.",
          5,
        ]
      )
    ).lastInsertId
  );

  const lautaroId = Number(
    (
      await db.execute(
        `INSERT INTO contacts (name, types, phone, email, instagram, city, tags, rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          "Lautaro Booking",
          JSON.stringify(["Agente / Booker"]),
          "(11) 98888-2222",
          "lautaro@booking.com",
          "@lautarobooking",
          "São Paulo",
          JSON.stringify(["agente", "internacional"]),
          4,
        ]
      )
    ).lastInsertId
  );

  await db.execute(
    `INSERT INTO contacts (name, types, phone, instagram, city, tags, rating)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      "DJ Mariana",
      JSON.stringify(["Colaborador"]),
      "(11) 97777-3333",
      "@mariananightset",
      "São Paulo",
      JSON.stringify(["b2b", "amigos"]),
      5,
    ]
  );

  await db.execute(
    `INSERT INTO contacts (name, types, phone, email, city, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      "Studio Mood",
      JSON.stringify(["Fornecedor"]),
      "(11) 96666-4444",
      "reservas@studiomood.com.br",
      "São Paulo",
      "Estúdio onde gravo. R$ 180/hora.",
    ]
  );

  await db.execute(
    `INSERT INTO contacts (name, types, email, instagram, city, tags)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      "Distroideal",
      JSON.stringify(["Fornecedor"]),
      "suporte@distroideal.com",
      "@distroideal",
      "Online",
      JSON.stringify(["distribuição", "plataforma"]),
    ]
  );

  // ---------------------------------------------------------- GIGs

  // Confirmada — daqui 14 dias
  const futureDate = isoDaysOffset(14);
  const gig1Id = Number(
    (
      await db.execute(
        `INSERT INTO gigs (
          date, start_time, end_time, venue_name, venue_city, venue_address,
          promoter_contact_id, day_contact_name, day_contact_phone,
          estimated_audience, cache_amount, briefing, set_concept,
          concrete_goals, targets, status,
          transport, departure_time, equipment_provided, equipment_to_bring,
          payment_method, payment_status, payment_due_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16,
          $17, $18, $19, $20,
          $21, $22, $23
        )`,
        [
          futureDate,
          "23:00",
          "01:00",
          "Audio Club",
          "São Paulo",
          "Av. Francisco Matarazzo, 694",
          audioId,
          "Rafa (produção)",
          "(11) 91234-5678",
          1200,
          3500,
          "Festa de aniversário do clube. Headliner anterior cancelou, peguei o slot. Pediram set de techno com pegada melódica.",
          "Subida progressiva: melódico no início, mais peso lá pelas 23h45.",
          "Tocar 4 unreleased meus.\nFazer contato com o promoter do Warung.",
          "Promoter do Warung\nFotógrafa @ana.tilt",
          "Confirmada",
          "Uber Black",
          "21:00",
          "CDJ-3000, DJM-A9, 2 monitores L'Acoustics",
          "Pendrives, fone, adaptador",
          "PIX",
          "Pendente",
          isoDaysOffset(20),
        ]
      )
    ).lastInsertId
  );

  // Confirmada — daqui 2 dias
  await db.execute(
    `INSERT INTO gigs (
      date, start_time, end_time, venue_name, venue_city, promoter_contact_id,
      cache_amount, briefing, status, payment_status, payment_due_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      isoDaysOffset(2),
      "22:00",
      "23:30",
      "Club Boate Z",
      "Campinas",
      lautaroId,
      1500,
      "Set abrindo a noite. Estilo afro-house.",
      "Confirmada",
      "Pago parcialmente",
      isoDaysOffset(5),
    ]
  );

  // Concluída com debrief completo
  const pastConcluida = Number(
    (
      await db.execute(
        `INSERT INTO gigs (
          date, start_time, end_time, venue_name, venue_city, promoter_contact_id,
          cache_amount, briefing, status,
          payment_status, payment_method,
          debrief_strengths, debrief_weaknesses, debrief_learnings,
          debrief_opportunities_used, debrief_future_opportunities,
          debrief_promoter_feedback, debrief_technical_notes,
          rating_charisma, rating_technique, rating_repertoire,
          rating_charisma_note,
          debrief_completed_at, debrief_pending
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11,
          $12, $13, $14,
          $15, $16,
          $17, $18,
          $19, $20, $21,
          $22,
          $23, 0
        )`,
        [
          isoDaysOffset(-21),
          "00:00",
          "03:00",
          "Cãmara",
          "Belo Horizonte",
          null,
          2200,
          "Festa Origem. Curadoria deles é mais minimal.",
          "Concluída",
          "Pago integralmente",
          "PIX",
          "Energia muito alta na chegada da pista. Boa leitura nos primeiros 20 minutos.",
          "Ficou repetitivo no meio (45-1h15). Faltou um break.",
          "Set de 3h precisa de mais quebras claras de mood. Levar um track \"de descanso\" pra eu mesmo respirar.",
          "Conversei com o dono do Maquinhário, vai tentar me encaixar em agosto.",
          "Festival da Origem em outubro — me chamaram pra demo set.",
          "\"Foi exatamente o que esperávamos.\" Querem me chamar de novo em 2 meses.",
          "Mixer com 1 canal cortando intermitente — tive que isolar o CDJ 2 só pro warm-up.",
          4.5,
          4.0,
          4.5,
          "Soltei na pista no último terço — primeiras 2h fiquei muito travado atrás do equipamento.",
          isoDaysOffset(-20),
        ]
      )
    ).lastInsertId
  );

  // Concluída com debrief pendente
  await db.execute(
    `INSERT INTO gigs (
      date, start_time, end_time, venue_name, venue_city,
      cache_amount, status,
      payment_status, payment_method,
      debrief_pending
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)`,
    [
      isoDaysOffset(-5),
      "23:30",
      "01:30",
      "Bar Underground",
      "São Paulo",
      800,
      "Concluída",
      "Pago integralmente",
      "Dinheiro",
    ]
  );

  // ---------------------------------------------------------- Tarefas

  await db.execute(
    `INSERT INTO tasks (title, description, category, gig_id, contact_id, priority, status, due_date, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      "Preparar setlist do Audio Club",
      "Foco em techno melódico. Incluir 4 unreleased.",
      "GIG",
      gig1Id,
      audioId,
      "Alta",
      "Em andamento",
      isoDaysOffset(9),
      JSON.stringify(["setlist", "techno"]),
    ]
  );

  await db.execute(
    `INSERT INTO tasks (title, category, gig_id, contact_id, priority, status, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      "Confirmar contato 3 dias antes — Audio Club",
      "GIG",
      gig1Id,
      audioId,
      "Alta",
      "A fazer",
      isoDaysOffset(11),
    ]
  );

  await db.execute(
    `INSERT INTO tasks (title, category, priority, status, due_date)
     VALUES ($1, $2, $3, $4, $5)`,
    ["Finalizar mix do EP", "Produção Musical", "Alta", "Em andamento", isoDaysOffset(7)]
  );

  await db.execute(
    `INSERT INTO tasks (title, description, category, priority, status, due_date)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      "Gravar vídeo de processo no estúdio",
      "Conteúdo curto pro Instagram. 30s mostrando produção.",
      "Conteúdo",
      "Média",
      "A fazer",
      isoDaysOffset(4),
    ]
  );

  await db.execute(
    `INSERT INTO tasks (title, category, priority, status, due_date)
     VALUES ($1, $2, $3, $4, $5)`,
    ["Pagar mensalidade Distroideal", "Administrativo", "Média", "A fazer", isoDaysOffset(1)]
  );

  await db.execute(
    `INSERT INTO tasks (title, category, gig_id, priority, status, due_date)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      "Debrief: BAR Underground",
      "Pós-show",
      pastConcluida,
      "Alta",
      "A fazer",
      isoDaysOffset(0),
    ]
  );

  // ---------------------------------------------------------- Financeiro

  // pega ids de categorias já existentes
  const cats = await db.select<{ id: number; name: string; kind: string }[]>(
    "SELECT id, name, kind FROM finance_categories"
  );
  const catId = (name: string, kind: "income" | "expense") =>
    cats.find((c) => c.name === name && c.kind === kind)?.id ?? null;

  // Receitas
  await db.execute(
    `INSERT INTO finance_transactions
       (kind, amount, date, description, category_id, gig_id, status, payment_method)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      "income",
      2200,
      isoDaysOffset(-21),
      "Cachê — Cãmara (BH)",
      catId("DJ", "income"),
      pastConcluida,
      "Recebido",
      "PIX",
    ]
  );

  await db.execute(
    `INSERT INTO finance_transactions
       (kind, amount, date, description, category_id, status, payment_method)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      "income",
      850,
      isoDaysOffset(-9),
      "Royalties — DistroKid jan/2024",
      catId("Royalties", "income"),
      "Recebido",
      "Transferência",
    ]
  );

  await db.execute(
    `INSERT INTO finance_transactions
       (kind, amount, date, description, category_id, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      "income",
      450,
      isoDaysOffset(-14),
      "Aula particular de produção (Pedro)",
      catId("Aulas / Mentorias", "income"),
      "Recebido",
    ]
  );

  // Despesas
  await db.execute(
    `INSERT INTO finance_transactions
       (kind, amount, date, description, category_id, status, payment_method, expense_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      "expense",
      540,
      isoDaysOffset(-10),
      "Estúdio Mood — 3h",
      catId("Estúdio", "expense"),
      "Pago",
      "PIX",
      "Variável",
    ]
  );

  await db.execute(
    `INSERT INTO finance_transactions
       (kind, amount, date, description, category_id, status, payment_method, expense_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      "expense",
      29,
      isoDaysOffset(-3),
      "Distroideal mensal",
      catId("Plataformas", "expense"),
      "Pago",
      "Cartão",
      "Fixa",
    ]
  );

  await db.execute(
    `INSERT INTO finance_transactions
       (kind, amount, date, description, category_id, status, payment_method, expense_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      "expense",
      4800,
      isoDaysOffset(-40),
      "CDJ-3000 (par)",
      catId("Equipamentos", "expense"),
      "Pago",
      "Cartão",
      "Variável",
    ]
  );

  // Interação registrada
  await db.execute(
    `INSERT INTO contact_interactions (contact_id, date, note)
     VALUES ($1, $2, $3)`,
    [
      audioId,
      isoDaysOffset(-7),
      "Liguei pra confirmar GIG do dia X. Pediram release atualizado.",
    ]
  );

  return {
    contacts: 5,
    gigs: 4,
    tasks: 6,
    transactions: 6,
  };
}
