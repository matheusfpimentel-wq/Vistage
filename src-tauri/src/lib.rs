// Banco de dados LOCAL via libsql (um arquivo na máquina, sem nuvem). A réplica
// embarcada roda aqui no Rust (não funciona no JS do webview). Os comandos
// `db_*` expõem a mesma interface (`select`/`execute`) que o frontend usa.

mod db;
mod gcal;

use db::DbState;
use gcal::GcalState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação Tauri");
}
