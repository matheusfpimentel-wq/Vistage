//! Integração com Google Drive — APENAS para mídia (fotos/vídeos/flyers etc.).
//!
//! O OAuth é reaproveitado dos comandos `gcal_*` (mesma app do Google, só muda o
//! escopo pedido — `drive.file`, que dá acesso só aos arquivos que o próprio app
//! cria/abre). Aqui ficam só as chamadas da API do Drive:
//!  - `gdrive_ensure_folder`: acha-ou-cria uma pasta (por nome, sob um pai).
//!  - `gdrive_upload`: sobe um arquivo (multipart) e devolve o id.
//!  - `gdrive_download`: baixa um arquivo pelo id (devolve base64).
//!
//! Bytes trafegam como base64 (JSON-safe) entre o front e o Rust.

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use std::io::Read;

const FOLDER_MIME: &str = "application/vnd.google-apps.folder";

fn url_encode(s: &str) -> String {
    urlencoding::encode(s).into_owned()
}

/// Acha (ou cria) uma pasta pelo nome sob `parent_id` (ou na raiz). Devolve o id.
#[tauri::command]
pub fn gdrive_ensure_folder(
    access_token: String,
    name: String,
    parent_id: Option<String>,
) -> Result<String, String> {
    // Escapa aspas simples pro filtro `q` do Drive.
    let safe_name = name.replace('\'', "\\'");
    let mut q = format!(
        "name = '{safe_name}' and mimeType = '{FOLDER_MIME}' and trashed = false"
    );
    if let Some(ref pid) = parent_id {
        q.push_str(&format!(" and '{}' in parents", pid.replace('\'', "\\'")));
    }
    let list_url = format!(
        "https://www.googleapis.com/drive/v3/files?q={}&fields=files(id,name)&spaces=drive",
        url_encode(&q)
    );
    let resp = ureq::get(&list_url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| format!("Falha ao buscar pasta no Drive: {e}"))?;
    let v: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    if let Some(id) = v
        .get("files")
        .and_then(|f| f.as_array())
        .and_then(|a| a.first())
        .and_then(|f| f.get("id"))
        .and_then(|x| x.as_str())
    {
        return Ok(id.to_string());
    }

    // Não existe → cria.
    let mut meta = serde_json::json!({ "name": name, "mimeType": FOLDER_MIME });
    if let Some(pid) = parent_id {
        meta["parents"] = serde_json::json!([pid]);
    }
    let resp = ureq::post("https://www.googleapis.com/drive/v3/files?fields=id")
        .set("Authorization", &format!("Bearer {access_token}"))
        .send_json(meta)
        .map_err(|e| format!("Falha ao criar pasta no Drive: {e}"))?;
    let v: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    v.get("id")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Resposta sem id ao criar pasta".to_string())
}

/// Sobe um arquivo (conteúdo em base64) para `parent_id`. Devolve o id no Drive.
#[tauri::command]
pub fn gdrive_upload(
    access_token: String,
    parent_id: String,
    name: String,
    content_b64: String,
    mime: String,
) -> Result<String, String> {
    let content = STANDARD
        .decode(content_b64.as_bytes())
        .map_err(|e| format!("base64 inválido: {e}"))?;

    let boundary = "vistage_drive_boundary_7f3a91";
    let meta = serde_json::json!({
        "name": name,
        "mimeType": mime,
        "parents": [parent_id],
    });

    let mut body: Vec<u8> = Vec::with_capacity(content.len() + 512);
    body.extend_from_slice(
        format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(meta.to_string().as_bytes());
    body.extend_from_slice(format!("\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n").as_bytes());
    body.extend_from_slice(&content);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    let resp = ureq::post(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    )
    .set("Authorization", &format!("Bearer {access_token}"))
    .set("Content-Type", &format!("multipart/related; boundary={boundary}"))
    .send_bytes(&body)
    .map_err(|e| format!("Falha ao subir arquivo no Drive: {e}"))?;
    let v: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    v.get("id")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Resposta sem id ao subir arquivo".to_string())
}

/// Baixa um arquivo do Drive pelo id. Devolve o conteúdo em base64.
#[tauri::command]
pub fn gdrive_download(access_token: String, file_id: String) -> Result<String, String> {
    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{}?alt=media",
        url_encode(&file_id)
    );
    let resp = ureq::get(&url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| format!("Falha ao baixar arquivo do Drive: {e}"))?;
    let mut buf: Vec<u8> = Vec::new();
    resp.into_reader()
        .read_to_end(&mut buf)
        .map_err(|e| format!("Falha ao ler arquivo do Drive: {e}"))?;
    Ok(STANDARD.encode(&buf))
}
