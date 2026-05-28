//! Integração com Google Calendar via OAuth 2.0 (Installed Apps com PKCE).
//!
//! Fluxo:
//! 1. Front chama `gcal_start_oauth` que gera verifier/state, sobe um servidor
//!    loopback em porta aleatória e retorna a URL de autorização + porta.
//! 2. Front abre essa URL no navegador padrão (via tauri-plugin-shell).
//! 3. Após o usuário consentir, o Google redireciona para 127.0.0.1:PORT/?code=...
//! 4. Front chama `gcal_wait_callback`, que recebe o code, fecha o servidor
//!    e responde a janela do navegador com um HTML de sucesso.
//! 5. Front chama `gcal_exchange_code` para trocar o code por access+refresh token.
//! 6. As demais funções (`gcal_list_calendars`, `gcal_upsert_event`, etc.) usam o
//!    access_token diretamente.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tiny_http::{Header, Response, Server};

const OAUTH_SUCCESS_HTML: &str = include_str!("oauth_success.html");

// ============================================================
// Estado global: servidores HTTP loopback rodando
// ============================================================

#[derive(Default)]
pub struct GcalState(Mutex<HashMap<u16, ActiveOauth>>);

struct ActiveOauth {
    server: Server,
    /// Mantido por completude; o verifier real fica em memória do front.
    #[allow(dead_code)]
    verifier: String,
    state: String,
}

// ============================================================
// Tipos retornados ao front
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StartOauthResult {
    pub auth_url: String,
    pub port: u16,
    pub state: String,
    /// O front guarda o verifier no estado da app e devolve em `exchange_code`.
    pub verifier: String,
    pub redirect_uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OauthCallback {
    pub code: String,
    pub state: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GcalTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// Segundos a partir de "agora".
    pub expires_in: i64,
    pub scope: Option<String>,
    pub token_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CalendarListItem {
    pub id: String,
    pub summary: String,
    pub primary: bool,
    pub access_role: Option<String>,
    pub time_zone: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GcalEvent {
    pub id: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    /// "YYYY-MM-DD" se for evento de dia inteiro, ou "YYYY-MM-DDTHH:MM:SS" se com hora.
    pub start: Option<String>,
    pub end: Option<String>,
    pub status: Option<String>,
    pub updated: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventInput {
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    /// "YYYY-MM-DD" (all day) ou "YYYY-MM-DDTHH:MM:SS" (com hora).
    pub start: String,
    pub end: String,
    pub time_zone: Option<String>,
    pub status: Option<String>,
}

// ============================================================
// Helpers
// ============================================================

fn random_base64(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(&buf)
}

fn pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn url_encode(s: &str) -> String {
    urlencoding::encode(s).into_owned()
}

fn parse_query(url: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Some((_, qs)) = url.split_once('?') else {
        return map;
    };
    for pair in qs.split('&') {
        let Some((k, v)) = pair.split_once('=') else {
            continue;
        };
        let v_dec = urlencoding::decode(v).unwrap_or(v.into()).to_string();
        map.insert(k.to_string(), v_dec);
    }
    map
}

// ============================================================
// Commands — OAuth
// ============================================================

#[tauri::command]
pub fn gcal_start_oauth(
    client_id: String,
    scopes: Vec<String>,
    state_store: tauri::State<'_, GcalState>,
) -> Result<StartOauthResult, String> {
    let server =
        Server::http("127.0.0.1:0").map_err(|e| format!("Falha ao subir servidor local: {e}"))?;
    let port = match server.server_addr() {
        tiny_http::ListenAddr::IP(addr) => addr.port(),
        _ => return Err("Servidor local sem porta IP".to_string()),
    };

    let verifier = random_base64(64);
    let challenge = pkce_challenge(&verifier);
    let state_token = random_base64(24);
    let redirect_uri = format!("http://127.0.0.1:{port}/");
    let scope_str = scopes.join(" ");

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth\
?response_type=code\
&client_id={cid}\
&redirect_uri={ru}\
&scope={scope}\
&state={state}\
&code_challenge={chal}\
&code_challenge_method=S256\
&access_type=offline\
&prompt=consent",
        cid = url_encode(&client_id),
        ru = url_encode(&redirect_uri),
        scope = url_encode(&scope_str),
        state = url_encode(&state_token),
        chal = url_encode(&challenge),
    );

    state_store
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(
            port,
            ActiveOauth {
                server,
                verifier: verifier.clone(),
                state: state_token.clone(),
            },
        );

    Ok(StartOauthResult {
        auth_url,
        port,
        state: state_token,
        verifier,
        redirect_uri,
    })
}

#[tauri::command]
pub fn gcal_wait_callback(
    port: u16,
    timeout_secs: u64,
    state_store: tauri::State<'_, GcalState>,
) -> Result<OauthCallback, String> {
    let active = {
        let mut map = state_store.0.lock().map_err(|e| e.to_string())?;
        map.remove(&port)
            .ok_or_else(|| format!("Nenhuma sessão OAuth ativa na porta {port}"))?
    };

    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let req_opt = active
            .server
            .recv_timeout(remaining)
            .map_err(|e| format!("Erro no servidor local: {e}"))?;
        let Some(request) = req_opt else { continue };

        let url = request.url().to_string();
        let params = parse_query(&url);
        let resp_html = OAUTH_SUCCESS_HTML;
        let header = Header::from_bytes(
            &b"Content-Type"[..],
            &b"text/html; charset=utf-8"[..],
        )
        .unwrap();
        let _ = request.respond(Response::from_string(resp_html).with_header(header));

        if let Some(err) = params.get("error") {
            return Err(format!("Google retornou erro: {err}"));
        }
        let (Some(code), Some(state)) = (params.get("code"), params.get("state")) else {
            return Err("Callback sem code/state".to_string());
        };
        if state != &active.state {
            return Err("State inválido — possível ataque CSRF".to_string());
        }

        return Ok(OauthCallback {
            code: code.clone(),
            state: state.clone(),
        });
    }

    Err("Tempo esgotado aguardando autorização".to_string())
}

#[tauri::command]
pub fn gcal_exchange_code(
    client_id: String,
    client_secret: String,
    code: String,
    verifier: String,
    redirect_uri: String,
) -> Result<GcalTokens, String> {
    let body = format!(
        "code={code}&client_id={cid}&client_secret={cs}&redirect_uri={ru}&grant_type=authorization_code&code_verifier={cv}",
        code = url_encode(&code),
        cid = url_encode(&client_id),
        cs = url_encode(&client_secret),
        ru = url_encode(&redirect_uri),
        cv = url_encode(&verifier),
    );
    let resp = ureq::post("https://oauth2.googleapis.com/token")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send_string(&body)
        .map_err(|e| format!("Falha no token exchange: {e}"))?;
    let tokens: GcalTokens = resp
        .into_json()
        .map_err(|e| format!("Resposta de token inválida: {e}"))?;
    Ok(tokens)
}

#[tauri::command]
pub fn gcal_refresh_token(
    client_id: String,
    client_secret: String,
    refresh_token: String,
) -> Result<GcalTokens, String> {
    let body = format!(
        "client_id={cid}&client_secret={cs}&refresh_token={rt}&grant_type=refresh_token",
        cid = url_encode(&client_id),
        cs = url_encode(&client_secret),
        rt = url_encode(&refresh_token),
    );
    let resp = ureq::post("https://oauth2.googleapis.com/token")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send_string(&body)
        .map_err(|e| format!("Falha no refresh: {e}"))?;
    let mut tokens: GcalTokens = resp
        .into_json()
        .map_err(|e| format!("Resposta de refresh inválida: {e}"))?;
    if tokens.refresh_token.is_none() {
        tokens.refresh_token = Some(refresh_token);
    }
    Ok(tokens)
}

// ============================================================
// Commands — Calendar API
// ============================================================

#[tauri::command]
pub fn gcal_list_calendars(access_token: String) -> Result<Vec<CalendarListItem>, String> {
    let resp = ureq::get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| format!("Falha ao listar calendários: {e}"))?;
    let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    let items = json
        .get("items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for it in items {
        out.push(CalendarListItem {
            id: it.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            summary: it
                .get("summary")
                .and_then(|v| v.as_str())
                .unwrap_or("(sem nome)")
                .to_string(),
            primary: it
                .get("primary")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            access_role: it
                .get("accessRole")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            time_zone: it
                .get("timeZone")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        });
    }
    Ok(out)
}

fn build_event_json(input: &EventInput) -> serde_json::Value {
    let is_all_day_start = !input.start.contains('T');
    let is_all_day_end = !input.end.contains('T');
    let tz = input
        .time_zone
        .clone()
        .unwrap_or_else(|| "America/Sao_Paulo".to_string());

    let start_obj = if is_all_day_start {
        serde_json::json!({ "date": input.start })
    } else {
        serde_json::json!({ "dateTime": input.start, "timeZone": tz })
    };
    let end_obj = if is_all_day_end {
        serde_json::json!({ "date": input.end })
    } else {
        serde_json::json!({ "dateTime": input.end, "timeZone": tz })
    };

    let mut body = serde_json::json!({
        "summary": input.summary,
        "start": start_obj,
        "end": end_obj,
    });
    if let Some(d) = &input.description {
        body["description"] = serde_json::Value::String(d.clone());
    }
    if let Some(l) = &input.location {
        body["location"] = serde_json::Value::String(l.clone());
    }
    if let Some(s) = &input.status {
        body["status"] = serde_json::Value::String(s.clone());
    }
    body
}

#[tauri::command]
pub fn gcal_create_event(
    access_token: String,
    calendar_id: String,
    event: EventInput,
) -> Result<String, String> {
    let body = build_event_json(&event);
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events",
        url_encode(&calendar_id)
    );
    let resp = ureq::post(&url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .send_json(body)
        .map_err(|e| format!("Falha ao criar evento: {e}"))?;
    let v: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    let id = v
        .get("id")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "Resposta sem id".to_string())?
        .to_string();
    Ok(id)
}

#[tauri::command]
pub fn gcal_update_event(
    access_token: String,
    calendar_id: String,
    event_id: String,
    event: EventInput,
) -> Result<(), String> {
    let body = build_event_json(&event);
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events/{}",
        url_encode(&calendar_id),
        url_encode(&event_id),
    );
    ureq::request("PATCH", &url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .send_json(body)
        .map_err(|e| format!("Falha ao atualizar evento: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn gcal_delete_event(
    access_token: String,
    calendar_id: String,
    event_id: String,
) -> Result<(), String> {
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events/{}",
        url_encode(&calendar_id),
        url_encode(&event_id),
    );
    // a Calendar API responde 204 No Content em delete. ureq::delete não existe — usar request("DELETE", ...).
    ureq::request("DELETE", &url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| format!("Falha ao deletar evento: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn gcal_list_events(
    access_token: String,
    calendar_id: String,
    updated_min: Option<String>,
) -> Result<Vec<GcalEvent>, String> {
    let mut url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events?singleEvents=true&maxResults=2500",
        url_encode(&calendar_id),
    );
    if let Some(ts) = updated_min {
        url.push_str("&updatedMin=");
        url.push_str(&url_encode(&ts));
    }

    let resp = ureq::get(&url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| format!("Falha ao listar eventos: {e}"))?;
    let v: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    let items = v
        .get("items")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for it in items {
        let extract = |k: &str| {
            it.get(k)
                .and_then(|x| x.get("dateTime").or_else(|| x.get("date")))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
        };
        out.push(GcalEvent {
            id: it
                .get("id")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            summary: it
                .get("summary")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            description: it
                .get("description")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            location: it
                .get("location")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            start: extract("start"),
            end: extract("end"),
            status: it
                .get("status")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            updated: it
                .get("updated")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
        });
    }
    Ok(out)
}
