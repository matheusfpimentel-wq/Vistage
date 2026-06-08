//! Integração com Google Drive via OAuth 2.0 (Installed Apps com PKCE).
//!
//! Fluxo idêntico ao gcal.rs, mas com scope drive.file (acessa só
//! arquivos criados por este app). Os backups ficam numa pasta
//! "MusicGest Backups" no Drive do usuário.

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
const DRIVE_SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL: &str =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FOLDER_MIME: &str = "application/vnd.google-apps.folder";
const FOLDER_NAME: &str = "MusicGest Backups";

// ============================================================
// Estado global: servidores HTTP loopback rodando
// ============================================================

#[derive(Default)]
pub struct GdriveState(Mutex<HashMap<u16, ActiveOauth>>);

struct ActiveOauth {
    server: Server,
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
    pub verifier: String,
    pub redirect_uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OauthCallback {
    pub code: String,
    pub state: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DriveTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub scope: Option<String>,
    pub token_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    pub size: Option<String>,
    pub created_time: Option<String>,
    pub modified_time: Option<String>,
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
pub fn gdrive_start_oauth(
    client_id: String,
    state_store: tauri::State<'_, GdriveState>,
) -> Result<StartOauthResult, String> {
    let server = Server::http("127.0.0.1:0")
        .map_err(|e| format!("Falha ao subir servidor local: {e}"))?;
    let port = match server.server_addr() {
        tiny_http::ListenAddr::IP(addr) => addr.port(),
        _ => return Err("Servidor local sem porta IP".to_string()),
    };

    let verifier = random_base64(64);
    let challenge = pkce_challenge(&verifier);
    let state_token = random_base64(24);
    let redirect_uri = format!("http://127.0.0.1:{port}/");

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
        scope = url_encode(DRIVE_SCOPE),
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
pub fn gdrive_wait_callback(
    port: u16,
    timeout_secs: u64,
    state_store: tauri::State<'_, GdriveState>,
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
        let header = Header::from_bytes(
            &b"Content-Type"[..],
            &b"text/html; charset=utf-8"[..],
        )
        .unwrap();
        let _ = request.respond(Response::from_string(OAUTH_SUCCESS_HTML).with_header(header));

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
pub fn gdrive_exchange_code(
    client_id: String,
    client_secret: String,
    code: String,
    verifier: String,
    redirect_uri: String,
) -> Result<DriveTokens, String> {
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
    let tokens: DriveTokens = resp
        .into_json()
        .map_err(|e| format!("Resposta de token inválida: {e}"))?;
    Ok(tokens)
}

#[tauri::command]
pub fn gdrive_refresh_token(
    client_id: String,
    client_secret: String,
    refresh_token: String,
) -> Result<DriveTokens, String> {
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
    let mut tokens: DriveTokens = resp
        .into_json()
        .map_err(|e| format!("Resposta de refresh inválida: {e}"))?;
    if tokens.refresh_token.is_none() {
        tokens.refresh_token = Some(refresh_token);
    }
    Ok(tokens)
}

// ============================================================
// Commands — Drive API
// ============================================================

/// Busca ou cria a pasta "MusicGest Backups" no Drive. Retorna o folder ID.
#[tauri::command]
pub fn gdrive_ensure_folder(access_token: String, folder_name: String) -> Result<String, String> {
    let q = format!(
        "mimeType='{}' and name='{}' and trashed=false",
        FOLDER_MIME, folder_name
    );
    let url = format!(
        "{}?q={}&fields=files(id,name)",
        DRIVE_FILES_URL,
        url_encode(&q)
    );
    let resp = ureq::get(&url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| format!("Falha ao buscar pasta: {e}"))?;
    let v: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    let files = v
        .get("files")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    if let Some(f) = files.first() {
        if let Some(id) = f.get("id").and_then(|x| x.as_str()) {
            return Ok(id.to_string());
        }
    }

    // Pasta não encontrada — cria
    let meta = serde_json::json!({ "name": folder_name, "mimeType": FOLDER_MIME });
    let resp = ureq::post(DRIVE_FILES_URL)
        .set("Authorization", &format!("Bearer {access_token}"))
        .send_json(meta)
        .map_err(|e| format!("Falha ao criar pasta: {e}"))?;
    let v: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    v.get("id")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Pasta criada sem ID na resposta".to_string())
}

/// Faz upload de um backup JSON para a pasta no Drive.
#[tauri::command]
pub fn gdrive_upload_backup(
    access_token: String,
    folder_id: String,
    file_name: String,
    content: String,
) -> Result<DriveFile, String> {
    let boundary = format!("boundary_{}", random_base64(12));
    let meta = format!(
        r#"{{"name":"{file_name}","parents":["{folder_id}"],"mimeType":"application/json"}}"#
    );

    let mut body: Vec<u8> = Vec::new();
    body.extend_from_slice(
        format!(
            "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n\
             --{boundary}\r\nContent-Type: application/json\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(content.as_bytes());
    body.extend_from_slice(format!("\r\n--{boundary}--").as_bytes());

    let url = format!(
        "{}&fields=id,name,size,createdTime,modifiedTime",
        DRIVE_UPLOAD_URL
    );
    let resp = ureq::post(&url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .set(
            "Content-Type",
            &format!("multipart/related; boundary={boundary}"),
        )
        .send_bytes(&body)
        .map_err(|e| format!("Falha no upload: {e}"))?;

    let v: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    Ok(DriveFile {
        id: v
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        name: v
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or(&file_name)
            .to_string(),
        size: v
            .get("size")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        created_time: v
            .get("createdTime")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        modified_time: v
            .get("modifiedTime")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
    })
}

/// Lista os backups na pasta, ordenados por data de criação (mais recente primeiro).
#[tauri::command]
pub fn gdrive_list_backups(
    access_token: String,
    folder_id: String,
) -> Result<Vec<DriveFile>, String> {
    let q = format!("'{}' in parents and trashed=false", folder_id);
    let url = format!(
        "{}?q={}&fields=files(id,name,size,createdTime,modifiedTime)&orderBy=createdTime+desc&pageSize=20",
        DRIVE_FILES_URL,
        url_encode(&q)
    );
    let resp = ureq::get(&url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| format!("Falha ao listar backups: {e}"))?;
    let v: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    let files = v
        .get("files")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    let out = files
        .iter()
        .map(|f| DriveFile {
            id: f
                .get("id")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            name: f
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            size: f
                .get("size")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            created_time: f
                .get("createdTime")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            modified_time: f
                .get("modifiedTime")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
        })
        .collect();
    Ok(out)
}

/// Baixa o conteúdo de um arquivo do Drive e retorna como string.
#[tauri::command]
pub fn gdrive_download_backup(
    access_token: String,
    file_id: String,
) -> Result<String, String> {
    let url = format!("{}/{}?alt=media", DRIVE_FILES_URL, url_encode(&file_id));
    let resp = ureq::get(&url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| format!("Falha ao baixar backup: {e}"))?;
    resp.into_string()
        .map_err(|e| format!("Falha ao ler conteúdo: {e}"))
}

/// Move um arquivo para a lixeira do Drive.
#[tauri::command]
pub fn gdrive_delete_backup(
    access_token: String,
    file_id: String,
) -> Result<(), String> {
    let url = format!("{}/{}", DRIVE_FILES_URL, url_encode(&file_id));
    ureq::request("DELETE", &url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| format!("Falha ao deletar: {e}"))?;
    Ok(())
}
