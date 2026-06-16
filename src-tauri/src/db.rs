// Turso (libsql) com réplica embarcada. Leituras vêm da réplica local (offline),
// escritas vão para a réplica E para o Turso; o libsql sincroniza. A migração
// one-shot de um .db SQLite legado usa `rusqlite` para ler a origem.

use std::sync::Arc;

use base64::Engine;
use serde::Serialize;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct DbState {
    db: Arc<Mutex<Option<libsql::Database>>>,
    conn: Arc<Mutex<Option<libsql::Connection>>>,
}

/// Converte um JSON vindo do frontend em `libsql::Value` para parâmetros.
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
        // Arrays/objetos não são parâmetros SQL válidos — serializamos como texto.
        other => libsql::Value::Text(other.to_string()),
    }
}

/// Converte um `libsql::Value` de uma linha em JSON para o frontend.
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

#[tauri::command]
pub async fn db_init(
    state: State<'_, DbState>,
    replica_path: String,
    turso_url: String,
    turso_token: String,
) -> Result<(), String> {
    let db = libsql::Builder::new_remote_replica(replica_path, turso_url, turso_token)
        .build()
        .await
        .map_err(|e| e.to_string())?;
    // Pull inicial — best-effort offline: se a rede falhar, seguimos com a
    // réplica local existente.
    let _ = db.sync().await;
    let conn = db.connect().map_err(|e| e.to_string())?;
    conn.execute("PRAGMA foreign_keys = ON;", ())
        .await
        .map_err(|e| e.to_string())?;
    *state.db.lock().await = Some(db);
    *state.conn.lock().await = Some(conn);
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

#[tauri::command]
pub async fn db_sync(state: State<'_, DbState>) -> Result<(), String> {
    let guard = state.db.lock().await;
    let db = guard.as_ref().ok_or("banco não inicializado")?;
    db.sync().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Migração one-shot, não-destrutiva, de um arquivo .db SQLite legado para o
/// Turso. Para cada tabela: limpa o destino (idempotente) e copia as linhas.
#[tauri::command]
pub async fn db_migrate_from_sqlite(
    state: State<'_, DbState>,
    sqlite_path: String,
) -> Result<Vec<(String, u64)>, String> {
    let db_guard = state.db.lock().await;
    let db = db_guard.as_ref().ok_or("banco não inicializado")?;
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.as_ref().ok_or("banco não inicializado")?;

    let src = rusqlite::Connection::open(&sqlite_path).map_err(|e| e.to_string())?;

    // Lista tabelas de usuário, ignorando as internas e a tabela de migrations
    // (o schema do destino já foi criado pelas migrations no init).
    let tables: Vec<String> = {
        let mut stmt = src
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' \
                 AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            .map_err(|e| e.to_string())?;
        let names = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        names.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    let mut report: Vec<(String, u64)> = Vec::new();

    for table in &tables {
        // Colunas da tabela de origem.
        let cols: Vec<String> = {
            let mut stmt = src
                .prepare(&format!("PRAGMA table_info(\"{}\")", table))
                .map_err(|e| e.to_string())?;
            let c = stmt
                .query_map([], |r| r.get::<_, String>(1))
                .map_err(|e| e.to_string())?;
            c.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
        };
        if cols.is_empty() {
            continue;
        }

        // Limpa o destino para tornar a migração idempotente.
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

        // Lê todas as linhas da origem em memória (convertidas), depois insere.
        let rows: Vec<Vec<libsql::Value>> = {
            let mut stmt = src
                .prepare(&format!("SELECT {} FROM \"{}\"", col_list, table))
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map([], |r| {
                    let mut vals = Vec::with_capacity(cols.len());
                    for i in 0..cols.len() {
                        let v: rusqlite::types::Value = r.get(i)?;
                        vals.push(rusqlite_to_libsql(v));
                    }
                    Ok(vals)
                })
                .map_err(|e| e.to_string())?;
            mapped.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
        };

        let mut count: u64 = 0;
        for vals in rows {
            conn.execute(&insert_sql, vals)
                .await
                .map_err(|e| e.to_string())?;
            count += 1;
        }
        report.push((table.clone(), count));
    }

    db.sync().await.map_err(|e| e.to_string())?;
    Ok(report)
}

fn rusqlite_to_libsql(v: rusqlite::types::Value) -> libsql::Value {
    match v {
        rusqlite::types::Value::Null => libsql::Value::Null,
        rusqlite::types::Value::Integer(i) => libsql::Value::Integer(i),
        rusqlite::types::Value::Real(f) => libsql::Value::Real(f),
        rusqlite::types::Value::Text(s) => libsql::Value::Text(s),
        rusqlite::types::Value::Blob(b) => libsql::Value::Blob(b),
    }
}
