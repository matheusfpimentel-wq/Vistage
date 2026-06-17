// Banco com escrita offline + sync ao Turso (libsql::new_synced_database).
// build() abre só o arquivo local (instantâneo, funciona offline); as escritas
// vão para o arquivo local e o db.sync() empurra para o Turso e puxa mudanças.
// A migração one-shot lê o .db legado com new_local e escreve via conn.

use base64::Engine;
use serde::Serialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::State;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct DbState {
    db: Arc<Mutex<Option<libsql::Database>>>,
    conn: Arc<Mutex<Option<libsql::Connection>>>,
}

/// Sync best-effort com teto de tempo, para rodar antes de fechar o app sem
/// travar o fechamento quando offline.
pub async fn sync_blocking(state: &DbState, timeout_secs: u64) {
    // Tira o db do mutex (take), solta o lock, sincroniza, devolve.
    // Sem isso o mutex fica preso durante db.sync() e bloqueia todos os outros
    // comandos que precisam do mesmo lock (reset, diagnostics, execute).
    let db = { state.db.lock().await.take() };
    if let Some(db) = db {
        let _ = tokio::time::timeout(Duration::from_secs(timeout_secs), db.sync()).await;
        *state.db.lock().await = Some(db);
    }
}

fn json_to_libsql(v: &serde_json::Value) -> libsql::Value {
    match v {
        serde_json::Value::Null => libsql::Value::Null,
        serde_json::Value::Bool(b) => libsql::Value::Integer(if *b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                libsql::Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                libsql::Value::Real(f)
            } else {
                libsql::Value::Null
            }
        }
        serde_json::Value::String(s) => libsql::Value::Text(s.clone()),
        other => libsql::Value::Text(other.to_string()),
    }
}

fn libsql_to_json(v: libsql::Value) -> serde_json::Value {
    match v {
        libsql::Value::Null => serde_json::Value::Null,
        libsql::Value::Integer(i) => serde_json::Value::Number(i.into()),
        libsql::Value::Real(f) => serde_json::Number::from_f64(f)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        libsql::Value::Text(s) => serde_json::Value::String(s),
        libsql::Value::Blob(b) => {
            serde_json::Value::String(base64::engine::general_purpose::STANDARD.encode(b))
        }
    }
}

fn params_from(json: &[serde_json::Value]) -> Vec<libsql::Value> {
    json.iter().map(json_to_libsql).collect()
}

/// Abre o banco local com capacidade de sync ao Turso. build() não faz rede
/// (não setamos sync_interval), então a abertura é instantânea e funciona
/// offline. O sync inicial é aguardado (com timeout) antes de retornar, para o
/// app não abrir sobre um snapshot local desatualizado. Retorna `true` se
/// sincronizou com o Turso, `false` se seguiu em modo offline.
#[tauri::command]
pub async fn db_init(
    state: State<'_, DbState>,
    replica_path: String,
    turso_url: String,
    turso_token: String,
) -> Result<bool, String> {
    let db = libsql::Builder::new_synced_database(replica_path, turso_url, turso_token)
        .build()
        .await
        .map_err(|e| e.to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;
    conn.execute("PRAGMA foreign_keys = ON;", ())
        .await
        .map_err(|e| e.to_string())?;

    // Sync inicial AGUARDADO (com timeout) ANTES de devolver o controle ao
    // frontend. Sem isso, o app abria lendo a réplica local que ainda não tinha
    // puxado o estado mais recente do Turso — e a UI renderizava vazia (ex.:
    // "todas as GIGs e aulas sumiram" ao logar em outra máquina). Se o sync
    // falhar/expirar (offline ou token), seguimos em modo offline com o que há
    // localmente; `db_sync` periódico tenta de novo. Retorna se sincronizou,
    // para o frontend poder avisar quando estiver mostrando dados possivelmente
    // desatualizados.
    let synced = matches!(
        tokio::time::timeout(Duration::from_secs(20), db.sync()).await,
        Ok(Ok(_))
    );

    *state.db.lock().await = Some(db);
    *state.conn.lock().await = Some(conn);
    Ok(synced)
}

#[tauri::command]
pub async fn db_select(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Map<String, serde_json::Value>>, String> {
    let guard = state.conn.lock().await;
    let conn = guard.as_ref().ok_or("banco não inicializado")?;

    let mut rows = conn
        .query(&sql, params_from(&params))
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let cols = rows.column_count();
        let mut obj = serde_json::Map::new();
        for i in 0..cols {
            let name = rows
                .column_name(i)
                .map(|s| s.to_string())
                .unwrap_or_else(|| i.to_string());
            let value = row.get_value(i).map_err(|e| e.to_string())?;
            obj.insert(name, libsql_to_json(value));
        }
        out.push(obj);
    }
    Ok(out)
}

#[derive(Serialize)]
pub struct ExecResult {
    #[serde(rename = "rowsAffected")]
    rows_affected: u64,
    #[serde(rename = "lastInsertId")]
    last_insert_id: i64,
}

#[tauri::command]
pub async fn db_execute(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<ExecResult, String> {
    let guard = state.conn.lock().await;
    let conn = guard.as_ref().ok_or("banco não inicializado")?;

    let rows_affected = conn
        .execute(&sql, params_from(&params))
        .await
        .map_err(|e| e.to_string())?;

    Ok(ExecResult {
        rows_affected,
        last_insert_id: conn.last_insert_rowid(),
    })
}

/// Empurra escritas locais para o Turso e puxa mudanças remotas.
/// CRÍTICO: clona o Database e solta o mutex ANTES da chamada de rede — sem
/// isso o lock fica preso enquanto db.sync() trava (sem rede), bloqueando
/// TODOS os outros comandos (reset, diagnostics, execute) que precisam do
/// mesmo mutex. Com o clone o mutex é liberado imediatamente e os outros
/// comandos podem prosseguir mesmo que o sync esteja em andamento.
#[tauri::command]
pub async fn db_sync(state: State<'_, DbState>) -> Result<(), String> {
    // take() retira o db do Option e solta o mutex imediatamente — sync() pode
    // demorar ou travar sem segurar o lock, então outros comandos não bloqueiam.
    let db = state.db.lock().await.take().ok_or("banco não inicializado")?;
    let result = tokio::time::timeout(Duration::from_secs(20), db.sync()).await;
    *state.db.lock().await = Some(db); // sempre devolve
    result
        .map_err(|_| "sync expirou (20s)".to_string())?
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Apaga o arquivo de réplica local e reabre do Turso do zero.
/// Resolve casos onde a réplica local está corrompida ou dessincronizada.
/// CRÍTICO: sempre restaura uma conexão funcional no state, mesmo se o sync
/// falhar/expirar — assim o app nunca fica bricado (sem conexão). Se o sync não
/// completar, retorna Err com mensagem, mas a réplica (vazia) já está conectada.
#[tauri::command]
pub async fn db_reset_replica(
    state: State<'_, DbState>,
    replica_path: String,
    turso_url: String,
    turso_token: String,
) -> Result<bool, String> {
    // 1. Fecha a conexão e o banco atual, liberando o lock do arquivo
    {
        *state.conn.lock().await = None;
        *state.db.lock().await = None;
    }

    // 2. Apaga o arquivo de réplica (e o WAL/SHM se existirem)
    for suffix in &["", "-wal", "-shm"] {
        let path = format!("{}{}", replica_path, suffix);
        let _ = std::fs::remove_file(&path);
    }

    // 3. Reabre. build() faz uma chamada de rede para o Turso (busca o frame
    //    inicial), então precisa de timeout. Se expirar, o app fica sem conexão
    //    até um próximo db_init — por isso restauramos um db vazio mesmo assim.
    let build_result = tokio::time::timeout(
        Duration::from_secs(30),
        libsql::Builder::new_synced_database(replica_path, turso_url, turso_token).build(),
    )
    .await;

    let db = match build_result {
        Ok(Ok(d)) => d,
        Ok(Err(e)) => return Err(format!("Falha ao abrir banco: {}", e)),
        Err(_) => return Err("Timeout ao abrir banco (>30s). Verifique a internet e tente novamente.".to_string()),
    };

    let conn = db.connect().map_err(|e| e.to_string())?;
    let _ = conn.execute("PRAGMA foreign_keys = ON;", ()).await;

    // 4. Sync com timeout. db ainda não está no state, então não precisa de
    //    take() aqui — mas sync() é &self então db ainda é usável depois.
    let sync_outcome = tokio::time::timeout(Duration::from_secs(30), db.sync()).await;

    // 5. SEMPRE restaura a conexão funcional (mesmo réplica vazia/parcial)
    *state.db.lock().await = Some(db);
    *state.conn.lock().await = Some(conn);

    match sync_outcome {
        Ok(Ok(_)) => Ok(true),
        Ok(Err(e)) => Err(format!("Falha ao baixar do Turso: {}", e)),
        Err(_) => Err("Timeout ao baixar do Turso (>30s). Verifique a internet e tente de novo — o app continua funcional com o que foi baixado até agora.".to_string()),
    }
}

/// Diagnóstico RÁPIDO e seguro: nunca trava (timeout curto em tudo) e NÃO faz
/// sync (que é a operação que pode travar). Só lê: arquivo local, contagem na
/// réplica local, e contagem DIRETO no Turso (bounded), para distinguir
/// "Turso vazio" de "réplica não baixou".
#[tauri::command]
pub async fn db_diagnostics(
    state: State<'_, DbState>,
    replica_path: String,
    turso_url: String,
    turso_token: String,
) -> Result<serde_json::Value, String> {
    let mut out = serde_json::Map::new();

    // ── 1. Arquivo de réplica local ──────────────────────────────────────────
    let replica_meta = {
        let mut m = serde_json::Map::new();
        match std::fs::metadata(&replica_path) {
            Ok(meta) => {
                m.insert("exists".into(), true.into());
                m.insert("size_bytes".into(), meta.len().into());
                m.insert(
                    "size_kb".into(),
                    serde_json::Value::String(format!("{:.1} KB", meta.len() as f64 / 1024.0)),
                );
            }
            Err(_) => {
                m.insert("exists".into(), false.into());
                m.insert("size_bytes".into(), 0.into());
            }
        }
        serde_json::Value::Object(m)
    };
    out.insert("replica_file".into(), replica_meta);

    out.insert("turso_url".into(), turso_url.clone().into());
    out.insert("turso_token_len".into(), turso_token.len().into());

    // ── 2. Contagem na réplica LOCAL (não faz rede, mas com timeout por via das
    //       dúvidas — e sem segurar o lock além do necessário) ────────────────
    let tables = [
        "gigs", "students", "classes", "content", "tracks",
        "contacts", "tasks", "finance_transactions", "parties", "_migrations",
    ];
    let mut counts = serde_json::Map::new();
    {
        let guard = state.conn.lock().await;
        if let Some(conn) = guard.as_ref() {
            for table in &tables {
                let sql = format!("SELECT COUNT(*) as n FROM {}", table);
                let q = tokio::time::timeout(Duration::from_secs(5), conn.query(&sql, ())).await;
                match q {
                    Ok(Ok(mut rows)) => {
                        let n: i64 = match tokio::time::timeout(Duration::from_secs(5), rows.next()).await {
                            Ok(Ok(Some(row))) => row.get(0).unwrap_or(0),
                            _ => 0,
                        };
                        counts.insert(table.to_string(), n.into());
                    }
                    Ok(Err(e)) => {
                        counts.insert(table.to_string(), serde_json::Value::String(format!("ERROR: {}", e)));
                    }
                    Err(_) => {
                        counts.insert(table.to_string(), serde_json::Value::String("timeout".into()));
                    }
                }
            }
        } else {
            out.insert("local_conn".into(), serde_json::Value::String("sem conexão (banco não inicializado)".into()));
        }
    }
    out.insert("row_counts".into(), serde_json::Value::Object(counts));

    // ── 3. Conexão DIRETA ao Turso — tudo dentro de UM timeout de 12s ────────
    let t0 = Instant::now();
    let remote_fut = async {
        let remote_db = libsql::Builder::new_remote(turso_url.clone(), turso_token.clone())
            .build()
            .await
            .map_err(|e| e.to_string())?;
        let remote_conn = remote_db.connect().map_err(|e| e.to_string())?;
        let mut remote_counts = serde_json::Map::new();
        for table in &["gigs", "students", "classes", "content", "_migrations"] {
            let sql = format!("SELECT COUNT(*) as n FROM {}", table);
            match remote_conn.query(&sql, ()).await {
                Ok(mut rows) => {
                    let n: i64 = match rows.next().await {
                        Ok(Some(row)) => row.get(0).unwrap_or(0),
                        _ => 0,
                    };
                    remote_counts.insert(table.to_string(), n.into());
                }
                Err(e) => {
                    remote_counts.insert(table.to_string(), serde_json::Value::String(format!("ERROR: {}", e)));
                }
            }
        }
        Ok::<serde_json::Map<String, serde_json::Value>, String>(remote_counts)
    };

    let remote_test = match tokio::time::timeout(Duration::from_secs(12), remote_fut).await {
        Ok(Ok(rc)) => serde_json::json!({ "ok": true, "ms": t0.elapsed().as_millis(), "row_counts": rc }),
        Ok(Err(e)) => serde_json::json!({ "ok": false, "error": e }),
        Err(_) => serde_json::json!({ "ok": false, "error": "timeout >12s ao conectar no Turso (rede ou URL/token)" }),
    };
    out.insert("turso_direct".into(), remote_test);

    Ok(serde_json::Value::Object(out))
}

/// Migração one-shot do .db SQLite legado para o Turso.
/// Lê o arquivo legado com new_local; escreve no Turso via conn (já configurada).
#[tauri::command]
pub async fn db_migrate_from_sqlite(
    state: State<'_, DbState>,
    sqlite_path: String,
) -> Result<Vec<(String, u64)>, String> {
    let db_guard = state.db.lock().await;
    let db = db_guard.as_ref().ok_or("banco não inicializado")?;
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.as_ref().ok_or("banco não inicializado")?;

    // Desliga a checagem de FK durante a cópia: inserimos as tabelas em ordem
    // alfabética, então uma linha-filha pode entrar antes da linha-pai. Sem isso
    // o SQLite recusa com "FOREIGN KEY constraint failed".
    conn.execute("PRAGMA foreign_keys = OFF;", ())
        .await
        .map_err(|e| e.to_string())?;

    let src_db = libsql::Builder::new_local(&sqlite_path)
        .build()
        .await
        .map_err(|e| e.to_string())?;
    let src = src_db.connect().map_err(|e| e.to_string())?;

    let tables: Vec<String> = {
        let mut rows = src
            .query(
                "SELECT name FROM sqlite_master WHERE type='table' \
                 AND name NOT LIKE 'sqlite_%' ORDER BY name",
                (),
            )
            .await
            .map_err(|e| e.to_string())?;
        let mut names = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let name: String = row.get(0).map_err(|e| e.to_string())?;
            names.push(name);
        }
        names
    };

    let mut report: Vec<(String, u64)> = Vec::new();

    for table in &tables {
        let cols: Vec<String> = {
            let mut rows = src
                .query(&format!("PRAGMA table_info(\"{}\")", table), ())
                .await
                .map_err(|e| e.to_string())?;
            let mut names = Vec::new();
            while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
                let col_name: String = row.get(1).map_err(|e| e.to_string())?;
                names.push(col_name);
            }
            names
        };
        if cols.is_empty() {
            continue;
        }

        conn.execute(&format!("DELETE FROM \"{}\"", table), ())
            .await
            .map_err(|e| e.to_string())?;

        let col_list = cols
            .iter()
            .map(|c| format!("\"{}\"", c))
            .collect::<Vec<_>>()
            .join(", ");
        let placeholders = (1..=cols.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(", ");
        let insert_sql = format!(
            "INSERT OR IGNORE INTO \"{}\" ({}) VALUES ({})",
            table, col_list, placeholders
        );

        let select_sql = format!("SELECT {} FROM \"{}\"", col_list, table);
        let mut src_rows = src
            .query(&select_sql, ())
            .await
            .map_err(|e| e.to_string())?;

        let mut count: u64 = 0;
        while let Some(row) = src_rows.next().await.map_err(|e| e.to_string())? {
            let mut vals: Vec<libsql::Value> = Vec::with_capacity(cols.len());
            for i in 0..cols.len() {
                vals.push(row.get_value(i as i32).map_err(|e| e.to_string())?);
            }
            conn.execute(&insert_sql, vals)
                .await
                .map_err(|e| e.to_string())?;
            count += 1;
        }
        report.push((table.clone(), count));
    }

    conn.execute("PRAGMA foreign_keys = ON;", ())
        .await
        .map_err(|e| e.to_string())?;

    // Empurra tudo o que foi migrado para o Turso.
    db.sync().await.map_err(|e| e.to_string())?;
    Ok(report)
}
