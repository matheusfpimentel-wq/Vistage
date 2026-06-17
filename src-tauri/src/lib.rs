// Banco de dados via Turso (libsql) com réplica embarcada. As leituras vêm
// sempre da réplica local (funciona offline) e as escritas vão para a réplica
// E para o Turso, que sincroniza. A réplica embarcada roda aqui no Rust (não
// funciona no JS do webview). Os comandos `db_*` expõem a mesma interface que o
// frontend usava com o tauri-plugin-sql (`select`/`execute`).

mod db;
mod gcal;
mod gdrive;

use db::DbState;
use gcal::GcalState;
use gdrive::GdriveState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(DbState::default())
        .manage(GcalState::default())
        .manage(GdriveState::default())
        // Ao fechar a janela principal, empurra as escritas pendentes para o
        // Turso ANTES de destruir a janela. Sem isso, mudanças feitas nos
        // últimos segundos (dentro da janela de throttle do sync) ficariam só
        // na réplica local e nunca chegariam às outras máquinas. Usa timeout
        // para não travar o fechamento quando estiver offline.
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let win = window.clone();
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = app.state::<DbState>();
                    db::sync_blocking(&state, 6).await;
                    let _ = win.destroy();
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            db::db_init,
            db::db_select,
            db::db_execute,
            db::db_sync,
            db::db_migrate_from_sqlite,
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
            gdrive::gdrive_upload_media,
            gdrive::gdrive_download_media,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação Tauri");
}
