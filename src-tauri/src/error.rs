use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("configuration file not found")]
    ConfigMissing,

    #[error("failed to read configuration: {0}")]
    ConfigRead(#[from] std::io::Error),

    #[error("failed to parse configuration: {0}")]
    ConfigParse(#[from] serde_json::Error),

    #[error("the library binary failed: {0}")]
    Sidecar(String),

    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<tauri_plugin_shell::Error> for Error {
    fn from(value: tauri_plugin_shell::Error) -> Self {
        Self::Sidecar(value.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
