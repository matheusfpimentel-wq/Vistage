// Banco de dados LOCAL via libsql (um arquivo na máquina, sem nuvem). A réplica
// embarcada roda aqui no Rust (não funciona no JS do webview). Os comandos
// `db_*` expõem a mesma interface (`select`/`execute`) que o frontend usa.

mod audio;
mod db;
mod gcal;
mod gdrive;

use db::DbState;
use gcal::GcalState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        // Lifecycle das janelas: ao fechar a PRINCIPAL, fecha também a mini-janela
        // de foco ("work-session") — senão ela fica órfã na tela e o encerramento
        // desordenado derruba o app com erro. Fechar só a auxiliar NÃO encerra o
        // app: a principal continua aberta (o Tauri só sai quando a última fecha).
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    for (label, w) in window.app_handle().webview_windows() {
                        if label.as_str() != "main" {
                            let _ = w.close();
                        }
                    }
                }
            }
        })
        .manage(DbState::default())
        .manage(GcalState::default())
        .invoke_handler(tauri::generate_handler![
            db::db_init,
            db::db_select,
            db::db_execute,
            db::db_execute_batch,
            gcal::gcal_start_oauth,
            gcal::gcal_wait_callback,
            gcal::gcal_exchange_code,
            gcal::gcal_refresh_token,
            gcal::gcal_list_calendars,
            gcal::gcal_create_event,
            gcal::gcal_update_event,
            gcal::gcal_delete_event,
            gcal::gcal_list_events,
            gdrive::gdrive_ensure_folder,
            gdrive::gdrive_upload,
            gdrive::gdrive_download,
            gdrive::gdrive_delete,
            gdrive::gdrive_list_folder,
            gdrive::gdrive_file_meta,
            audio::audio_scan_folder,
            audio::audio_read_tags,
            audio::audio_write_tags,
            audio::audio_paths_exist,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação Tauri");
}
