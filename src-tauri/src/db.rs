// Banco com escrita offline + sync ao Turso (libsql::new_synced_database).
// build() abre só o arquivo local (instantâneo, funciona offline); as escritas
// vão para o arquivo local e o db.sync() empurra para o Turso e puxa mudanças.
// A migração one-shot lê o .db legado com new_local e escreve via conn.

use base64::Engine;
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct DbState {
    db: Arc<Mutex<Option<libsql::Database>>>,
    conn: Arc<Mutex<Option<libsql::Connection>>>,
}

/// Sync best-effort com teto de tempo, para rodar antes de fechar o app sem
/// travar o fechamento quando offline. Empurra as escritas locais pendentes
/// para o Turso. Silencioso: se falhar (sem rede), o app fecha mesmo assim e a
/// réplica local mantém o estado para o próximo boot/sync.
pub async fn sync_blocking(state: &DbState, timeout_secs: u64) {
    let guard = state.db.lock().await;
    if let Some(db) = guard.as_ref() {
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

/// Abre o banco local com capacidade de sync ao Turso. build() não faz rede
/// (não setamos sync_interval), então a abertura é instantânea e funciona
/// offline. O sync inicial roda em background.
#[tauri::command]
pub async fn db_init(
    state: State<'_, DbState>,
    replica_path: String,
    turso_url: String,
    turso_token: String,
) -> Result<(), String> {
    let db = libsql::Builder::new_synced_database(replica_path, turso_url, turso_token)
        .build()
        .await
        .map_err(|e| e.to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;
    conn.execute("PRAGMA foreign_keys = ON;", ())
        .await
        .map_err(|e| e.to_string())?;
    *state.db.lock().await = Some(db);
    *state.conn.lock().await = Some(conn);

    // Sync inicial em background — não bloqueia a abertura. Erros (offline)
    // são silenciosos; a próxima chamada a db_sync tenta de novo.
    let db_arc = Arc::clone(&state.db);
    tokio::spawn(async move {
        if let Some(db) = db_arc.lock().await.as_ref() {
            let _ = db.sync().await;
        }
    });
    Ok(())
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
#[tauri::command]
pub async fn db_sync(state: State<'_, DbState>) -> Result<(), String> {
    let guard = state.db.lock().await;
    let db = guard.as_ref().ok_or("banco não inicializado")?;
    db.sync().await.map_err(|e| e.to_string())?;
    Ok(())
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
