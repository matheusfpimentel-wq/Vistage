import type { BatchStatement, Db } from "./db";

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
  {
    version: 14,
    description: "tasks.recurrence — suporte a tarefas recorrentes (weekly | monthly)",
    sql: `
      ALTER TABLE tasks ADD COLUMN recurrence TEXT DEFAULT NULL;
    `,
  },
  {
    version: 15,
    description: "work_sessions — rastreamento de energia e foco por sessão de trabalho",
    sql: `
      CREATE TABLE IF NOT EXISTS work_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        activity_type TEXT NOT NULL,
        energy_level INTEGER,
        focus_level INTEGER,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    version: 16,
    description: "highlights — momentos marcantes cumulativos",
    sql: `
      CREATE TABLE IF NOT EXISTS highlights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        body TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    version: 17,
    description: "okrs — OKRs trimestrais com key results auto-pulled",
    sql: `
      CREATE TABLE IF NOT EXISTS okrs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quarter TEXT NOT NULL,
        objective TEXT NOT NULL,
        key_results TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    version: 18,
    description: "decisions — decision log estruturado",
    sql: `
      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context TEXT NOT NULL,
        options_considered TEXT,
        decision_made TEXT NOT NULL,
        reasoning TEXT,
        domain TEXT NOT NULL DEFAULT 'business',
        outcome TEXT,
        outcome_evaluation TEXT,
        learned TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    version: 19,
    description: "venues — coordenadas para mapa (geocoding)",
    sql: `
      ALTER TABLE venues ADD COLUMN lat REAL;
      ALTER TABLE venues ADD COLUMN lng REAL;
      ALTER TABLE venues ADD COLUMN geocoded_at TEXT;
    `,
  },
  {
    version: 20,
    description: "gig_setlists — histórico de setlists importados de DJ software",
    sql: `
      CREATE TABLE IF NOT EXISTS gig_setlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gig_id INTEGER NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
        source_format TEXT NOT NULL,
        source_filename TEXT,
        tracks TEXT NOT NULL DEFAULT '[]',
        imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    version: 21,
    description: "Produção de Festas — stages, budget projection/actual, tickets, party tasks",
    sql: `
      ALTER TABLE parties ADD COLUMN stage_current INTEGER;
      ALTER TABLE parties ADD COLUMN financial_synced INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS party_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pendente',
        notes TEXT,
        fields TEXT NOT NULL DEFAULT '{}',
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS party_budget_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        subcategory TEXT,
        description TEXT,
        projected_amount REAL NOT NULL DEFAULT 0,
        actual_amount REAL,
        supplier_note TEXT,
        status TEXT NOT NULL DEFAULT 'projetado',
        date_paid TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS party_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        ticket_type TEXT NOT NULL DEFAULT 'antecipado',
        price REAL NOT NULL DEFAULT 0,
        quantity_total INTEGER,
        quantity_sold INTEGER DEFAULT 0,
        sale_start_date TEXT,
        sale_end_date TEXT,
        position INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS party_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        stage_id INTEGER REFERENCES party_stages(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pendente',
        priority TEXT NOT NULL DEFAULT 'Media',
        due_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    version: 22,
    description: "Fornecedores — suppliers e supplier_services",
    sql: `
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        contact_name TEXT,
        phone TEXT,
        email TEXT,
        instagram TEXT,
        city TEXT,
        notes TEXT,
        rating INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS supplier_services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        unit TEXT,
        price REAL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 23,
    description:
      "ideas — funde maturação 'Convertida' em 'Pronta' (Pronta agora também converte)",
    sql: `
      UPDATE ideas SET maturation = 'Pronta' WHERE maturation = 'Convertida';
    `,
  },
  {
    version: 24,
    description: "gigs — flyers adicionais (o primeiro continua sendo o da identidade)",
    sql: `
      ALTER TABLE gigs ADD COLUMN extra_flyer_paths TEXT;
    `,
  },
  {
    version: 25,
    description: "artist_identity — fontes (tipografia)",
    sql: `
      ALTER TABLE artist_identity ADD COLUMN fonts TEXT;
    `,
  },
  {
    version: 26,
    description: "music_projects — campo conceito do projeto",
    sql: `
      ALTER TABLE music_projects ADD COLUMN concept TEXT;
    `,
  },
  {
    version: 27,
    description: "content_snapshots — retratos de métricas com data de captura",
    sql: `
      CREATE TABLE IF NOT EXISTS content_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
        captured_at TEXT NOT NULL,
        metric_views INTEGER,
        metric_likes INTEGER,
        metric_comments INTEGER,
        metric_shares INTEGER,
        metric_saves INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 28,
    description: "venues — conceito, gênero, rider, público habitual",
    sql: `
      ALTER TABLE venues ADD COLUMN concept TEXT;
      ALTER TABLE venues ADD COLUMN dominant_genre TEXT;
      ALTER TABLE venues ADD COLUMN rider_available INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE venues ADD COLUMN regular_audience TEXT;
    `,
  },
  {
    version: 29,
    description: "fan_groups — grupos de fãs com membros",
    sql: `
      CREATE TABLE IF NOT EXISTS fan_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        whatsapp_group TEXT,
        origin TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS fan_group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES fan_groups(id) ON DELETE CASCADE,
        fan_id INTEGER REFERENCES fans(id) ON DELETE SET NULL,
        name TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 30,
    description: "task_id em party_tasks, gigs, ideas, tracks, classes",
    sql: `
      ALTER TABLE party_tasks ADD COLUMN global_task_id INTEGER;
      ALTER TABLE gigs ADD COLUMN prep_task_id INTEGER;
      ALTER TABLE ideas ADD COLUMN task_id INTEGER;
      ALTER TABLE tracks ADD COLUMN task_id INTEGER;
      ALTER TABLE classes ADD COLUMN task_id INTEGER;
    `,
  },
  {
    version: 31,
    description: "okr_kr_tasks — tasks vinculadas a KRs",
    sql: `
      CREATE TABLE IF NOT EXISTS okr_kr_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        okr_id INTEGER NOT NULL,
        kr_index INTEGER NOT NULL,
        task_id INTEGER NOT NULL,
        UNIQUE(okr_id, kr_index)
      );
    `,
  },
  {
    version: 32,
    description: "venues — rider técnico como texto (equipamento)",
    sql: `
      ALTER TABLE venues ADD COLUMN rider_equipment TEXT;
    `,
  },
  {
    version: 33,
    description: "venues — backfill rider_equipment a partir do antigo rider_available",
    sql: `
      UPDATE venues
        SET rider_equipment = 'Rider disponível (revisar equipamento)'
        WHERE rider_available = 1
          AND (rider_equipment IS NULL OR rider_equipment = '');
    `,
  },
  {
    version: 34,
    description: "parties — add team column for equipe de producao",
    sql: `
      ALTER TABLE parties ADD COLUMN team TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 35,
    description: "party_venue_candidates — venues candidatos por festa (vinculados ao módulo Venues)",
    sql: `
      CREATE TABLE IF NOT EXISTS party_venue_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL,
        venue_id INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(party_id, venue_id),
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
        FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_pvc_party ON party_venue_candidates(party_id);
      CREATE INDEX IF NOT EXISTS idx_pvc_venue ON party_venue_candidates(venue_id);
    `,
  },
  {
    version: 36,
    description: "content_scenes — roteiro dividido por cenas (equipamentos, materiais, cenário)",
    sql: `
      CREATE TABLE IF NOT EXISTS content_scenes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_id INTEGER NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        title TEXT,
        description TEXT,
        equipment TEXT NOT NULL DEFAULT '[]',
        materials TEXT NOT NULL DEFAULT '[]',
        scenery TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_content_scenes_content ON content_scenes(content_id);
    `,
  },
  {
    version: 37,
    description: "gcal_event_id for classes",
    sql: `ALTER TABLE classes ADD COLUMN gcal_event_id TEXT`,
  },
  {
    version: 38,
    description: "gcal_event_id for parties",
    sql: `ALTER TABLE parties ADD COLUMN gcal_event_id TEXT`,
  },
  {
    version: 39,
    description: "gcal_event_id for okrs",
    sql: `ALTER TABLE okrs ADD COLUMN gcal_event_id TEXT`,
  },
  {
    version: 40,
    description: "owner_role for venues",
    sql: `ALTER TABLE venues ADD COLUMN owner_role TEXT`,
  },
  {
    version: 41,
    description: "venue_type for venues",
    sql: `ALTER TABLE venues ADD COLUMN venue_type TEXT`,
  },
  {
    version: 42,
    description: "follower_count and venue_id for contacts",
    sql: `ALTER TABLE contacts ADD COLUMN follower_count INTEGER`,
  },
  {
    version: 43,
    description: "venue_id link for contacts",
    sql: `ALTER TABLE contacts ADD COLUMN venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL`,
  },
  {
    version: 44,
    description: "rating_contractor and is_special for gigs",
    sql: `ALTER TABLE gigs ADD COLUMN rating_contractor INTEGER`,
  },
  {
    version: 45,
    description: "is_special flag for gigs",
    sql: `ALTER TABLE gigs ADD COLUMN is_special INTEGER NOT NULL DEFAULT 0`,
  },
  {
    version: 46,
    description: "quantity for equipment",
    sql: `ALTER TABLE equipment ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1`,
  },
  {
    version: 47,
    description: "category for equipment",
    sql: `ALTER TABLE equipment ADD COLUMN category TEXT`,
  },
  {
    version: 48,
    description: "photo_path for equipment",
    sql: `ALTER TABLE equipment ADD COLUMN photo_path TEXT`,
  },
  {
    version: 49,
    description: "star_status for venues (target/played/favorite)",
    sql: `ALTER TABLE venues ADD COLUMN star_status TEXT`,
  },
  {
    version: 50,
    description: "priority for venues (Alta/Media/Baixa)",
    sql: `ALTER TABLE venues ADD COLUMN priority TEXT`,
  },
  {
    version: 51,
    description: "gig_equipment JSON array of equipment IDs",
    sql: `ALTER TABLE gigs ADD COLUMN gig_equipment TEXT NOT NULL DEFAULT '[]'`,
  },
  {
    version: 52,
    description: "is_closed flag for venues",
    sql: `ALTER TABLE venues ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0`,
  },
  {
    version: 53,
    description: "event_category for gigs",
    sql: `ALTER TABLE gigs ADD COLUMN event_category TEXT`,
  },
  {
    version: 54,
    description: "company field for contacts",
    sql: `ALTER TABLE contacts ADD COLUMN company TEXT`,
  },
  {
    version: 55,
    description: "gig_research JSON for musical research per gig",
    sql: `ALTER TABLE gigs ADD COLUMN gig_research TEXT`,
  },
  {
    version: 56,
    description: "Link finance transactions to classes and student packages (+ backfill)",
    sql: `
      ALTER TABLE finance_transactions ADD COLUMN class_id INTEGER;
      ALTER TABLE finance_transactions ADD COLUMN student_package_id INTEGER;
      CREATE INDEX IF NOT EXISTS idx_tx_class ON finance_transactions(class_id);
      CREATE INDEX IF NOT EXISTS idx_tx_student_package ON finance_transactions(student_package_id);

      INSERT INTO finance_transactions (kind, amount, date, description, category_id, class_id, status)
      SELECT 'income', c.amount, c.date,
             'Aula avulsa — ' || COALESCE(s.name, 'Aluno'),
             (SELECT id FROM finance_categories WHERE kind='income' AND name='Aulas / Mentorias' LIMIT 1),
             c.id, 'Recebido/Pago'
        FROM classes c LEFT JOIN students s ON s.id = c.student_id
       WHERE c.status = 'Realizada' AND c.amount IS NOT NULL AND c.amount > 0
         AND c.student_package_id IS NULL;

      INSERT INTO finance_transactions (kind, amount, date, description, category_id, student_package_id, status)
      SELECT 'income', cp.price, sp.purchased_at,
             'Pacote ' || COALESCE(cp.name, '') || ' — ' || COALESCE(s.name, 'Aluno'),
             (SELECT id FROM finance_categories WHERE kind='income' AND name='Aulas / Mentorias' LIMIT 1),
             sp.id, 'Recebido/Pago'
        FROM student_packages sp
        LEFT JOIN class_packages cp ON cp.id = sp.package_id
        LEFT JOIN students s ON s.id = sp.student_id
       WHERE cp.price IS NOT NULL AND cp.price > 0 AND sp.status <> 'Cancelado';
    `,
  },
  {
    version: 57,
    description: "default_rate on students for class pre-fill",
    sql: `ALTER TABLE students ADD COLUMN default_rate REAL`,
  },
  {
    version: 59,
    description: "Backfill: receita de toda aula realizada com valor (inclui aulas de pacote com valor próprio)",
    sql: `
      INSERT INTO finance_transactions (kind, amount, date, description, category_id, class_id, status)
      SELECT 'income', c.amount, c.date,
             'Aula — ' || COALESCE(s.name, 'Aluno'),
             (SELECT id FROM finance_categories WHERE kind='income' AND name='Aulas / Mentorias' LIMIT 1),
             c.id, 'Recebido/Pago'
        FROM classes c LEFT JOIN students s ON s.id = c.student_id
       WHERE c.status = 'Realizada' AND c.amount IS NOT NULL AND c.amount > 0
         AND NOT EXISTS (
           SELECT 1 FROM finance_transactions t WHERE t.class_id = c.id
         );
    `,
  },
  {
    version: 60,
    description: "party_id column on finance_transactions for party profit tracking",
    sql: `ALTER TABLE finance_transactions ADD COLUMN party_id INTEGER`,
  },
  {
    version: 61,
    description: "Fix existing GIG transaction descriptions to use event_name; fix party sync descriptions",
    sql: `
      UPDATE finance_transactions
         SET description = 'Cachê: ' || COALESCE(NULLIF(g.event_name,''), g.venue_name)
               || ' (' || g.date || ')'
        FROM gigs g
       WHERE finance_transactions.gig_id = g.id
         AND finance_transactions.kind = 'income'
         AND (finance_transactions.description LIKE '%—%'
              OR finance_transactions.description LIKE 'GIG %');
    `,
  },
  {
    version: 62,
    description: "class_packages: total_hours; student_packages: used_minutes",
    sql: `
      ALTER TABLE class_packages ADD COLUMN total_hours REAL;
      ALTER TABLE student_packages ADD COLUMN used_minutes INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 63,
    description: "tracks: standby_until — data de retorno do standby",
    sql: `ALTER TABLE tracks ADD COLUMN standby_until TEXT;`,
  },
  {
    version: 64,
    description: "work_sessions: context — contexto opcional da sessão",
    sql: `ALTER TABLE work_sessions ADD COLUMN context TEXT;`,
  },
  {
    version: 65,
    description: "content: engagement_notes — resultado pós-publicação",
    sql: `ALTER TABLE content ADD COLUMN engagement_notes TEXT;`,
  },
  {
    version: 66,
    description: "class_packages.syllabus_items — ementa estruturada (JSON)",
    sql: `ALTER TABLE class_packages ADD COLUMN syllabus_items TEXT NOT NULL DEFAULT '[]';`,
  },
  {
    version: 67,
    description: "students.contact_id — vínculo aluno↔contato (CRM)",
    sql: `ALTER TABLE students ADD COLUMN contact_id INTEGER;`,
  },
  {
    version: 68,
    description: "content.track_id — conteúdo divulga uma track",
    sql: `ALTER TABLE content ADD COLUMN track_id INTEGER;`,
  },
  {
    version: 69,
    description: "parties.gig_id — festa vinculada a uma GIG (toquei na própria festa)",
    sql: `ALTER TABLE parties ADD COLUMN gig_id INTEGER;`,
  },
  {
    version: 70,
    description: "gig_fans — presença de fãs em GIGs (histórico)",
    sql: `
      CREATE TABLE IF NOT EXISTS gig_fans (
        gig_id INTEGER NOT NULL,
        fan_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (gig_id, fan_id),
        FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
        FOREIGN KEY (fan_id) REFERENCES fans(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_gig_fans_fan ON gig_fans(fan_id);
      CREATE INDEX IF NOT EXISTS idx_gig_fans_gig ON gig_fans(gig_id);
    `,
  },
  {
    version: 71,
    description: "content: promotes_type/promotes_id — conteúdo promove GIG/Festa",
    sql: `
      ALTER TABLE content ADD COLUMN promotes_type TEXT;
      ALTER TABLE content ADD COLUMN promotes_id INTEGER;
    `,
  },
  {
    version: 72,
    description: "party_budget_items.supplier_id — item de orçamento vinculado a fornecedor",
    sql: `ALTER TABLE party_budget_items ADD COLUMN supplier_id INTEGER;`,
  },
  {
    version: 73,
    description: "tracks.related_track_id — relação entre tracks (remix/sample/álbum)",
    sql: `ALTER TABLE tracks ADD COLUMN related_track_id INTEGER;`,
  },
  {
    version: 74,
    description: "ideas.related_idea_id — relação entre ideias (inspirada por/depende de)",
    sql: `ALTER TABLE ideas ADD COLUMN related_idea_id INTEGER;`,
  },
  {
    version: 75,
    description: "student_packages: total_hours — carga horária do pacote comprado",
    sql: `ALTER TABLE student_packages ADD COLUMN total_hours REAL;`,
  },
  {
    version: 76,
    description: "gigs — debrief_task_id",
    sql: `ALTER TABLE gigs ADD COLUMN debrief_task_id INTEGER;`,
  },
  {
    version: 78,
    description: "fan_interactions — campo special; fan_upgrade_rules em app_settings",
    sql: `ALTER TABLE fan_interactions ADD COLUMN special INTEGER NOT NULL DEFAULT 0;`
  },
  {
    version: 79,
    description: "finance_transactions — music_cost_id para sync de custos de produção musical",
    sql: `ALTER TABLE finance_transactions ADD COLUMN music_cost_id INTEGER REFERENCES music_project_costs(id) ON DELETE SET NULL;`,
  },
  {
    version: 80,
    description: "work_sessions — vínculo a entidade (context_type/context_id)",
    sql: `
      ALTER TABLE work_sessions ADD COLUMN context_type TEXT;
      ALTER TABLE work_sessions ADD COLUMN context_id INTEGER;
    `,
  },
  {
    version: 81,
    description: "fans — contact_id para vincular fã a contato do CRM",
    sql: `ALTER TABLE fans ADD COLUMN contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;`,
  },
  {
    version: 82,
    description: "tasks — quadrante de Eisenhower (matriz urgência/importância)",
    sql: `ALTER TABLE tasks ADD COLUMN eisenhower_quadrant TEXT;`,
  },
  {
    version: 83,
    description: "artist_templates: add content column for text templates",
    sql: `ALTER TABLE artist_templates ADD COLUMN content TEXT`,
  },
  {
    version: 84,
    description: "fan_interactions: add type column (Interação/Presença/Feedback)",
    sql: `ALTER TABLE fan_interactions ADD COLUMN type TEXT NOT NULL DEFAULT 'Interação'`,
  },
  {
    version: 85,
    description: "artist_identity: presskit_link (URL), photos e folder_links (JSON)",
    sql: `
      ALTER TABLE artist_identity ADD COLUMN presskit_link TEXT;
      ALTER TABLE artist_identity ADD COLUMN photos TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE artist_identity ADD COLUMN folder_links TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 86,
    description: "suppliers.contact_id — vínculo fornecedor↔contato (CRM)",
    sql: `ALTER TABLE suppliers ADD COLUMN contact_id INTEGER;`,
  },
  {
    version: 87,
    description: "Migra gigs com status 'A Caminho' para 'Confirmada'",
    sql: `UPDATE gigs SET status = 'Confirmada' WHERE status = 'A Caminho';`,
  },
  {
    version: 88,
    description: "finance_transactions.gig_sync — flag para transações auto-sincronizadas de GIG",
    sql: `ALTER TABLE finance_transactions ADD COLUMN gig_sync INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 89,
    description: "Indexes de performance em finance_transactions (gig_id, recurring_id, category_id)",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_finance_transactions_gig_id ON finance_transactions(gig_id);
      CREATE INDEX IF NOT EXISTS idx_finance_transactions_recurring_id ON finance_transactions(recurring_id);
      CREATE INDEX IF NOT EXISTS idx_finance_transactions_category_id ON finance_transactions(category_id);
    `,
  },
  {
    version: 90,
    description: "Reparo de schema: recria colunas históricas que faltarem (bancos afetados por migrations parcialmente aplicadas)",
    sql: `
      ALTER TABLE gigs ADD COLUMN main_goal TEXT;
      ALTER TABLE gigs ADD COLUMN prep_state TEXT;
      ALTER TABLE gigs ADD COLUMN main_goal_task_id INTEGER;
      ALTER TABLE gigs ADD COLUMN venue_id INTEGER;
      ALTER TABLE gigs ADD COLUMN event_name TEXT;
      ALTER TABLE gigs ADD COLUMN fans_present TEXT;
      ALTER TABLE venues ADD COLUMN photo_path TEXT;
      ALTER TABLE contacts ADD COLUMN photo_path TEXT;
      ALTER TABLE fans ADD COLUMN photo_path TEXT;
      ALTER TABLE class_packages ADD COLUMN syllabus TEXT;
      ALTER TABLE artist_identity ADD COLUMN palette TEXT;
      ALTER TABLE finance_transactions ADD COLUMN track_id INTEGER;
      ALTER TABLE tasks ADD COLUMN recurrence TEXT DEFAULT NULL;
      ALTER TABLE venues ADD COLUMN lat REAL;
      ALTER TABLE venues ADD COLUMN lng REAL;
      ALTER TABLE venues ADD COLUMN geocoded_at TEXT;
      ALTER TABLE parties ADD COLUMN stage_current INTEGER;
      ALTER TABLE parties ADD COLUMN financial_synced INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE gigs ADD COLUMN extra_flyer_paths TEXT;
      ALTER TABLE artist_identity ADD COLUMN fonts TEXT;
      ALTER TABLE music_projects ADD COLUMN concept TEXT;
      ALTER TABLE venues ADD COLUMN concept TEXT;
      ALTER TABLE venues ADD COLUMN dominant_genre TEXT;
      ALTER TABLE venues ADD COLUMN rider_available INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE venues ADD COLUMN regular_audience TEXT;
      ALTER TABLE party_tasks ADD COLUMN global_task_id INTEGER;
      ALTER TABLE gigs ADD COLUMN prep_task_id INTEGER;
      ALTER TABLE ideas ADD COLUMN task_id INTEGER;
      ALTER TABLE tracks ADD COLUMN task_id INTEGER;
      ALTER TABLE classes ADD COLUMN task_id INTEGER;
      ALTER TABLE venues ADD COLUMN rider_equipment TEXT;
      ALTER TABLE parties ADD COLUMN team TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE classes ADD COLUMN gcal_event_id TEXT;
      ALTER TABLE parties ADD COLUMN gcal_event_id TEXT;
      ALTER TABLE okrs ADD COLUMN gcal_event_id TEXT;
      ALTER TABLE venues ADD COLUMN owner_role TEXT;
      ALTER TABLE venues ADD COLUMN venue_type TEXT;
      ALTER TABLE contacts ADD COLUMN follower_count INTEGER;
      ALTER TABLE contacts ADD COLUMN venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL;
      ALTER TABLE gigs ADD COLUMN rating_contractor INTEGER;
      ALTER TABLE gigs ADD COLUMN is_special INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE equipment ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE equipment ADD COLUMN category TEXT;
      ALTER TABLE equipment ADD COLUMN photo_path TEXT;
      ALTER TABLE venues ADD COLUMN star_status TEXT;
      ALTER TABLE venues ADD COLUMN priority TEXT;
      ALTER TABLE gigs ADD COLUMN gig_equipment TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE venues ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE gigs ADD COLUMN event_category TEXT;
      ALTER TABLE contacts ADD COLUMN company TEXT;
      ALTER TABLE gigs ADD COLUMN gig_research TEXT;
      ALTER TABLE finance_transactions ADD COLUMN class_id INTEGER;
      ALTER TABLE finance_transactions ADD COLUMN student_package_id INTEGER;
      ALTER TABLE students ADD COLUMN default_rate REAL;
      ALTER TABLE finance_transactions ADD COLUMN party_id INTEGER;
      ALTER TABLE class_packages ADD COLUMN total_hours REAL;
      ALTER TABLE student_packages ADD COLUMN used_minutes INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE tracks ADD COLUMN standby_until TEXT;
      ALTER TABLE work_sessions ADD COLUMN context TEXT;
      ALTER TABLE content ADD COLUMN engagement_notes TEXT;
      ALTER TABLE class_packages ADD COLUMN syllabus_items TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE students ADD COLUMN contact_id INTEGER;
      ALTER TABLE content ADD COLUMN track_id INTEGER;
      ALTER TABLE parties ADD COLUMN gig_id INTEGER;
      ALTER TABLE content ADD COLUMN promotes_type TEXT;
      ALTER TABLE content ADD COLUMN promotes_id INTEGER;
      ALTER TABLE party_budget_items ADD COLUMN supplier_id INTEGER;
      ALTER TABLE tracks ADD COLUMN related_track_id INTEGER;
      ALTER TABLE ideas ADD COLUMN related_idea_id INTEGER;
      ALTER TABLE student_packages ADD COLUMN total_hours REAL;
      ALTER TABLE gigs ADD COLUMN debrief_task_id INTEGER;
      ALTER TABLE fan_interactions ADD COLUMN special INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE finance_transactions ADD COLUMN music_cost_id INTEGER REFERENCES music_project_costs(id) ON DELETE SET NULL;
      ALTER TABLE work_sessions ADD COLUMN context_type TEXT;
      ALTER TABLE work_sessions ADD COLUMN context_id INTEGER;
      ALTER TABLE fans ADD COLUMN contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
      ALTER TABLE tasks ADD COLUMN eisenhower_quadrant TEXT;
      ALTER TABLE artist_templates ADD COLUMN content TEXT;
      ALTER TABLE fan_interactions ADD COLUMN type TEXT NOT NULL DEFAULT 'Interação';
      ALTER TABLE artist_identity ADD COLUMN presskit_link TEXT;
      ALTER TABLE artist_identity ADD COLUMN photos TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE artist_identity ADD COLUMN folder_links TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE suppliers ADD COLUMN contact_id INTEGER;
      ALTER TABLE finance_transactions ADD COLUMN gig_sync INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 91,
    description: "Adiciona recurring_event_name à tabela gigs",
    sql: `
      ALTER TABLE gigs ADD COLUMN recurring_event_name TEXT;
    `,
  },
  {
    version: 92,
    description: "Adiciona cache_paid_pct à tabela gigs — percentual do cachê já recebido (0-100, null = não definido)",
    sql: `
      ALTER TABLE gigs ADD COLUMN cache_paid_pct INTEGER;
    `,
  },
  {
    version: 93,
    description: "Adiciona energy_required à tabela tasks — nível de energia necessário para a tarefa (1-5)",
    sql: `
      ALTER TABLE tasks ADD COLUMN energy_required INTEGER;
    `,
  },
  {
    version: 94,
    description: "Cria tabela recurring_fests para banco de festas recorrentes",
    sql: `
      CREATE TABLE IF NOT EXISTS recurring_fests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 95,
    description: "Converte payment_status '50% pago' para 'Pago parcialmente'",
    sql: `
      UPDATE gigs SET payment_status = 'Pago parcialmente' WHERE payment_status = '50% pago';
    `,
  },
  {
    version: 96,
    description: "gigs.fans_notified — fãs comunicados em marketing",
    sql: `ALTER TABLE gigs ADD COLUMN fans_notified INTEGER;`,
  },
  {
    version: 97,
    description: "music_projects.fans_notified — fãs comunicados no lançamento",
    sql: `ALTER TABLE music_projects ADD COLUMN fans_notified INTEGER;`,
  },
  {
    version: 98,
    description: "gigs.payment_task_id — tarefa de cobrança vinculada ao recebimento",
    sql: `ALTER TABLE gigs ADD COLUMN payment_task_id INTEGER;`,
  },
  {
    version: 99,
    description: "content.publish_task_id — tarefa de publicação vinculada",
    sql: `ALTER TABLE content ADD COLUMN publish_task_id INTEGER;`,
  },
  {
    version: 100,
    description: "parties.event_task_id — tarefa do dia do evento vinculada",
    sql: `ALTER TABLE parties ADD COLUMN event_task_id INTEGER;`,
  },
  {
    version: 101,
    description: "finance — renomeia status Recebido/Pago para Recebido (income) ou Pago (expense)",
    sql: `
      UPDATE finance_transactions SET status = 'Recebido' WHERE status = 'Recebido/Pago' AND kind = 'income';
      UPDATE finance_transactions SET status = 'Pago' WHERE status = 'Recebido/Pago' AND kind = 'expense';
    `,
  },
  {
    version: 102,
    description: "finance_transactions.class_sync — trava campos em transações vinculadas a aulas",
    sql: `ALTER TABLE finance_transactions ADD COLUMN class_sync INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 103,
    description: "work_sessions.pause_ms — desconta tempo pausado da duração da sessão",
    sql: `ALTER TABLE work_sessions ADD COLUMN pause_ms INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 104,
    description: "meetings — reuniões que viram tarefas (lembrete + follow-ups)",
    sql: `
      CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT,                 -- ISO date (YYYY-MM-DD) da reunião
        time TEXT,                 -- HH:MM opcional
        location TEXT,             -- local físico ou link da reunião online
        participants TEXT,         -- JSON array de nomes
        agenda TEXT,               -- pauta
        notes TEXT,                -- ata / anotações
        outcomes TEXT,             -- decisões / encaminhamentos
        status TEXT NOT NULL DEFAULT 'Agendada',  -- Agendada | Realizada | Cancelada
        task_id INTEGER,           -- tarefa-lembrete criada ao agendar
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );
    `,
  },
  {
    version: 105,
    description: "content — datas de milestone (roteiro, gravação, edição) com tarefas vinculadas",
    sql: `
      ALTER TABLE content ADD COLUMN date_roteiro TEXT;
      ALTER TABLE content ADD COLUMN task_roteiro_id INTEGER;
      ALTER TABLE content ADD COLUMN date_gravacao TEXT;
      ALTER TABLE content ADD COLUMN task_gravacao_id INTEGER;
      ALTER TABLE content ADD COLUMN date_edicao TEXT;
      ALTER TABLE content ADD COLUMN task_edicao_id INTEGER;
    `,
  },
  {
    version: 106,
    description: "task_links — vínculos polimórficos entre tarefas e qualquer entidade",
    sql: `
      CREATE TABLE IF NOT EXISTS task_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        UNIQUE(task_id, entity_type, entity_id)
      );
      CREATE INDEX IF NOT EXISTS idx_task_links_task ON task_links(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_links_entity ON task_links(entity_type, entity_id);
    `,
  },
  {
    version: 107,
    description: "tasks.todoist_id — id da tarefa correspondente no Todoist para sincronização bidirecional",
    sql: `ALTER TABLE tasks ADD COLUMN todoist_id TEXT;`,
  },
  {
    version: 108,
    description: "Remove de vez o status legado 'A Caminho' de gigs (converte para 'Confirmada'). Re-emite a limpeza para bancos onde o dado ressurgiu via sync.",
    sql: `UPDATE gigs SET status = 'Confirmada' WHERE status = 'A Caminho';`,
  },
  {
    version: 109,
    description: "gigs.time_slots — múltiplos intervalos de horário (set alternado). JSON array [{start,end}]; start_time/end_time seguem espelhando o 1º intervalo.",
    sql: `ALTER TABLE gigs ADD COLUMN time_slots TEXT;`,
  },
  {
    version: 110,
    description: "artist_identity.brand_manual_path — arquivo do manual de marca (PDF).",
    sql: `ALTER TABLE artist_identity ADD COLUMN brand_manual_path TEXT;`,
  },
  {
    version: 111,
    description: "fans.is_ambassador — Embaixador é destaque manual, fora da pontuação automática.",
    sql: `ALTER TABLE fans ADD COLUMN is_ambassador INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 112,
    description: "classes.title — título da aula, usado como referência principal (na view) em vez da matéria.",
    sql: `ALTER TABLE classes ADD COLUMN title TEXT;`,
  },
  {
    version: 113,
    description: "finance_transactions.source_ref — referência externa idempotente (ex.: import de royalties DistroKid/Beatport por faixa/mês).",
    sql: `
      ALTER TABLE finance_transactions ADD COLUMN source_ref TEXT;
      CREATE INDEX IF NOT EXISTS idx_finance_tx_source_ref ON finance_transactions(source_ref);
    `,
  },
  {
    version: 114,
    description: "fan_perks — perks/VIP e distribuição de brindes por fã (clube de fãs).",
    sql: `
      CREATE TABLE IF NOT EXISTS fan_perks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fan_id INTEGER NOT NULL,
        category TEXT NOT NULL DEFAULT 'Brinde',   -- Brinde | VIP | Acesso | Cortesia | Desconto | Outro
        name TEXT NOT NULL,                        -- descrição do perk/brinde
        status TEXT NOT NULL DEFAULT 'Planejado',  -- Planejado | Entregue
        date TEXT,                                 -- data planejada / de entrega (ISO YYYY-MM-DD)
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fan_id) REFERENCES fans(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_fan_perks_fan ON fan_perks(fan_id);
      CREATE INDEX IF NOT EXISTS idx_fan_perks_status ON fan_perks(status);
    `,
  },
  {
    version: 115,
    description: "contacts.relationship_types / relationship_data — tipo de relação (multi) e dados por tipo na visão Pessoas.",
    sql: `
      ALTER TABLE contacts ADD COLUMN relationship_types TEXT;
      ALTER TABLE contacts ADD COLUMN relationship_data TEXT;
    `,
  },
  {
    version: 116,
    description: "meetings.contact_ids — vincula reuniões a pessoas (JSON array de contact ids).",
    sql: `ALTER TABLE meetings ADD COLUMN contact_ids TEXT;`,
  },
  {
    version: 117,
    description: "contacts.birthday — data de nascimento (YYYY-MM-DD), pra ação automática de aniversário.",
    sql: `ALTER TABLE contacts ADD COLUMN birthday TEXT;`,
  },
  {
    version: 118,
    description: "fan_lists / fan_list_members — montar listas (ex.: lista da casa) pra mandar antes da GIG.",
    sql: `
      CREATE TABLE IF NOT EXISTS fan_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        gig_id INTEGER REFERENCES gigs(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS fan_list_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER NOT NULL REFERENCES fan_lists(id) ON DELETE CASCADE,
        fan_id INTEGER REFERENCES fans(id) ON DELETE SET NULL,
        name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_fan_list_members_list ON fan_list_members(list_id);
    `,
  },
  {
    version: 119,
    description:
      "document_settings — preferências ligadas ao DOCUMENTO (.vistage), ex.: tema/acento. Portável (viaja com o arquivo), diferente de app_settings (por máquina).",
    sql: `
      CREATE TABLE IF NOT EXISTS document_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 120,
    description:
      "tasks.derived_type / derived_id — marca tarefas LEGADAS de outra origem (track/GIG/etc.) para travar título+tag e espelhar status de duas vias.",
    sql: `
      ALTER TABLE tasks ADD COLUMN derived_type TEXT;
      ALTER TABLE tasks ADD COLUMN derived_id INTEGER;
      CREATE INDEX IF NOT EXISTS idx_tasks_derived ON tasks(derived_type, derived_id);
    `,
  },
  {
    version: 121,
    description:
      "todoist_tombstones — IDs de tarefas excluídas no Vistage que precisam ser apagadas no Todoist na próxima sync (e nunca reimportadas como 'novas').",
    sql: `
      CREATE TABLE IF NOT EXISTS todoist_tombstones (
        todoist_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 122,
    description:
      "finance_categories.is_protected — categorias-núcleo (DJ, Royalties, Aulas / Mentorias, Publicidade) não podem ser excluídas; renomeia a categoria de receita 'Conteúdo' → 'Publicidade'.",
    sql: `
      ALTER TABLE finance_categories ADD COLUMN is_protected INTEGER DEFAULT 0;
      UPDATE OR IGNORE finance_categories SET name = 'Publicidade' WHERE kind = 'income' AND name = 'Conteúdo';
      UPDATE finance_categories SET is_protected = 1 WHERE kind = 'income' AND name IN ('DJ', 'Royalties', 'Aulas / Mentorias', 'Publicidade');
    `,
  },
  {
    version: 123,
    description:
      "work_sessions.planned_minutes — tempo previsto (opcional) de uma sessão de foco; alimenta o anel de progresso e o alerta de 'tempo previsto atingido' (nunca encerra sozinho).",
    sql: `
      ALTER TABLE work_sessions ADD COLUMN planned_minutes INTEGER;
    `,
  },
  {
    version: 124,
    description:
      "gigs — briefing_file_path (anexo de briefing) e promoter_name_manual (contratante eventual, sem contato cadastrado)",
    sql: `
      ALTER TABLE gigs ADD COLUMN briefing_file_path TEXT;
      ALTER TABLE gigs ADD COLUMN promoter_name_manual TEXT;
    `,
  },
  {
    version: 125,
    description:
      "custom_rules — regras de alertas/insights criadas pelo usuário (Configurações avançadas)",
    sql: `
      CREATE TABLE IF NOT EXISTS custom_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        field TEXT NOT NULL,
        operator TEXT NOT NULL,
        value TEXT,
        message TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'alerta',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 126,
    description:
      "Insights — anotações manuais (manual_insights) e exclusões do banco (dismissed_insights)",
    sql: `
      CREATE TABLE IF NOT EXISTS manual_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS dismissed_insights (
        source_type TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        PRIMARY KEY (source_type, source_id)
      );
    `,
  },
  {
    version: 127,
    description: "ideas — notion_page_id (sync 1 via com o Notion)",
    sql: `
      ALTER TABLE ideas ADD COLUMN notion_page_id TEXT;
    `,
  },
  {
    version: 128,
    description:
      "focus_blocks — Trilha da semana (blocos de foco/mortos por dia da semana)",
    sql: `
      CREATE TABLE IF NOT EXISTS focus_blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        weekday INTEGER NOT NULL,        -- 0=Dom … 6=Sáb
        start_min INTEGER NOT NULL,      -- minutos desde 00:00
        duration_min INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'foco', -- 'foco' | 'morto'
        label TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 129,
    description:
      "tracks.deadline — prazo de conclusão (gera tarefa só quando preenchido)",
    sql: `ALTER TABLE tracks ADD COLUMN deadline TEXT;`,
  },
  {
    version: 130,
    description:
      "focus_blocks — classificação, cor e plano por bloco (Trilha da semana)",
    sql: `
      ALTER TABLE focus_blocks ADD COLUMN category TEXT;
      ALTER TABLE focus_blocks ADD COLUMN color TEXT;
      ALTER TABLE focus_blocks ADD COLUMN plan TEXT;
    `,
  },
  {
    version: 131,
    description: "venues.djs_residentes — DJs residentes (um por linha)",
    sql: `ALTER TABLE venues ADD COLUMN djs_residentes TEXT;`,
  },
  {
    version: 132,
    description:
      "custom_rules — condições compostas (E/OU) + dispensável ao clicar",
    sql: `
      ALTER TABLE custom_rules ADD COLUMN conditions TEXT;
      ALTER TABLE custom_rules ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'all';
      ALTER TABLE custom_rules ADD COLUMN dismissible INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 133,
    description:
      "Índices de performance em FKs/colunas quentes (auditoria) — varreduras de tabela viravam full scan",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_gigs_promoter ON gigs(promoter_contact_id);
      CREATE INDEX IF NOT EXISTS idx_gigs_venue ON gigs(venue_id);
      CREATE INDEX IF NOT EXISTS idx_parties_venue ON parties(venue_id);
      CREATE INDEX IF NOT EXISTS idx_tx_party ON finance_transactions(party_id);
      CREATE INDEX IF NOT EXISTS idx_tx_track ON finance_transactions(track_id);
      CREATE INDEX IF NOT EXISTS idx_tx_music_cost ON finance_transactions(music_cost_id);
      CREATE INDEX IF NOT EXISTS idx_classes_student_package ON classes(student_package_id);
      CREATE INDEX IF NOT EXISTS idx_student_packages_student ON student_packages(student_id);
      CREATE INDEX IF NOT EXISTS idx_mpc_project ON music_project_costs(project_id);
      CREATE INDEX IF NOT EXISTS idx_mpc_track ON music_project_costs(track_id);
      CREATE INDEX IF NOT EXISTS idx_track_collab_track ON track_collaborators(track_id);
      CREATE INDEX IF NOT EXISTS idx_track_media_track ON track_media_targets(track_id);
      CREATE INDEX IF NOT EXISTS idx_track_perf_track ON track_performance_snapshots(track_id);
      CREATE INDEX IF NOT EXISTS idx_gig_tracks_gig ON gig_tracks(gig_id);
      CREATE INDEX IF NOT EXISTS idx_gig_tracks_track ON gig_tracks(track_id);
      CREATE INDEX IF NOT EXISTS idx_okr_kr_tasks_okr ON okr_kr_tasks(okr_id, kr_index);
      CREATE INDEX IF NOT EXISTS idx_suppliers_contact ON suppliers(contact_id);
      CREATE INDEX IF NOT EXISTS idx_pbi_supplier ON party_budget_items(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_content_snapshots_content ON content_snapshots(content_id);
    `,
  },
  {
    version: 134,
    description:
      "finance_transactions — multi-moeda (amount continua em BRL; original_amount/exchange_rate só para exibição)",
    sql: `
      ALTER TABLE finance_transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL';
      ALTER TABLE finance_transactions ADD COLUMN original_amount REAL;
      ALTER TABLE finance_transactions ADD COLUMN exchange_rate REAL;
    `,
  },
  {
    version: 135,
    description:
      "gigs.gcal_synced_at — quando o app gravou o evento por último (detecta edição feita no Google depois disso)",
    sql: `ALTER TABLE gigs ADD COLUMN gcal_synced_at TEXT;`,
  },
  {
    version: 136,
    description:
      "ideas.heat — escala 1..5 (fria→quente). Remapeia o esquema antigo 1/2/3: morna 2→3, quente 3→5",
    sql: `UPDATE ideas SET heat = CASE heat WHEN 3 THEN 5 WHEN 2 THEN 3 ELSE 1 END;`,
  },
  {
    version: 137,
    description:
      "Biblioteca de Músicas — library_tracks (espelho consultável; áudio NUNCA embutido, só caminho+metadados)",
    sql: `
      CREATE TABLE IF NOT EXISTS library_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        artist TEXT,
        genre TEXT,
        bpm REAL,
        music_key TEXT,
        comments TEXT,
        file_path TEXT,
        file_missing INTEGER NOT NULL DEFAULT 0,
        duration_sec INTEGER,
        match_key TEXT,
        source TEXT NOT NULL DEFAULT 'scan',
        archived_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_library_tracks_path ON library_tracks(file_path);
      CREATE INDEX IF NOT EXISTS idx_library_tracks_match ON library_tracks(match_key);
      CREATE INDEX IF NOT EXISTS idx_library_tracks_archived ON library_tracks(archived_at);
    `,
  },
  {
    version: 138,
    description:
      "Biblioteca de Documentos — drive_documents (cache da pasta do Drive) + document_links (associação polimórfica a GIG/festa/contato)",
    sql: `
      CREATE TABLE IF NOT EXISTS drive_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        drive_file_id TEXT NOT NULL,
        name TEXT,
        mime_type TEXT,
        web_view_link TEXT,
        modified_time TEXT,
        cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_drive_documents_fileid ON drive_documents(drive_file_id);
      CREATE TABLE IF NOT EXISTS document_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        drive_document_id INTEGER REFERENCES drive_documents(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_document_links_doc ON document_links(drive_document_id);
      CREATE INDEX IF NOT EXISTS idx_document_links_entity ON document_links(entity_type, entity_id);
    `,
  },
  {
    version: 139,
    description:
      "Biblioteca de Conhecimento — note_folders/notes/note_tags/note_note_tags/note_links + ideas.source_note_id (rastreabilidade nota→ideia)",
    sql: `
      CREATE TABLE IF NOT EXISTS note_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER REFERENCES note_folders(id) ON DELETE SET NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        folder_id INTEGER REFERENCES note_folders(id) ON DELETE SET NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
      CREATE TABLE IF NOT EXISTS note_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS note_note_tags (
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES note_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (note_id, tag_id)
      );
      CREATE TABLE IF NOT EXISTS note_links (
        source_note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        target_note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        PRIMARY KEY (source_note_id, target_note_id)
      );
      CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_note_id);
      ALTER TABLE ideas ADD COLUMN source_note_id INTEGER;
    `,
  },
  {
    version: 140,
    description:
      "Biblioteca → setlist do GIG: gig_library_tracks (faixa da biblioteca tocada + snapshot título/artista; ON DELETE SET NULL preserva o que foi tocado se a faixa for excluída da biblioteca)",
    sql: `
      CREATE TABLE IF NOT EXISTS gig_library_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gig_id INTEGER NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
        library_track_id INTEGER REFERENCES library_tracks(id) ON DELETE SET NULL,
        played_title TEXT,
        played_artist TEXT,
        position INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_glt_gig ON gig_library_tracks(gig_id);
      CREATE INDEX IF NOT EXISTS idx_glt_track ON gig_library_tracks(library_track_id);
    `,
  },
  {
    version: 141,
    description:
      "okr_kr_tasks: UNIQUE(okr_id, kr_index) → UNIQUE(okr_id, kr_index, task_id). A restrição antiga só deixava UMA tarefa por KR; pior, ao vincular a 2ª tarefa o INSERT OR IGNORE era silenciosamente descartado, e uma linha órfã (tarefa já excluída) travava o KR pra sempre. Rebuild da tabela preserva os vínculos existentes.",
    sql: `
      CREATE TABLE IF NOT EXISTS okr_kr_tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        okr_id INTEGER NOT NULL,
        kr_index INTEGER NOT NULL,
        task_id INTEGER NOT NULL,
        UNIQUE(okr_id, kr_index, task_id)
      );
      INSERT INTO okr_kr_tasks_new (okr_id, kr_index, task_id)
        SELECT okr_id, kr_index, task_id FROM okr_kr_tasks;
      DROP TABLE okr_kr_tasks;
      ALTER TABLE okr_kr_tasks_new RENAME TO okr_kr_tasks;
      CREATE INDEX IF NOT EXISTS idx_okr_kr_tasks_okr ON okr_kr_tasks(okr_id, kr_index);
    `,
  },
  {
    version: 142,
    description:
      "Índice em library_tracks(archived_at, artist, title) — acelera a listagem ordenada da Biblioteca de Músicas (evita full scan + sort que travava em bibliotecas grandes).",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_library_tracks_sort
        ON library_tracks(archived_at, artist, title);
    `,
  },
  {
    version: 143,
    description:
      "notes.notion_page_id — id da página da nota no Notion (sync das notas numa database própria, separada das ideias).",
    sql: `
      ALTER TABLE notes ADD COLUMN notion_page_id TEXT;
    `,
  },
  {
    version: 144,
    description:
      "Festas — aba Operação/Dia D: party_runsheet (cronograma do dia, com horário/performer do line-up/notas) + parties.house_pending (pendências com a casa).",
    sql: `
      CREATE TABLE IF NOT EXISTS party_runsheet (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        time TEXT,
        end_time TEXT,
        title TEXT NOT NULL DEFAULT '',
        performer_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_party_runsheet_party ON party_runsheet(party_id, position);
      ALTER TABLE parties ADD COLUMN house_pending TEXT;
    `,
  },
  {
    version: 145,
    description:
      "Festas — guest list / cortesias: party_guests (nome, motivo, quantidade, preço de referência, status). O custo é receita renunciada (qtd × preço), não despesa.",
    sql: `
      CREATE TABLE IF NOT EXISTS party_guests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT '',
        reason TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        ref_price REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Confirmado',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_party_guests_party ON party_guests(party_id);
    `,
  },
  {
    version: 146,
    description:
      "Festas — Séries/Edições: party_series (marca durável: conceito, posicionamento, público, identidade, tom) + parties.series_id/edition_label/edition_number. Festa avulsa = series_id NULL.",
    sql: `
      CREATE TABLE IF NOT EXISTS party_series (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        slug TEXT,
        conceito TEXT,
        posicionamento TEXT,
        publico_alvo TEXT,
        identidade_visual TEXT,
        tom_mensagem TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        archived_at TEXT
      );
      ALTER TABLE parties ADD COLUMN series_id INTEGER REFERENCES party_series(id) ON DELETE SET NULL;
      ALTER TABLE parties ADD COLUMN edition_label TEXT;
      ALTER TABLE parties ADD COLUMN edition_number INTEGER;
      CREATE INDEX IF NOT EXISTS idx_parties_series ON parties(series_id);
    `,
  },
  {
    version: 147,
    description:
      "Alertas — severidade em 3 níveis (critico/atencao/info) nas regras do usuário. O campo 'severity' (alerta/insight) continua sendo o TIPO; 'severidade' é a prioridade.",
    sql: `ALTER TABLE custom_rules ADD COLUMN severidade TEXT NOT NULL DEFAULT 'atencao';`,
  },
  {
    version: 148,
    description:
      "Festas (de-dup 3b): parties.status_override — 1 quando o usuário fixa o status manualmente (a auto-sugestão para de cobrar). O enum de status ganhou Ideia/Em vendas, mas a coluna status é TEXT livre, então só a UI muda; nenhum valor existente vira inválido.",
    sql: `ALTER TABLE parties ADD COLUMN status_override INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 149,
    description:
      "Modo Foco ao vivo (celular→PC): performance_weak_points e performance_moments guardam os marcadores capturados durante a apresentação/sessão (pontos fracos por tipo, momentos marcantes), ligados pela coluna focus_session_id — um UUID gerado no celular. work_sessions.focus_session_id correlaciona a sessão de trabalho ingerida com esses marcadores (a descrição é preenchida depois no PC). gig_id é anulável: hoje o celular manda null, mas o campo já fica pronto pra quando o marcador nascer dentro de uma GIG.",
    sql: `
      ALTER TABLE work_sessions ADD COLUMN focus_session_id TEXT;
      CREATE TABLE IF NOT EXISTS performance_weak_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        focus_session_id TEXT,
        gig_id INTEGER REFERENCES gigs(id) ON DELETE SET NULL,
        tipo TEXT,
        at_ms INTEGER,
        at TEXT,
        descricao TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS performance_moments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        focus_session_id TEXT,
        gig_id INTEGER REFERENCES gigs(id) ON DELETE SET NULL,
        at_ms INTEGER,
        at TEXT,
        descricao TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_perf_weak_session ON performance_weak_points(focus_session_id);
      CREATE INDEX IF NOT EXISTS idx_perf_weak_gig ON performance_weak_points(gig_id);
      CREATE INDEX IF NOT EXISTS idx_perf_moment_session ON performance_moments(focus_session_id);
      CREATE INDEX IF NOT EXISTS idx_perf_moment_gig ON performance_moments(gig_id);
      CREATE INDEX IF NOT EXISTS idx_work_sessions_focus_sid ON work_sessions(focus_session_id);
    `,
  },
  {
    version: 150,
    description:
      "Clube de Fãs — fan_segments: filtros salvos como segmento reutilizável (critérios em JSON, ex.: 'superfãs em Curitiba sem contato há 30d'). fans.origem: origem/aquisição do fã (texto livre), usada como filtro e dimensão de segmento. Aditiva.",
    sql: `
      ALTER TABLE fans ADD COLUMN origem TEXT;
      CREATE TABLE IF NOT EXISTS fan_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        criterios TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    version: 151,
    description:
      "Clube de Fãs — fans.nivel_changed_at: data/hora da última troca de nível do fã (preenchida pelo recálculo de pontuação quando o nível muda). Usada para o balde 'Parabenizar' da superfície 'Hoje' (subiu de nível recentemente) e o 'no nível X desde {data}' do perfil. Aditiva/idempotente.",
    sql: `ALTER TABLE fans ADD COLUMN nivel_changed_at TEXT;`,
  },
  {
    version: 152,
    description:
      "Ideias & Insights — ressurgimento: ideas.last_touched_at (relógio do decaimento do Calor — tocar/editar/reaquecer a ideia reseta; o Calor efetivo decai por inatividade, espelhando a meia-vida do motor de fãs), ideas.source (manual/provocacao/modo_foco/biblioteca/colisao — procedência da ideia) + ideas.source_ref_id (id da origem, interpretado por source). idea_collisions guarda a colisão gerativa (duas ideias OU ideia + semente do material) que pariu uma terceira ideia. Backfill: last_touched_at recebe updated_at/created_at; source vira 'manual' no acervo existente. Aditiva/idempotente.",
    sql: `
      ALTER TABLE ideas ADD COLUMN last_touched_at TEXT;
      ALTER TABLE ideas ADD COLUMN source TEXT;
      ALTER TABLE ideas ADD COLUMN source_ref_id INTEGER;
      UPDATE ideas SET last_touched_at = COALESCE(updated_at, created_at) WHERE last_touched_at IS NULL;
      UPDATE ideas SET source = 'manual' WHERE source IS NULL;
      CREATE TABLE IF NOT EXISTS idea_collisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_a INTEGER REFERENCES ideas(id) ON DELETE CASCADE,
        idea_b INTEGER REFERENCES ideas(id) ON DELETE SET NULL,
        seed_tipo TEXT,
        seed_id INTEGER,
        seed_label TEXT,
        idea_resultante INTEGER REFERENCES ideas(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_idea_collisions_a ON idea_collisions(idea_a);
      CREATE INDEX IF NOT EXISTS idx_idea_collisions_res ON idea_collisions(idea_resultante);
    `,
  },
  {
    version: 153,
    description:
      "NPS — pesquisa própria: nps_responses guarda respostas de NPS registradas manualmente (escala 0-10, padrão do mercado), SEPARADA do NPS derivado das avaliações de contratante das GIGs (escala 0-5). score 0-10, respondent (quem respondeu, opcional), comment (opcional), response_date (ISO da data da resposta), source (procedência, ex.: 'manual'). Aditiva/idempotente.",
    sql: `
      CREATE TABLE IF NOT EXISTS nps_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        score INTEGER NOT NULL,
        respondent TEXT,
        comment TEXT,
        response_date TEXT,
        source TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_nps_responses_date ON nps_responses(response_date);
    `,
  },
  {
    version: 154,
    description:
      "Renomeia o tipo de foco 'Treino' para 'Preparação' nos dados existentes (work_sessions.activity_type e focus_blocks.category). Idempotente.",
    sql: `
      UPDATE work_sessions SET activity_type = 'Preparação' WHERE activity_type = 'Treino';
      UPDATE focus_blocks SET category = 'Preparação' WHERE category = 'Treino';
    `,
  },
  {
    version: 155,
    description:
      "Marcadores ao vivo do Modo Foco — performance_moments.tipo: subtipo do momento marcante (técnico/repertório/postura/conexão), espelhando o tipo do ponto fraco. Antes só os pontos fracos carregavam tipo; agora os pontos fortes também, pro debrief quebrar por categoria. Aditiva/idempotente.",
    sql: `ALTER TABLE performance_moments ADD COLUMN tipo TEXT;`,
  },
  {
    version: 156,
    description:
      "GIG — gigs.prep_notes: observações livres da aba Preparação (separadas do checklist prep_state). A lâmpada de insight do Modo Foco → Preparação no celular acrescenta aqui. Aditiva/idempotente.",
    sql: `ALTER TABLE gigs ADD COLUMN prep_notes TEXT;`,
  },
  {
    version: 157,
    description:
      "Fornecedor — supplier_services.category: categoria POR SERVIÇO (antes era única por fornecedor). Aditiva/idempotente.",
    sql: `ALTER TABLE supplier_services ADD COLUMN category TEXT;`,
  },
  {
    version: 158,
    description:
      "Festas/Orçamento — party_budget_items.premissa (premissa/assunção por linha, ex.: 'cachê fechado por hora') e nota_variancia (causa-raiz do desvio projetado×real, preenchida no fechamento). Alimentam a análise de variância. Aditivas/idempotentes.",
    sql: `
      ALTER TABLE party_budget_items ADD COLUMN premissa TEXT;
      ALTER TABLE party_budget_items ADD COLUMN nota_variancia TEXT;
    `,
  },
  {
    version: 159,
    description:
      "Festas/Workflow — party_tasks.responsavel_contact_id: responsável pela tarefa (FK contacts), pra a tarefa de etapa virar cronograma com dono. Aditiva/idempotente.",
    sql: `ALTER TABLE party_tasks ADD COLUMN responsavel_contact_id INTEGER;`,
  },
  {
    version: 160,
    description:
      "Festas/Cortesias — party_guests.unit_cost: custo variável real por cabeça da cortesia (welcome drink, pulseira, kit). Cortesia tem receita renunciada E custo de caixa; só o custo variável entra no líquido. Aditiva/idempotente.",
    sql: `ALTER TABLE party_guests ADD COLUMN unit_cost REAL NOT NULL DEFAULT 0;`,
  },
  {
    version: 161,
    description:
      "Festas/P&L — parties.bar_revenue: receita de bar atribuída à festa (a parte que fica com o produtor). Entra na receita do P&L e alimenta o faturamento por cabeça. Aditiva/idempotente.",
    sql: `ALTER TABLE parties ADD COLUMN bar_revenue REAL;`,
  },
  {
    version: 162,
    description:
      "Festas/Ingressos — party_ticket_sales: pontos datados da curva de venda (quantos ingressos vendidos até cada data). Mostra o ritmo de venda (front-loaded x last-minute) e o sell-through. Tabela nova, idempotente.",
    sql: `
      CREATE TABLE IF NOT EXISTS party_ticket_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL,
        sale_date TEXT NOT NULL,
        cumulative_sold INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_party_ticket_sales_party ON party_ticket_sales(party_id, sale_date);
    `,
  },
  {
    version: 163,
    description:
      "Festas/CAC — parties.target_cac: custo de aquisição por comprador ALVO (meta). O cockpit compara o CAC real com essa meta pra saber se o marketing está eficiente. Aditiva/idempotente.",
    sql: `ALTER TABLE parties ADD COLUMN target_cac REAL;`,
  },
  {
    version: 164,
    description:
      "Festas/Compliance — party_compliance: checklist estruturado de licenças/obrigações (ECAD, alvará, bombeiros, SMMA, segurança, sanitária) com status, protocolo, prazo e nota. Tira o compliance do 'na cabeça' e vira responsabilidade rastreável. Tabela nova, idempotente.",
    sql: `
      CREATE TABLE IF NOT EXISTS party_compliance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pendente',
        protocol TEXT,
        due_date TEXT,
        notes TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_party_compliance_party ON party_compliance(party_id, position);
    `,
  },
  {
    version: 165,
    description:
      "Festas/Operação — party_runsheet.duration_min: duração (min) de cada item do run-of-show, pra montar o cronograma REVERSO (recalcula os horários de trás pra frente a partir de uma âncora). Aditiva/idempotente.",
    sql: `ALTER TABLE party_runsheet ADD COLUMN duration_min INTEGER;`,
  },
  {
    version: 166,
    description:
      "Festas/Rider — rider_templates: biblioteca de riders técnicos reutilizáveis (nome + itens em JSON), pra não remontar o rider a cada festa. Tabela nova, idempotente.",
    sql: `
      CREATE TABLE IF NOT EXISTS rider_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        items TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    version: 167,
    description:
      "Festas/Marketing — party_marketing_assets (peças: flyer, reel, stories… com status/prazo/link/vínculo a Conteúdo) + party_marketing_actions (ações datadas por canal, com papel e código de rastreio). Tira Artes e Canais do texto solto e vira lista rastreável. Tabelas novas, idempotentes.",
    sql: `
      CREATE TABLE IF NOT EXISTS party_marketing_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        format TEXT,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'briefada',
        link TEXT,
        notes TEXT,
        content_id INTEGER,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_party_marketing_assets_party ON party_marketing_assets(party_id, position);
      CREATE TABLE IF NOT EXISTS party_marketing_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL,
        canal TEXT NOT NULL,
        papel TEXT NOT NULL DEFAULT 'aquisicao',
        acao TEXT,
        date TEXT,
        done INTEGER NOT NULL DEFAULT 0,
        tracking_code TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_party_marketing_actions_party ON party_marketing_actions(party_id, date);
    `,
  },
  {
    version: 168,
    description:
      "Festas/Viabilidade — party_venue_candidates ganha capacity, deal_type, deal_terms, estimated_cost e is_leader: a comparação/escolha de casa (com acordo e custo estimados) passa a viver na Viabilidade. Colunas aditivas idempotentes; valores antigos preservados.",
    sql: `
      ALTER TABLE party_venue_candidates ADD COLUMN capacity INTEGER;
      ALTER TABLE party_venue_candidates ADD COLUMN deal_type TEXT;
      ALTER TABLE party_venue_candidates ADD COLUMN deal_terms TEXT;
      ALTER TABLE party_venue_candidates ADD COLUMN estimated_cost REAL;
      ALTER TABLE party_venue_candidates ADD COLUMN is_leader INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 169,
    description:
      "Festas/Execução — party_compliance ganha responsavel (casa/você) e valor: as Formalidades pré-dia (ECAD, alvará/CLCB, som, segurança) viram bloco estruturado da Execução. parties.lineup_status: mapa de confirmação por DJ (contact_id → status/prazo) sem mexer no formato do lineup. Colunas aditivas idempotentes.",
    sql: `
      ALTER TABLE party_compliance ADD COLUMN responsavel TEXT;
      ALTER TABLE party_compliance ADD COLUMN valor REAL;
      ALTER TABLE parties ADD COLUMN lineup_status TEXT NOT NULL DEFAULT '{}';
    `,
  },
  {
    version: 170,
    description:
      "Festas/Equipe — party_budget_items ganha kind ('custo'|'receita') e contact_id: os valores da Equipe (patrocínio=receita, produção/cachê de DJ=custo) passam a viver no Orçamento (fonte única). kind default 'custo' preserva itens antigos como custo. contact_id liga a linha de cachê ao DJ (contacts). Colunas aditivas idempotentes.",
    sql: `
      ALTER TABLE party_budget_items ADD COLUMN kind TEXT NOT NULL DEFAULT 'custo';
      ALTER TABLE party_budget_items ADD COLUMN contact_id INTEGER;
    `,
  },
  {
    version: 171,
    description:
      "GIGs/Debrief — gigs ganha rating_floor (eixo Pista: lotação/retenção/resposta) + rating_floor_note. Entra na média (média simples dos eixos preenchidos); GIGs antigas sem o eixo degradam sem erro. Colunas aditivas idempotentes.",
    sql: `
      ALTER TABLE gigs ADD COLUMN rating_floor INTEGER;
      ALTER TABLE gigs ADD COLUMN rating_floor_note TEXT;
    `,
  },
  {
    version: 172,
    description:
      "GIGs/Debrief — gigs.prep_pct_at_debrief congela o % da Preparação no momento em que o debrief é finalizado (0-100). Alimenta o chip do cabeçalho e a leitura 'avaliação × faixa de preparação' nos Insights. Coluna aditiva idempotente.",
    sql: `
      ALTER TABLE gigs ADD COLUMN prep_pct_at_debrief INTEGER;
    `,
  },
  {
    version: 173,
    description:
      "GIGs/Debrief — venue_tech_notes: conhecimento técnico acumulado por venue (som, energia, setup). Origem numa GIG (gig_id anulável), aparece na Preparação de GIGs futuras no mesmo venue. Tabela nova.",
    sql: `
      CREATE TABLE IF NOT EXISTS venue_tech_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        gig_id INTEGER REFERENCES gigs(id) ON DELETE SET NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_venue_tech_notes_venue ON venue_tech_notes(venue_id);
    `,
  },
  {
    version: 174,
    description:
      "Aulas — students.knowledge_level: nível de conhecimento do aluno (Básico/Intermediário/Avançado). Coluna aditiva idempotente.",
    sql: `
      ALTER TABLE students ADD COLUMN knowledge_level TEXT;
    `,
  },
  {
    version: 175,
    description:
      "Clube de fãs — fans.indicated_by_fan_id: quem indicou este fã (outro fã). Alimenta o sinal de Indicação na pontuação (o indicador recebe crédito). Coluna aditiva idempotente.",
    sql: `
      ALTER TABLE fans ADD COLUMN indicated_by_fan_id INTEGER;
    `,
  },
  {
    version: 176,
    description:
      "Energia (EMA) — energy_logs: registros avulsos de energia (1–5) capturados no celular no momento. Junto das sessões de trabalho, alimentam o heatmap dia×hora do Modo Foco. Tabela nova.",
    sql: `
      CREATE TABLE IF NOT EXISTS energy_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        logged_at TEXT NOT NULL,
        energy_level INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 177,
    description:
      "Aulas — classes.paid: recebido? (null = legado/como hoje; 1 = pago; 0 = dada mas não paga). Permite o celular marcar 'aula dada' separado de 'paga' (§2). Coluna aditiva idempotente; null preserva o comportamento atual (Realizada = Recebido).",
    sql: `
      ALTER TABLE classes ADD COLUMN paid INTEGER;
    `,
  },
  {
    version: 178,
    description:
      "Check-in de GIG — fan_list_members.arrived_at: quando o convidado VIP chegou (marcado no celular, na porta). null = ainda não chegou. Coluna aditiva idempotente (§1).",
    sql: `
      ALTER TABLE fan_list_members ADD COLUMN arrived_at TEXT;
    `,
  },
  {
    version: 179,
    description:
      "Conteúdo — content_raw_media: matéria-prima de mídia (foto/clipe) capturada no celular durante a GIG e trazida pro inbox do Conteúdo (semente de aftermovie/stories). O binário mora em uploads/ (file_path); aqui ficam só os metadados. gig_id/content_id anuláveis (ON DELETE SET NULL). §5.",
    sql: `
      CREATE TABLE IF NOT EXISTS content_raw_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gig_id INTEGER REFERENCES gigs(id) ON DELETE SET NULL,
        media_kind TEXT NOT NULL DEFAULT 'photo',   -- 'photo' | 'clip'
        file_path TEXT NOT NULL,                     -- relativo a uploads/
        mime TEXT,
        caption TEXT,
        captured_at TEXT,
        origin TEXT NOT NULL DEFAULT 'mobile',
        content_id INTEGER REFERENCES content(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'novo',         -- 'novo' | 'usado' | 'arquivado'
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_content_raw_media_gig ON content_raw_media(gig_id);
      CREATE INDEX IF NOT EXISTS idx_content_raw_media_status ON content_raw_media(status);
    `,
  },
];


/**
 * Checks if a column exists in a table using pragma_table_info.
 * Used to guard ALTER TABLE ADD COLUMN statements for idempotency.
 */
async function columnExists(db: Db, table: string, column: string): Promise<boolean> {
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM pragma_table_info('${table}') WHERE name='${column}'`
  );
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Parses an ALTER TABLE ADD COLUMN statement and returns { table, column } or null.
 */
function parseAlter(stmt: string): { table: string; column: string } | null {
  const m = /^\s*ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i.exec(stmt);
  if (!m) return null;
  return { table: m[1], column: m[2] };
}

/** Executa todas as migrations pendentes na ordem. Idempotente. */
export async function runMigrations(db: Db): Promise<{ applied: number[] }> {
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
    const statements = m.sql
      .split(/;/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Pré-filtra ALTER ADD COLUMN cuja coluna já existe (idempotência) — esse
    // check é leitura e fica fora da transação. O resto roda como UM lote
    // atômico: ou a migration inteira aplica, ou nada aplica (ROLLBACK). Sem
    // estado parcial — o defeito antigo era marcar a versão como aplicada mesmo
    // com statements falhando no meio.
    const batch: BatchStatement[] = [];
    for (const stmt of statements) {
      const alter = parseAlter(stmt);
      if (alter && (await columnExists(db, alter.table, alter.column))) continue;
      batch.push({ sql: stmt });
    }

    try {
      if (batch.length > 0) await db.executeBatch(batch);
    } catch (err) {
      // Migration revertida por inteiro (batch atômico → schema consistente em
      // N-1). NÃO marca como aplicada (uma versão futura corrigida tenta de
      // novo) e registra o erro pra diagnóstico. PARA o loop aqui (em vez de
      // seguir): aplicar N+1..max sobre um N que falhou arrisca drift de schema
      // por dependência. As migrations viram um prefixo estrito (1..K aplicadas,
      // K+1..max nenhuma); o próximo boot retoma de N quando a causa for sanada.
      const msg = err instanceof Error ? err.message : String(err);
      try {
        await db.execute(
          "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
          [`migration_error_v${m.version}`, msg]
        );
      } catch {
        // best-effort: se app_settings ainda não existe, ignora
      }
      break;
    }

    await db.execute(
      "INSERT INTO _migrations (version, description) VALUES ($1, $2)",
      [m.version, m.description]
    );
    applied.push(m.version);
  }

  return { applied };
}
