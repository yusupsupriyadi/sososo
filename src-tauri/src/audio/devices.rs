use serde::Serialize;
use wasapi::{DeviceEnumerator, Direction};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

fn list_for(direction: Direction) -> AppResult<Vec<DeviceInfo>> {
    // COM must be initialized on the calling thread; best-effort (already-init is fine).
    let _ = wasapi::initialize_mta();

    let enumerator = DeviceEnumerator::new().map_err(|e| AppError::Audio(e.to_string()))?;

    let default_id = enumerator
        .get_default_device(&direction)
        .ok()
        .and_then(|d| d.get_id().ok());

    let collection = enumerator
        .get_device_collection(&direction)
        .map_err(|e| AppError::Audio(e.to_string()))?;

    let mut out = Vec::new();
    for dev in &collection {
        let Ok(dev) = dev else { continue };
        let Ok(id) = dev.get_id() else { continue };
        let name = dev
            .get_friendlyname()
            .unwrap_or_else(|_| "Unknown device".into());
        let is_default = default_id.as_deref() == Some(id.as_str());
        out.push(DeviceInfo {
            id,
            name,
            is_default,
        });
    }
    Ok(out)
}

/// Microphones / line-in (WASAPI capture endpoints).
pub fn list_input_devices() -> AppResult<Vec<DeviceInfo>> {
    list_for(Direction::Capture)
}

/// Speakers / output endpoints — these are the sources we loopback-capture.
pub fn list_output_devices() -> AppResult<Vec<DeviceInfo>> {
    list_for(Direction::Render)
}
