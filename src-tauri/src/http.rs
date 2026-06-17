use std::sync::OnceLock;
use std::time::Duration;

/// Agente HTTP compartilhado, com timeouts de conexão e de leitura.
///
/// Sem isso, uma conexão pendurada (rede ruim, proxy, servidor lento) trava o
/// `#[tauri::command]` indefinidamente e o front fica com botões em estado de
/// "carregando" para sempre. Reaproveitar um único agente também mantém o pool
/// de conexões entre chamadas.
pub fn agent() -> &'static ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .build()
    })
}
