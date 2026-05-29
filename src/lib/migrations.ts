import type Database from "@tauri-apps/plugin-sql";

// Migrations versionadas. Cada migration roda em ordem e nunca é re-executada.
// Para adicionar uma nova, basta empilhar no array com o próximo `version`.
type Migration = { version: number; description: string; sql: string };

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "schema inicial: gigs, crm, tarefas, financeiro, equipamentos, settings",
    sql: `
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- ============================================================
      -- CRM
      -- ============================================================
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        types TEXT,                          -- JSON array de tipos (Cliente, Casa, Booker, ...)
        phone TEXT,
        email TEXT,
        instagram TEXT,
        city TEXT,
        tags TEXT,                           -- JSON array
        notes TEXT,
        rating INTEGER,                      -- 1..5
        last_interaction_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contact_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );

      -- ============================================================
      -- GIGs
      -- ============================================================
      CREATE TABLE IF NOT EXISTS gigs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- pré-evento
        date TEXT NOT NULL,                   -- ISO yyyy-mm-dd
        start_time TEXT,                      -- HH:MM
        end_time TEXT,
        venue_name TEXT NOT NULL,
        venue_city TEXT,
        venue_address TEXT,
        promoter_contact_id INTEGER,
        day_contact_name TEXT,
        day_contact_phone TEXT,
        estimated_audience INTEGER,
        cache_amount REAL,
        script_file_path TEXT,                -- relativo a uploads/
        banner_file_path TEXT,
        opportunities TEXT,
        briefing TEXT,
        set_concept TEXT,
        concrete_goals TEXT,
        targets TEXT,
        status TEXT NOT NULL DEFAULT 'Proposta',
          -- Proposta | Confirmada | A Caminho | Concluída | Cancelada

        -- logística e financeiro
        transport TEXT,
        departure_time TEXT,
        equipment_provided TEXT,
        equipment_to_bring TEXT,
        related_expenses TEXT,
        payment_method TEXT,
        payment_status TEXT DEFAULT 'Pendente',
          -- Pendente | 50% pago | Pago integralmente
        payment_due_date TEXT,
        invoice_file_path TEXT,
        general_notes TEXT,

        -- pós-show / debrief
        debrief_strengths TEXT,
        debrief_weaknesses TEXT,
        debrief_learnings TEXT,
        debrief_opportunities_used TEXT,
        debrief_future_opportunities TEXT,
        debrief_promoter_feedback TEXT,
        debrief_technical_notes TEXT,
        debrief_media_content TEXT,
        rating_charisma REAL,                 -- 0..5 (meio ponto)
        rating_charisma_note TEXT,
        rating_technique REAL,
        rating_technique_note TEXT,
        rating_repertoire REAL,
        rating_repertoire_note TEXT,
        debrief_completed_at TEXT,
        debrief_pending INTEGER DEFAULT 0,

        -- integração Google Calendar
        gcal_event_id TEXT,

        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (promoter_contact_id) REFERENCES contacts(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_gigs_date ON gigs(date);
      CREATE INDEX IF NOT EXISTS idx_gigs_status ON gigs(status);

      -- rascunhos de debrief (autosave enquanto o usuário preenche)
      CREATE TABLE IF NOT EXISTS gig_debrief_drafts (
        gig_id INTEGER PRIMARY KEY,
        payload TEXT NOT NULL,                -- JSON do form
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE
      );

      -- ============================================================
      -- Tarefas
      -- ============================================================
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT,                        -- GIG | Produção Musical | Conteúdo | Administrativo | Pessoal
        gig_id INTEGER,
        contact_id INTEGER,
        priority TEXT DEFAULT 'Média',        -- Baixa | Média | Alta | Urgente
        status TEXT DEFAULT 'A fazer',        -- A fazer | Em andamento | Concluída | Cancelada
        due_date TEXT,
        tags TEXT,                            -- JSON array
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE SET NULL,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

      CREATE TABLE IF NOT EXISTS subtasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        done INTEGER DEFAULT 0,
        position INTEGER DEFAULT 0,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- ============================================================
      -- Financeiro
      -- ============================================================
      CREATE TABLE IF NOT EXISTS finance_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,                   -- income | expense
        is_default INTEGER DEFAULT 0,
        UNIQUE(name, kind)
      );

      CREATE TABLE IF NOT EXISTS finance_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,                   -- income | expense
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        description TEXT,
        category_id INTEGER,
        gig_id INTEGER,
        contact_id INTEGER,
        status TEXT DEFAULT 'Previsto',       -- Previsto | Recebido/Pago
        payment_method TEXT,
        expense_type TEXT,                    -- Fixa | Variável (somente para expense)
        receipt_file_path TEXT,
        tax_relevant INTEGER DEFAULT 0,
        recurring_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES finance_categories(id) ON DELETE SET NULL,
        FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE SET NULL,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tx_date ON finance_transactions(date);
      CREATE INDEX IF NOT EXISTS idx_tx_kind ON finance_transactions(kind);

      CREATE TABLE IF NOT EXISTS finance_recurring (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,                   -- income | expense
        amount REAL NOT NULL,
        description TEXT,
        category_id INTEGER,
        day_of_month INTEGER,
        active INTEGER DEFAULT 1,
        FOREIGN KEY (category_id) REFERENCES finance_categories(id) ON DELETE SET NULL
      );

      -- ============================================================
      -- Patrimônio (equipamentos)
      -- ============================================================
      CREATE TABLE IF NOT EXISTS equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER,
        name TEXT NOT NULL,
        purchase_date TEXT,
        purchase_value REAL,
        state TEXT DEFAULT 'Em uso',          -- Em uso | Vendido | Quebrado | Estoque
        location TEXT,
        notes TEXT,
        FOREIGN KEY (transaction_id) REFERENCES finance_transactions(id) ON DELETE SET NULL
      );

      -- ============================================================
      -- App settings + auth do Google Calendar
      -- ============================================================
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS gcal_auth (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        access_token TEXT,
        refresh_token TEXT,
        expires_at TEXT,
        calendar_id TEXT
      );
    `,
  },
  {
    version: 2,
    description: "categorias financeiras padrão",
    sql: `
      INSERT OR IGNORE INTO finance_categories (name, kind, is_default) VALUES
        ('DJ', 'income', 1),
        ('Produção musical', 'income', 1),
        ('Aulas / Mentorias', 'income', 1),
        ('Conteúdo', 'income', 1),
        ('Royalties', 'income', 1),
        ('Venda de samples/presets/packs', 'income', 1),
        ('Residências', 'income', 1),
        ('Outros', 'income', 1),

        ('Equipamentos', 'expense', 1),
        ('Software / Plugins', 'expense', 1),
        ('Cursos / Educação', 'expense', 1),
        ('Marketing', 'expense', 1),
        ('Estúdio', 'expense', 1),
        ('Plataformas', 'expense', 1),
        ('Transporte', 'expense', 1),
        ('Hospedagem', 'expense', 1),
        ('Profissionais terceirizados', 'expense', 1),
        ('Impostos / Taxas', 'expense', 1),
        ('Outros', 'expense', 1);
    `,
  },
  {
    version: 3,
    description: "Gigs ganham main_goal, prep_state e main_goal_task_id",
    sql: `
      ALTER TABLE gigs ADD COLUMN main_goal TEXT;
      ALTER TABLE gigs ADD COLUMN prep_state TEXT;
      ALTER TABLE gigs ADD COLUMN main_goal_task_id INTEGER;
    `,
  },
  {
    version: 4,
    description: "Venues e Fãs como módulos próprios; gigs.venue_id FK",
    sql: `
      CREATE TABLE IF NOT EXISTS venues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        city TEXT,
        state TEXT,
        country TEXT,
        address TEXT,
        founded_year INTEGER,
        capacity INTEGER,
        owner_name TEXT,
        owner_phone TEXT,
        owner_email TEXT,
        instagram TEXT,
        website TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE gigs ADD COLUMN venue_id INTEGER;

      CREATE TABLE IF NOT EXISTS fans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'Possível fã',
        instagram TEXT,
        email TEXT,
        phone TEXT,
        city TEXT,
        tags TEXT,
        notes TEXT,
        last_interaction_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS fan_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fan_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fan_id) REFERENCES fans(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_fans_level ON fans(level);
    `,
  },
];

/** Executa todas as migrations pendentes na ordem. Idempotente. */
export async function runMigrations(db: Database): Promise<{ applied: number[] }> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const rows = await db.select<{ version: number }[]>(
    "SELECT version FROM _migrations"
  );
  const already = new Set(rows.map((r) => r.version));
  const applied: number[] = [];

  for (const m of MIGRATIONS) {
    if (already.has(m.version)) continue;
    // execute() roda só uma statement em alguns drivers; split em ; é suficiente aqui.
    const statements = m.sql
      .split(/;\s*(?=\n)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await db.execute(stmt);
    }
    await db.execute(
      "INSERT INTO _migrations (version, description) VALUES ($1, $2)",
      [m.version, m.description]
    );
    applied.push(m.version);
  }

  return { applied };
}
