// Biblioteca de Músicas — leitura/gravação de tags ID3/MP4/FLAC/Vorbis/AIFF via
// `lofty` e varredura recursiva via `walkdir`. Os bytes do áudio NUNCA saem
// daqui pro app (nem pro .vistage): só metadados em texto + duração.

// lofty 0.18: os traits ficam na raiz do crate (não há `prelude`) e
// save_to_path(path) não recebe WriteOptions (isso é 0.19+).
use lofty::{read_from_path, Accessor, AudioFile, ItemKey, Tag, TagExt, TaggedFileExt};
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

const AUDIO_EXTS: &[&str] = &["mp3", "m4a", "aac", "flac", "wav", "aiff", "aif", "ogg"];

#[derive(Serialize)]
pub struct ScannedTrack {
    path: String,
    title: Option<String>,
    artist: Option<String>,
    genre: Option<String>,
    bpm: Option<String>,
    key: Option<String>,
    comments: Option<String>,
    duration_sec: Option<u64>,
}

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn read_one(path: &Path) -> Option<ScannedTrack> {
    let tf = read_from_path(path).ok()?;
    let duration = tf.properties().duration().as_secs();
    let tag = tf.primary_tag().or_else(|| tf.first_tag());
    let get = |k: &ItemKey| -> Option<String> {
        tag.and_then(|t| t.get_string(k)).map(|s| s.to_string())
    };
    Some(ScannedTrack {
        path: path.to_string_lossy().to_string(),
        title: tag.and_then(|t| t.title()).map(|c| c.to_string()),
        artist: tag.and_then(|t| t.artist()).map(|c| c.to_string()),
        genre: tag.and_then(|t| t.genre()).map(|c| c.to_string()),
        // BPM pode estar como inteiro (TBPM) — tenta os dois ItemKey.
        bpm: get(&ItemKey::IntegerBpm).or_else(|| get(&ItemKey::Bpm)),
        key: get(&ItemKey::InitialKey),
        comments: get(&ItemKey::Comment),
        duration_sec: Some(duration),
    })
}

/// Varre uma pasta (recursiva se include_subdirs) e lê tags + duração de cada
/// arquivo de áudio. Arquivos ilegíveis são pulados em silêncio.
///
/// Roda numa thread de bloqueio (`spawn_blocking`): numa biblioteca grande, a
/// varredura + leitura de tags pode levar segundos/minutos — fora da thread
/// principal/event-loop, a janela NÃO trava (era o motivo do app "travar" ao
/// carregar grandes quantidades).
#[tauri::command]
pub async fn audio_scan_folder(
    path: String,
    include_subdirs: bool,
) -> Result<Vec<ScannedTrack>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_folder_blocking(&path, include_subdirs))
        .await
        .map_err(|e| format!("Falha na varredura: {e}"))?
}

fn scan_folder_blocking(path: &str, include_subdirs: bool) -> Result<Vec<ScannedTrack>, String> {
    let root = Path::new(path);
    if !root.is_dir() {
        return Err("Pasta inválida".into());
    }
    let max_depth = if include_subdirs { usize::MAX } else { 1 };
    let mut out = Vec::new();
    for entry in WalkDir::new(root)
        .max_depth(max_depth)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let p = entry.path();
        if p.is_file() && is_audio(p) {
            if let Some(t) = read_one(p) {
                out.push(t);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn audio_read_tags(path: String) -> Result<ScannedTrack, String> {
    read_one(Path::new(&path)).ok_or_else(|| "Não consegui ler as tags".into())
}

#[derive(Deserialize)]
pub struct TagFields {
    title: Option<String>,
    artist: Option<String>,
    genre: Option<String>,
    bpm: Option<String>,
    key: Option<String>,
    comments: Option<String>,
}

/// Grava nos arquivos SÓ os campos presentes (Some). String vazia = limpar o
/// campo. Após gravar, RELÊ o arquivo e devolve os valores efetivos (verificação).
#[tauri::command]
pub fn audio_write_tags(path: String, fields: TagFields) -> Result<ScannedTrack, String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err("Arquivo ausente".into());
    }
    let tf = read_from_path(p).map_err(|e| format!("Falha ao abrir: {e}"))?;
    let tag_type = tf.primary_tag_type();
    // Parte do que já existe (preserva os campos não tocados) ou cria uma tag nova.
    let mut tag: Tag = tf.primary_tag().cloned().unwrap_or_else(|| Tag::new(tag_type));

    if let Some(v) = &fields.title {
        if v.is_empty() { tag.remove_title(); } else { tag.set_title(v.clone()); }
    }
    if let Some(v) = &fields.artist {
        if v.is_empty() { tag.remove_artist(); } else { tag.set_artist(v.clone()); }
    }
    if let Some(v) = &fields.genre {
        if v.is_empty() { tag.remove_genre(); } else { tag.set_genre(v.clone()); }
    }
    // Bloco próprio: o empréstimo mutável da closure precisa ser solto antes do
    // save_to_path (que também empresta a tag).
    {
        let mut set_text = |key: ItemKey, v: &Option<String>| {
            if let Some(s) = v {
                if s.is_empty() {
                    tag.remove_key(&key);
                } else {
                    tag.insert_text(key, s.clone());
                }
            }
        };
        set_text(ItemKey::IntegerBpm, &fields.bpm);
        set_text(ItemKey::InitialKey, &fields.key);
        set_text(ItemKey::Comment, &fields.comments);
    }

    tag.save_to_path(p).map_err(|e| format!("Falha ao gravar: {e}"))?;

    read_one(p).ok_or_else(|| "Gravou, mas não consegui reler para verificar".into())
}

/// Existência em lote → alimenta file_missing na grade. Em thread de bloqueio:
/// statar milhares de caminhos (rede/HD lento) não trava a janela.
#[tauri::command]
pub async fn audio_paths_exist(paths: Vec<String>) -> Vec<bool> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|p| Path::new(p).is_file())
            .collect::<Vec<bool>>()
    })
    .await
    .unwrap_or_default()
}
