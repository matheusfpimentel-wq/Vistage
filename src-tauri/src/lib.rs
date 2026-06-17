// O caminho do banco SQLite é escolhido pelo usuário em runtime (ex: HD externo),
// então as migrations e o load do banco rodam no frontend via `Database.load("sqlite:<path>")`.
// Aqui registramos os plugins e os comandos do módulo Google Calendar.

mod gcal;
mod gdrive;
mod http;

use gcal::GcalState;
use gdrive::GdriveState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .manage(GcalState::default())
        .manage(GdriveState::default())
        .invoke_handler(tauri::generate_handler![
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
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação Tauri");
}
