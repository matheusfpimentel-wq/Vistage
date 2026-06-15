// O caminho do banco SQLite é escolhido pelo usuário em runtime (ex: HD externo),
// então as migrations e o load do banco rodam no frontend via `Database.load("sqlite:<path>")`.
// Aqui registramos os plugins e os comandos do módulo Google Calendar.

mod gcal;
mod gdrive;

use gcal::GcalState;
use gdrive::GdriveState;

/// Magic header do SQLite (primeiros 16 bytes do arquivo).
const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";

/// Garante que o arquivo do banco esteja em journal rollback (DELETE) antes do
/// tauri-plugin-sql abri-lo, sem precisar abrir o arquivo via SQLite.
///
/// **Por que isso é necessário:** bancos em modo WAL exigem criar e mapear (mmap)
/// o arquivo auxiliar "-shm" na mesma pasta. Em pastas sincronizadas (Google Drive,
/// OneDrive, Dropbox — inclusive a pasta Documentos redirecionada do Windows), esse
/// mmap falha com SQLITE_CANTOPEN (code 14) **no próprio sqlite3_open_v2**, antes
/// de qualquer PRAGMA chegar a ser executado.
///
/// **Como funciona:** o modo de journal é armazenado nos bytes 18-19 do header
/// SQLite (write/read version: 1 = rollback, 2 = WAL). Quando o banco foi fechado
/// corretamente em WAL e não há arquivo "-wal" com dados pendentes, podemos mudar
/// esses bytes diretamente para 1 — o que é exatamente o que `PRAGMA journal_mode=DELETE`
/// faria internamente. Se houver um "-wal" não vazio (crash/shutdown abrupto), a
/// operação é abortada e deixamos o tauri-plugin-sql tentar (e falhar com uma
/// mensagem clara).
///
/// Se o arquivo não existir, criamos via sqlx com journal DELETE para que o sqlx
/// nunca escreva bytes de WAL no header.
#[tauri::command]
async fn prepare_database(path: String) -> Result<(), String> {
    use std::io::{Read, Seek, SeekFrom, Write};

    let p = std::path::Path::new(&path);

    if p.exists() {
        // Verifica se há WAL pendente com dados — se sim, não podemos patchear.
        let wal = format!("{}-wal", path);
        let wal_has_data = std::path::Path::new(&wal).exists()
            && std::fs::metadata(&wal).map(|m| m.len() > 32).unwrap_or(false);

        if !wal_has_data {
            // Tenta patchear o header do arquivo: bytes 18-19 de 2 (WAL) para 1 (rollback).
            if let Ok(mut f) = std::fs::OpenOptions::new().read(true).write(true).open(&path) {
                let mut header = [0u8; 20];
                if f.read_exact(&mut header).is_ok()
                    && &header[0..16] == SQLITE_MAGIC
                    && header[18] == 2
                    && header[19] == 2
                {
                    header[18] = 1;
                    header[19] = 1;
                    let _ = f.seek(SeekFrom::Start(18));
                    let _ = f.write_all(&header[18..20]);
                    let _ = f.flush();
                }
            }
            // Remove o "-shm" obsoleto se houver — ele é recriado limpo pelo SQLite.
            let shm = format!("{}-shm", path);
            if std::path::Path::new(&shm).exists() {
                let _ = std::fs::remove_file(&shm);
            }
        }

        return Ok(());
    }

    // Arquivo não existe → cria em journal rollback para que o sqlx não escreva WAL.
    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
    use sqlx::{ConnectOptions, Connection};

    let opts = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true)
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
