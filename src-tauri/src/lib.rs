// O caminho do banco SQLite é escolhido pelo usuário em runtime (ex: HD externo),
// então as migrations e o load do banco rodam no frontend via `Database.load("sqlite:<path>")`.
// Aqui registramos os plugins e os comandos do módulo Google Calendar.

mod gcal;
mod gdrive;

use gcal::GcalState;
use gdrive::GdriveState;

/// Garante que o arquivo do banco NÃO esteja em modo WAL antes do tauri-plugin-sql
/// abri-lo. Bancos em WAL exigem criar e mapear (mmap) o arquivo auxiliar "-shm" na
/// mesma pasta; em pastas sincronizadas (Google Drive, OneDrive — inclusive a pasta
/// Documentos redirecionada do Windows) esse mmap falha e o open quebra com
/// SQLITE_CANTOPEN (code 14, "unable to open database file").
///
/// Abrimos aqui com locking_mode=EXCLUSIVE, que faz o SQLite manter o índice do WAL
/// em memória (heap) em vez do "-shm" — então a conversão para journal DELETE roda
/// sem nenhum arquivo auxiliar. Depois de fechar, o arquivo fica em journal rollback
/// e o plugin consegue abrir normalmente. Também cria o banco (em DELETE) se faltar.
#[tauri::command]
async fn prepare_database(path: String) -> Result<(), String> {
    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteLockingMode};
    use sqlx::{ConnectOptions, Connection};

    let opts = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true)
        // ordem importa: o sqlx aplica locking_mode antes de journal_mode, então o
        // índice do WAL já nasce em heap quando a conversão para DELETE acontece.
        .locking_mode(SqliteLockingMode::Exclusive)
        .journal_mode(SqliteJournalMode::Delete);

    let conn = opts.connect().await.map_err(|e| e.to_string())?;
    conn.close().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // O banco costuma ficar numa pasta sincronizada (Google Drive/OneDrive). Quando
    // o tauri-plugin-sql não acha o arquivo (placeholder de nuvem ainda não baixado,
    // ou path novo), ele chama Sqlite::create_database, que por padrão do sqlx cria
    // o banco em modo WAL (CREATE_DB_WAL = true). O WAL exige criar/mmap os arquivos
    // "-wal"/"-shm" na mesma pasta — o cliente do Drive bloqueia isso e o open falha
    // com SQLITE_CANTOPEN (code 14, "unable to open database file"). Desligar aqui
    // faz o banco ser criado/aberto em journal rollback (DELETE), sem sidecars.
    sqlx::sqlite::CREATE_DB_WAL.store(false, std::sync::atomic::Ordering::Release);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .manage(GcalState::default())
        .manage(GdriveState::default())
        .invoke_handler(tauri::generate_handler![
            prepare_database,
            gcal::gcal_start_oauth,
            gcal::gcal_wait_callback,
            gcal::gcal_exchange_code,
            gcal::gcal_refresh_token,
            gcal::gcal_list_calendars,
            gcal::gcal_create_event,
            gcal::gcal_update_event,
            gcal::gcal_delete_event,
            gcal::gcal_list_events,
            gdrive::gdrive_start_oauth,
            gdrive::gdrive_wait_callback,
            gdrive::gdrive_exchange_code,
            gdrive::gdrive_refresh_token,
            gdrive::gdrive_ensure_folder,
            gdrive::gdrive_upload_backup,
            gdrive::gdrive_list_backups,
            gdrive::gdrive_download_backup,
            gdrive::gdrive_delete_backup,
            gdrive::gdrive_upload_media,
            gdrive::gdrive_download_media,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação Tauri");
}
