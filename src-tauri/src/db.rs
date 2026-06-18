// Banco de dados LOCAL (libsql), acessado pelo frontend via comandos Tauri.
// É só um arquivo SQLite/libsql na máquina — sem nuvem. O "documento" .vistage
// é exportado/importado por cima deste banco local pelo próprio frontend.
// Os comandos `db_*` expõem a mesma interface (`select`/`execute`) que o
// frontend já usava.

use base64::Engine;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct DbState {
    // Mantém o Database vivo enquanto a Connection existir — o handle do arquivo
    // local fica preso a ele. Não é lido diretamente após a abertura.
    #[allow(dead_code)]
    db: Arc<Mutex<Option<Arc<libsql::Database>>>>,
    conn: Arc<Mutex<Option<libsql::Connection>>>,
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

/// Abre (ou cria) o banco LOCAL no caminho informado e liga as foreign keys.
/// Reabrir fecha a conexão anterior antes (evita dois handles no mesmo arquivo).
#[tauri::command]
pub async fn db_init(state: State<'_, DbState>, replica_path: String) -> Result<(), String> {
    // Fecha o que estiver aberto (ex.: reconectar / trocar de banco).
    {
        *state.conn.lock().await = None;
        *state.db.lock().await = None;
    }

    let db = libsql::Builder::new_local(&replica_path)
        .build()
        .await
        .map_err(|e| e.to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;
    conn.execute("PRAGMA foreign_keys = ON;", ())
        .await
        .map_err(|e| e.to_string())?;

    *state.db.lock().await = Some(Arc::new(db));
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

/// Um statement de um lote transacional: SQL + params opcionais.
#[derive(serde::Deserialize)]
pub struct BatchStatement {
    sql: String,
    #[serde(default)]
    params: Vec<serde_json::Value>,
}

/// Executa vários statements numa ÚNICA transação (BEGIN/COMMIT). Se qualquer
/// um falhar, faz ROLLBACK e devolve o erro — nada fica gravado pela metade.
/// Usado em migrations e restore, onde estado parcial corromperia o banco.
#[tauri::command]
pub async fn db_execute_batch(
    state: State<'_, DbState>,
    statements: Vec<BatchStatement>,
) -> Result<u64, String> {
    let guard = state.conn.lock().await;
    let conn = guard.as_ref().ok_or("banco não inicializado")?;

    conn.execute("BEGIN", ()).await.map_err(|e| e.to_string())?;

    let mut affected: u64 = 0;
    for st in &statements {
        match conn.execute(&st.sql, params_from(&st.params)).await {
            Ok(n) => affected += n,
            Err(e) => {
                // desfaz tudo: o banco volta ao estado anterior ao lote
                let _ = conn.execute("ROLLBACK", ()).await;
                return Err(e.to_string());
            }
        }
    }

    if let Err(e) = conn.execute("COMMIT", ()).await {
        let _ = conn.execute("ROLLBACK", ()).await;
        return Err(e.to_string());
    }
    Ok(affected)
}
