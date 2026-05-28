// O caminho do banco SQLite é escolhido pelo usuário em runtime (ex: HD externo),
// então as migrations e o load do banco rodam no frontend via `Database.load("sqlite:<path>")`.
// Aqui registramos os plugins e os comandos do módulo Google Calendar.

mod gcal;

use gcal::GcalState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .manage(GcalState::default())
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
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação Tauri");
}
