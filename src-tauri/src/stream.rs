use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};
use tokio_rustls::TlsConnector;
use tokio_tungstenite::tungstenite::protocol::Role;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;

use crate::error::{Error, Result};

const OPENED: &str = "stream:opened";
const MESSAGE: &str = "stream:message";
const CLOSED: &str = "stream:closed";

const CR: char = 13 as char;
const LF: char = 10 as char;
const PAD: char = 61 as char;

static NEXT: AtomicU32 = AtomicU32::new(1);

type Socket = WebSocketStream<tokio_rustls::client::TlsStream<TcpStream>>;

#[derive(Default)]
pub struct Streams {
    open: Mutex<HashMap<u32, mpsc::UnboundedSender<Command>>>,
}

enum Command {
    Send(String),
    Close,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Packet {
    id: u32,
    data: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Ending {
    id: u32,
    reason: String,
}

fn nonce() -> String {
    let seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();

    let bytes = seed.to_le_bytes();
    let table = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut key = String::with_capacity(24);

    for chunk in bytes.chunks(3) {
        let a = chunk[0] as usize;
        let b = chunk.get(1).copied().unwrap_or(0) as usize;
        let c = chunk.get(2).copied().unwrap_or(0) as usize;

        key.push(table[a >> 2] as char);
        key.push(table[((a & 0x03) << 4) | (b >> 4)] as char);

        if chunk.len() > 1 {
            key.push(table[((b & 0x0f) << 2) | (c >> 6)] as char);
        } else {
            key.push(PAD);
        }

        if chunk.len() > 2 {
            key.push(table[c & 0x3f] as char);
        } else {
            key.push(PAD);
        }
    }

    key
}

fn line(request: &mut String, text: &str) {
    request.push_str(text);
    request.push(CR);
    request.push(LF);
}

fn split(url: &str) -> Option<(String, u16, String)> {
    let rest = url.strip_prefix("wss://")?;
    let (authority, path) = match rest.find('/') {
        Some(cut) => (&rest[..cut], &rest[cut..]),
        None => (rest, "/"),
    };

    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) => (host.to_owned(), port.parse().unwrap_or(443)),
        None => (authority.to_owned(), 443),
    };

    let path = if path.is_empty() { "/" } else { path };

    Some((host, port, path.to_owned()))
}

async fn upgrade(url: &str, headers: &HashMap<String, String>) -> std::result::Result<Socket, String> {
    let (host, port, path) = split(url).ok_or_else(|| String::from("unsupported socket url"))?;

    let roots = RootCertStore {
        roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
    };

    let provider = Arc::new(tokio_rustls::rustls::crypto::ring::default_provider());

    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|error| error.to_string())?
        .with_root_certificates(roots)
        .with_no_client_auth();

    let name = ServerName::try_from(host.clone()).map_err(|error| error.to_string())?;

    let tcp = TcpStream::connect((host.as_str(), port))
        .await
        .map_err(|error| error.to_string())?;

    let mut tls = TlsConnector::from(Arc::new(config))
        .connect(name, tcp)
        .await
        .map_err(|error| error.to_string())?;

    let mut request = String::new();

    line(&mut request, &format!("GET {path} HTTP/1.1"));
    line(&mut request, &format!("Host: {host}"));
    line(&mut request, "Upgrade: websocket");
    line(&mut request, "Connection: Upgrade");
    line(&mut request, "Sec-WebSocket-Version: 13");
    line(&mut request, &format!("Sec-WebSocket-Key: {}", nonce()));

    for (name, value) in headers {
        line(&mut request, &format!("{name}: {value}"));
    }

    line(&mut request, "");

    tls.write_all(request.as_bytes())
        .await
        .map_err(|error| error.to_string())?;

    let terminator = [CR as u8, LF as u8, CR as u8, LF as u8];
    let mut head = Vec::with_capacity(1024);
    let mut byte = [0u8; 1];

    while !head.ends_with(&terminator) {
        let read = tls.read(&mut byte).await.map_err(|error| error.to_string())?;

        if read == 0 {
            return Err(String::from("the server closed during the handshake"));
        }

        head.push(byte[0]);

        if head.len() > 8192 {
            return Err(String::from("the handshake response was too large"));
        }
    }

    let reply = String::from_utf8_lossy(&head);
    let status = reply.lines().next().unwrap_or_default().trim().to_owned();

    if !status.contains("101") {
        return Err(format!("handshake rejected: {status}"));
    }

    Ok(WebSocketStream::from_raw_socket(tls, Role::Client, None).await)
}

#[tauri::command]
pub async fn stream_open(
    handle: AppHandle,
    state: State<'_, Streams>,
    url: String,
    headers: HashMap<String, String>,
) -> Result<u32> {
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let (sender, mut orders) = mpsc::unbounded_channel::<Command>();

    state
        .open
        .lock()
        .map_err(|_| Error::Sidecar(String::from("the socket registry is poisoned")))?
        .insert(id, sender);

    tauri::async_runtime::spawn(async move {
        let stream = match upgrade(&url, &headers).await {
            Ok(stream) => stream,
            Err(reason) => {
                let _ = handle.emit(CLOSED, Ending { id, reason });
                return;
            }
        };

        let (mut writer, mut reader) = stream.split();
        let _ = handle.emit(OPENED, id);

        let reason = loop {
            tokio::select! {
                order = orders.recv() => match order {
                    Some(Command::Send(text)) => {
                        if writer.send(Message::Text(text.into())).await.is_err() {
                            break String::from("the socket could not be written to");
                        }
                    }
                    Some(Command::Close) | None => {
                        let _ = writer.close().await;
                        break String::from("closed by the app");
                    }
                },
                inbound = reader.next() => match inbound {
                    Some(Ok(Message::Text(text))) => {
                        let _ = handle.emit(MESSAGE, Packet { id, data: text.to_string() });
                    }
                    Some(Ok(Message::Binary(bytes))) => {
                        let data = String::from_utf8_lossy(&bytes).into_owned();
                        let _ = handle.emit(MESSAGE, Packet { id, data });
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        break String::from("closed by the server");
                    }
                    Some(Err(error)) => break error.to_string(),
                    Some(Ok(_)) => {}
                },
            }
        };

        let _ = handle.emit(CLOSED, Ending { id, reason });
    });

    Ok(id)
}

#[tauri::command]
pub fn stream_send(state: State<'_, Streams>, id: u32, data: String) {
    if let Ok(open) = state.open.lock() {
        if let Some(sender) = open.get(&id) {
            let _ = sender.send(Command::Send(data));
        }
    }
}

#[tauri::command]
pub fn stream_close(state: State<'_, Streams>, id: u32) {
    if let Ok(mut open) = state.open.lock() {
        if let Some(sender) = open.remove(&id) {
            let _ = sender.send(Command::Close);
        }
    }
}
