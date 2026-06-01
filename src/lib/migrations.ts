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
  {
    version: 5,
    description: "Gestão de Conteúdo e Banco de Ideias",
    sql: `
      CREATE TABLE IF NOT EXISTS content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        script TEXT,
        networks TEXT,                          -- JSON array
        format TEXT,                            -- Reels | Story | Post | Carrossel | Vídeo longo | Live | Podcast
        purpose TEXT,
        status TEXT NOT NULL DEFAULT 'Ideia',
        due_date TEXT,
        publish_date TEXT,
        published_at TEXT,
        post_url TEXT,
        metric_views INTEGER,
        metric_likes INTEGER,
        metric_comments INTEGER,
        metric_shares INTEGER,
        metric_saves INTEGER,
        notes TEXT,
        task_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);
      CREATE INDEX IF NOT EXISTS idx_content_publish ON content(publish_date);

      CREATE TABLE IF NOT EXISTS ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT,
        category TEXT,
        tags TEXT,                              -- JSON array
        heat INTEGER NOT NULL DEFAULT 1,        -- 1=fria, 2=morna, 3=quente
        maturation TEXT NOT NULL DEFAULT 'Embrião',
        converted_to TEXT,                      -- task | content | gig
        converted_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_ideas_maturation ON ideas(maturation);
    `,
  },
  {
    version: 6,
    description: "Aulas (alunos, pacotes, sessões)",
    sql: `
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        instagram TEXT,
        city TEXT,
        acquisition TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS class_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        total_classes INTEGER NOT NULL,
        price REAL,
        description TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS student_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        package_id INTEGER,
        total_classes INTEGER NOT NULL,
        used_classes INTEGER DEFAULT 0,
        purchased_at TEXT NOT NULL,
        status TEXT DEFAULT 'Ativo',
        notes TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (package_id) REFERENCES class_packages(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        student_package_id INTEGER,
        date TEXT NOT NULL,
        start_time TEXT,
        duration_min INTEGER,
        subject TEXT,
        status TEXT DEFAULT 'Agendada',
        feedback TEXT,
        amount REAL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (student_package_id) REFERENCES student_packages(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_classes_date ON classes(date);
      CREATE INDEX IF NOT EXISTS idx_classes_student ON classes(student_id);
    `,
  },
  {
    version: 7,
    description: "Fotos, event_name, fans_present, ementa, Identidade Artística",
    sql: `
      ALTER TABLE gigs ADD COLUMN event_name TEXT;
      ALTER TABLE gigs ADD COLUMN fans_present TEXT;
      ALTER TABLE venues ADD COLUMN photo_path TEXT;
      ALTER TABLE contacts ADD COLUMN photo_path TEXT;
      ALTER TABLE fans ADD COLUMN photo_path TEXT;
      ALTER TABLE class_packages ADD COLUMN syllabus TEXT;

      CREATE TABLE IF NOT EXISTS artist_identity (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        artist_name TEXT,
        bio_short TEXT,
        bio_long TEXT,
        socials TEXT,
        logo_path TEXT,
        isotype_path TEXT,
        presskit_path TEXT,
        primary_color TEXT,
        secondary_color TEXT,
        notes TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS artist_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        file_path TEXT,
        thumbnail_path TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    version: 8,
    description: "Palette de cores em artist_identity (substitui primary/secondary)",
    sql: `
      ALTER TABLE artist_identity ADD COLUMN palette TEXT;
    `,
  },
  {
    version: 9,
    description:
      "View v_insights — pool unificada de insights (gigs + ideias; tracks/festas entram nos batches I/L)",
    sql: `
      DROP VIEW IF EXISTS v_insights;
      CREATE VIEW v_insights AS
        SELECT
          'gig' AS source_type,
          g.id AS source_id,
          COALESCE(NULLIF(g.event_name, ''), g.venue_name) AS source_title,
          g.debrief_learnings AS content,
          g.date AS occurred_at
        FROM gigs g
        WHERE g.debrief_learnings IS NOT NULL AND g.debrief_learnings != ''
        UNION ALL
        SELECT
          'idea' AS source_type,
          i.id AS source_id,
          i.title AS source_title,
          i.body AS content,
          i.created_at AS occurred_at
        FROM ideas i
        WHERE i.body IS NOT NULL AND i.body != '';
    `,
  },
  {
    version: 10,
    description:
      "Produção Musical: music_projects, tracks, collaborators, flow sessions, costs, performance; finance_transactions.track_id; v_insights inclui tracks",
    sql: `
      CREATE TABLE IF NOT EXISTS music_projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL DEFAULT 'single',
          -- single | ep | album | remix | beat | edit | bootleg
        title TEXT NOT NULL,
        release_strategy TEXT,            -- waterfall | drop_unico | album_direto
        presave_link TEXT,
        press_release_draft TEXT,
        marketing_dates TEXT,             -- JSON { anuncio, teaser, presave_open, release, follow_up }
        partnerships_confirmed TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'single',
          -- single | album_track | remix | beat | edit | bootleg
        title_working TEXT NOT NULL,
        title_final TEXT,
        bpm INTEGER,
        key TEXT,
        duration_seconds INTEGER,
        mood_tags TEXT,                   -- JSON array
        genre_primary TEXT,
        genre_secondary TEXT,
        reference_files TEXT,             -- JSON array de anexos (evita palavra reservada)
        constraints TEXT,                 -- texto livre (restrições criativas)
        concept_narrative TEXT,
        current_stage TEXT NOT NULL DEFAULT 'Ideação',
        stage_history TEXT,               -- JSON array de StageHistoryEntry
        daw_project_path TEXT,
        stems_path TEXT,
        final_files_path TEXT,
        stage_notes TEXT,
        creative_block_notes TEXT,        -- bloqueios criativos resolvidos (vira Insight)
        standby INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES music_projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tracks_project ON tracks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tracks_stage ON tracks(current_stage);

      CREATE TABLE IF NOT EXISTS track_collaborators (
        track_id INTEGER NOT NULL,
        contact_id INTEGER NOT NULL,
        role TEXT,
        PRIMARY KEY (track_id, contact_id),
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS track_flow_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        flow_level INTEGER,               -- 1..5
        block_notes TEXT,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_flow_track ON track_flow_sessions(track_id);

      CREATE TABLE IF NOT EXISTS music_project_costs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        track_id INTEGER,
        category TEXT,
        description TEXT,
        amount REAL NOT NULL DEFAULT 0,
        date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES music_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS track_performance_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL,
        period_yyyymm TEXT NOT NULL,
        data TEXT,                        -- JSON streams/saves/etc
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(track_id, period_yyyymm),
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );

      ALTER TABLE finance_transactions ADD COLUMN track_id INTEGER;

      DROP VIEW IF EXISTS v_insights;
      CREATE VIEW v_insights AS
        SELECT
          'gig' AS source_type,
          g.id AS source_id,
          COALESCE(NULLIF(g.event_name, ''), g.venue_name) AS source_title,
          g.debrief_learnings AS content,
          g.date AS occurred_at
        FROM gigs g
        WHERE g.debrief_learnings IS NOT NULL AND g.debrief_learnings != ''
        UNION ALL
        SELECT
          'track' AS source_type,
          t.id AS source_id,
          COALESCE(NULLIF(t.title_final, ''), t.title_working) AS source_title,
          t.creative_block_notes AS content,
          t.updated_at AS occurred_at
        FROM tracks t
        WHERE t.creative_block_notes IS NOT NULL AND t.creative_block_notes != ''
        UNION ALL
        SELECT
          'idea' AS source_type,
          i.id AS source_id,
          i.title AS source_title,
          i.body AS content,
          i.created_at AS occurred_at
        FROM ideas i
        WHERE i.body IS NOT NULL AND i.body != '';
    `,
  },
  {
    version: 11,
    description:
      "track_media_targets (N:N tracks×contacts para lista de mídia)",
    sql: `
      CREATE TABLE IF NOT EXISTS track_media_targets (
        track_id INTEGER NOT NULL,
        contact_id INTEGER NOT NULL,
        role TEXT,
        PRIMARY KEY (track_id, contact_id),
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );
    `,
  },
  {
    version: 12,
    description:
      "Festas: tabelas parties e party_costs; v_insights inclui parties.notes",
    sql: `
      CREATE TABLE IF NOT EXISTS parties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT,
        venue_id INTEGER,
        venue_name TEXT,
        status TEXT NOT NULL DEFAULT 'Planejando',
        description TEXT,
        expected_capacity INTEGER,
        actual_attendance INTEGER,
        ticket_price_regular REAL,
        ticket_price_vip REAL,
        lineup TEXT,             -- JSON array de contact_ids
        sponsors TEXT,           -- JSON array de { name, amount_cents }
        tasks_generated INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_parties_date ON parties(date);
      CREATE INDEX IF NOT EXISTS idx_parties_status ON parties(status);

      CREATE TABLE IF NOT EXISTS party_costs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL,
        category TEXT,
        description TEXT,
        amount REAL NOT NULL DEFAULT 0,
        date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
      );

      DROP VIEW IF EXISTS v_insights;
      CREATE VIEW v_insights AS
        SELECT
          'gig' AS source_type,
          g.id AS source_id,
          COALESCE(NULLIF(g.event_name, ''), g.venue_name) AS source_title,
          g.debrief_learnings AS content,
          g.date AS occurred_at
        FROM gigs g
        WHERE g.debrief_learnings IS NOT NULL AND g.debrief_learnings != ''
        UNION ALL
        SELECT
          'track' AS source_type,
          t.id AS source_id,
          COALESCE(NULLIF(t.title_final, ''), t.title_working) AS source_title,
          t.creative_block_notes AS content,
          t.updated_at AS occurred_at
        FROM tracks t
        WHERE t.creative_block_notes IS NOT NULL AND t.creative_block_notes != ''
        UNION ALL
        SELECT
          'party' AS source_type,
          p.id AS source_id,
          p.title AS source_title,
          p.notes AS content,
          p.updated_at AS occurred_at
        FROM parties p
        WHERE p.notes IS NOT NULL AND p.notes != ''
        UNION ALL
        SELECT
          'idea' AS source_type,
          i.id AS source_id,
          i.title AS source_title,
          i.body AS content,
          i.created_at AS occurred_at
        FROM ideas i
        WHERE i.body IS NOT NULL AND i.body != '';
    `,
  },
  {
    version: 13,
    description: "gig_tracks — set list N:N entre gigs e tracks",
    sql: `
      CREATE TABLE IF NOT EXISTS gig_tracks (
        gig_id INTEGER NOT NULL,
        track_id INTEGER NOT NULL,
        PRIMARY KEY (gig_id, track_id),
        FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );
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
