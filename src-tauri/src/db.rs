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

// Database é guardado dentro de um Arc para que possamos clonar a referência
// e soltar o mutex ANTES de chamar db.sync() — que pode demorar ou travar.
// Sem o Arc, seria necessário take() que cria uma janela onde state.db = None
// e qualquer db_select/db_execute falharia com "banco não inicializado".
#[derive(Default)]
pub struct DbState {
    db: Arc<Mutex<Option<Arc<libsql::Database>>>>,
    conn: Arc<Mutex<Option<libsql::Connection>>>,
}

/// Sync best-effort com teto de tempo, para rodar antes de fechar o app sem
/// travar o fechamento quando offline.
pub async fn sync_blocking(state: &DbState, timeout_secs: u64) {
    // Clona o Arc (barato), solta o mutex, sincroniza sem bloquear nada.
    let db = {
        let guard = state.db.lock().await;
        guard.as_ref().map(Arc::clone)
    };
    if let Some(db) = db {
        let _ = tokio::time::timeout(Duration::from_secs(timeout_secs), db.sync()).await;
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

/// Abre o banco local com capacidade de sync ao Turso. Retorna `true` se
/// sincronizou com o Turso, `false` se seguiu em modo offline.
/// Se o banco já estiver aberto (reconectar), fecha o anterior limpo antes.
#[tauri::command]
pub async fn db_init(
    state: State<'_, DbState>,
    replica_path: String,
    turso_url: String,
    turso_token: String,
) -> Result<bool, String> {
    // Se já existe uma conexão aberta (ex: botão "Reconectar"), fecha-a primeiro
    // para não criar dois handles no mesmo arquivo.
    {
        *state.conn.lock().await = None;
        *state.db.lock().await = None;
    }

    let db = libsql::Builder::new_synced_database(replica_path, turso_url, turso_token)
        .build()
        .await
        .map_err(|e| e.to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;
    conn.execute("PRAGMA foreign_keys = ON;", ())
        .await
        .map_err(|e| e.to_string())?;

    // Sync inicial com timeout antes de devolver o controle ao frontend.
    // Clona o Arc para sincronizar FORA do lock (padrão de todo db_sync).
    let db = Arc::new(db);
    let synced = matches!(
        tokio::time::timeout(Duration::from_secs(20), db.sync()).await,
        Ok(Ok(_))
    );

    *state.db.lock().await = Some(Arc::clone(&db));
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
/// Clona o Arc<Database> e solta o mutex antes da chamada de rede — db_select
/// e db_execute (que usam state.conn, mutex diferente) continuam funcionando
/// normalmente enquanto o sync roda em paralelo.
#[tauri::command]
pub async fn db_sync(state: State<'_, DbState>) -> Result<(), String> {
    let db = {
        let guard = state.db.lock().await;
        guard.as_ref().ok_or("banco não inicializado").map(Arc::clone)?
    }; // mutex liberado aqui
    tokio::time::timeout(Duration::from_secs(20), db.sync())
        .await
        .map_err(|_| "sync expirou (20s)".to_string())?
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Apaga o arquivo de réplica local e reabre do Turso do zero.
/// Sempre restaura uma conexão funcional no state, mesmo se o sync falhar.
#[tauri::command]
pub async fn db_reset_replica(
    state: State<'_, DbState>,
    replica_path: String,
    turso_url: String,
    turso_token: String,
) -> Result<bool, String> {
    // 1. Fecha conexão e banco atual
    {
        *state.conn.lock().await = None;
        *state.db.lock().await = None;
    }

    // 2. Apaga réplica + WAL/SHM
    for suffix in &["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{}", replica_path, suffix));
    }

    // 3. build() faz rede (busca frame inicial do Turso), precisa de timeout
    let build_result = tokio::time::timeout(
        Duration::from_secs(45),
        libsql::Builder::new_synced_database(replica_path, turso_url, turso_token).build(),
    )
    .await;

    let db = match build_result {
        Ok(Ok(d)) => Arc::new(d),
        Ok(Err(e)) => return Err(format!("Falha ao abrir banco: {}", e)),
        Err(_) => return Err("Timeout ao abrir banco (>45s). Verifique a internet.".to_string()),
    };

    let conn = db.connect().map_err(|e| e.to_string())?;
    let _ = conn.execute("PRAGMA foreign_keys = ON;", ()).await;

    // 4. Sync — clona Arc, restaura state ANTES de sincronizar para que outros
    //    comandos não falhem durante o download (que pode levar vários segundos)
    *state.db.lock().await = Some(Arc::clone(&db));
    *state.conn.lock().await = Some(conn);

    match tokio::time::timeout(Duration::from_secs(45), db.sync()).await {
        Ok(Ok(_)) => Ok(true),
        Ok(Err(e)) => Err(format!("Falha ao baixar do Turso: {}", e)),
        Err(_) => Err("Timeout ao baixar do Turso (>45s). O app está funcional com os dados já baixados — tente sincronizar novamente.".to_string()),
    }
}

/// Diagnóstico rápido e seguro: nunca trava (timeouts em tudo), não faz sync.
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

    // ── 2. Contagem na réplica LOCAL ─────────────────────────────────────────
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
                let q = tokio::time::timeout(Duration::from_secs(8), conn.query(&sql, ())).await;
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

    // ── 3. Conexão DIRETA ao Turso ───────────────────────────────────────────
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

    let remote_test = match tokio::time::timeout(Duration::from_secs(15), remote_fut).await {
        Ok(Ok(rc)) => serde_json::json!({ "ok": true, "ms": t0.elapsed().as_millis(), "row_counts": rc }),
        Ok(Err(e)) => serde_json::json!({ "ok": false, "error": e }),
        Err(_) => serde_json::json!({ "ok": false, "error": "timeout >15s ao conectar no Turso" }),
    };
    out.insert("turso_direct".into(), remote_test);

    Ok(serde_json::Value::Object(out))
}

/// Migração one-shot do .db SQLite legado para o Turso.
/// Libera os locks ANTES do loop de INSERT (operação longa) para não bloquear
/// db_select/db_execute durante a migração.
#[tauri::command]
pub async fn db_migrate_from_sqlite(
    state: State<'_, DbState>,
    sqlite_path: String,
) -> Result<Vec<(String, u64)>, String> {
    // Tira conn do mutex e solta o lock — o loop de INSERT pode levar segundos
    // e não deve bloquear outros leitores. db_select/db_execute falharão durante
    // a migração (conn = None), mas a migração é uma ação explícita do usuário.
    let conn = state.conn.lock().await.take().ok_or("banco não inicializado")?;
    let db = {
        let guard = state.db.lock().await;
        guard.as_ref().ok_or("banco não inicializado").map(Arc::clone)?
    }; // lock do db liberado

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

    // Restaura conn antes de sincronizar — sync é longo e conn deve estar
    // disponível para o app durante o processo.
    *state.conn.lock().await = Some(conn);

    // Sync via Arc clonado, sem segurar nenhum lock.
    tokio::time::timeout(Duration::from_secs(60), db.sync())
        .await
        .map_err(|_| "sync expirou (60s) após migração".to_string())?
        .map_err(|e| e.to_string())?;

    Ok(report)
}
