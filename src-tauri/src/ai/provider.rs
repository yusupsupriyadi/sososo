//! AI backend selection.
//!
//! A [`Provider`] picks which backend powers AI summaries + live translation +
//! transcript chat. Persisted as the `ai_provider` app setting (the provider's
//! [`id`](Provider::id)) and resolved via [`Provider::from_setting`].
//!
//! Most providers speak the OpenAI Chat Completions wire format and differ only
//! by base URL + model name — those return their `(endpoint, model)` from
//! [`Provider::openai_compatible`] and share the `openai` transport. Gemini and
//! Anthropic have bespoke request/response shapes and their own transports.

/// Which AI backend powers summaries + live translation + transcript chat.
/// Persisted as the `ai_provider` app setting (lowercase [`id`](Provider::id)).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provider {
    OpenAi,
    Gemini,
    Anthropic,
    /// A generic OpenAI-compatible endpoint with a user-provided base URL and
    /// API key — covers OpenRouter, Qwen, or any other third-party gateway that
    /// speaks the OpenAI Chat Completions wire format. Unlike `LlamaLocal`, the
    /// API key is a real secret (not a placeholder) and the endpoint is typically
    /// a remote HTTPS URL.
    OpenAiCompatible,
    /// Zhipu AI "GLM" (OpenAI-compatible).
    Glm,
    /// Moonshot AI "Kimi" (OpenAI-compatible).
    Kimi,
    /// xAI "Grok" (OpenAI-compatible).
    Grok,
    /// DeepSeek (OpenAI-compatible).
    DeepSeek,
    /// A locally-hosted Llama-family model exposed over an OpenAI-compatible API
    /// (Ollama, LM Studio, llama.cpp, …). No cloud key; the base URL + model are
    /// user-configured (see [`LLAMA_DEFAULT_BASE_URL`] / [`LLAMA_DEFAULT_MODEL`]).
    LlamaLocal,
}

/// Default OpenAI-compatible base URL for a local Llama runtime (Ollama's port).
pub(crate) const LLAMA_DEFAULT_BASE_URL: &str = "http://localhost:11434/v1";
/// Default local model name. Editable in Settings — must match a model the user
/// has actually pulled/loaded (e.g. `ollama pull llama3.1`).
pub(crate) const LLAMA_DEFAULT_MODEL: &str = "llama3.1";
/// Placeholder bearer token for local servers (Ollama / LM Studio / llama.cpp
/// ignore it; an empty one is rejected by some). The key is never a real secret.
pub(crate) const LLAMA_PLACEHOLDER_KEY: &str = "local";

/// Turn a user-configured local base URL into a full chat-completions endpoint:
/// append `/chat/completions` unless it is already present. Tolerates surrounding
/// whitespace and a trailing slash.
pub(crate) fn llama_chat_url(base: &str) -> String {
    let base = base.trim().trim_end_matches('/');
    if base.ends_with("/chat/completions") {
        base.to_string()
    } else {
        format!("{base}/chat/completions")
    }
}

impl Provider {
    /// Lenient parse for reads: anything unknown falls back to OpenAI so a
    /// missing/garbled setting never breaks resolving a provider.
    pub fn from_setting(s: &str) -> Self {
        Self::try_from_setting(s).unwrap_or(Provider::OpenAi)
    }

    /// Strict parse for writes: returns `None` for an unknown string so the
    /// `set_ai_provider` command can reject anything outside the known set.
    /// Case-insensitive and whitespace-trimming.
    pub fn try_from_setting(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "openai" => Some(Provider::OpenAi),
            "openai-compatible" => Some(Provider::OpenAiCompatible),
            "gemini" => Some(Provider::Gemini),
            "anthropic" => Some(Provider::Anthropic),
            "glm" => Some(Provider::Glm),
            "kimi" => Some(Provider::Kimi),
            "grok" => Some(Provider::Grok),
            "deepseek" => Some(Provider::DeepSeek),
            "llama" => Some(Provider::LlamaLocal),
            _ => None,
        }
    }

    /// Canonical lowercase id — used both as the persisted `ai_provider` setting
    /// string and as the OS-keychain service name holding this provider's key.
    pub fn id(self) -> &'static str {
        match self {
            Provider::OpenAi => "openai",
            Provider::OpenAiCompatible => "openai-compatible",
            Provider::Gemini => "gemini",
            Provider::Anthropic => "anthropic",
            Provider::Glm => "glm",
            Provider::Kimi => "kimi",
            Provider::Grok => "grok",
            Provider::DeepSeek => "deepseek",
            Provider::LlamaLocal => "llama",
        }
    }

    /// Keychain service name holding this provider's API key (identical to [`id`](Self::id)).
    pub fn key_service(self) -> &'static str {
        self.id()
    }

    /// Human-readable name for error/status messages and the Settings dropdown.
    pub fn label(self) -> &'static str {
        match self {
            Provider::OpenAi => "OpenAI",
            Provider::OpenAiCompatible => "OpenAI Compatible",
            Provider::Gemini => "Gemini",
            Provider::Anthropic => "Anthropic (Claude)",
            Provider::Glm => "GLM (Zhipu AI)",
            Provider::Kimi => "Kimi (Moonshot)",
            Provider::Grok => "Grok (xAI)",
            Provider::DeepSeek => "DeepSeek",
            Provider::LlamaLocal => "Llama (local)",
        }
    }

    /// The built-in default model for this provider — used when the user has not
    /// chosen a model override in Settings. Cheap/fast tier (mirroring OpenAI's
    /// `gpt-4o-mini`); intentionally easy to bump. For the OpenAI-compatible cloud
    /// providers this is the model half of [`openai_compatible`], so there is a
    /// single source of truth.
    pub(crate) fn default_model(self) -> &'static str {
        match self {
            Provider::Gemini => "gemini-2.5-flash",
            Provider::Anthropic => "claude-haiku-4-5",
            Provider::LlamaLocal => LLAMA_DEFAULT_MODEL,
            // Generic OpenAI-compatible endpoint (OpenRouter, etc.).
            Provider::OpenAiCompatible => "openai/gpt-4o-mini",
            // OpenAI / GLM / Kimi / Grok / DeepSeek.
            other => other
                .openai_compatible()
                .map(|(_endpoint, model)| model)
                .expect("OpenAI-compatible provider has a default model"),
        }
    }

    /// For providers that speak the OpenAI Chat Completions wire format, the
    /// `(endpoint, model)` to hit — they all share the `openai` transport.
    /// Gemini and Anthropic have their own transports and return `None`.
    ///
    /// The model constants are sensible cheap/fast defaults (mirroring OpenAI's
    /// `gpt-4o-mini` tier); they are intentionally easy to bump here.
    pub(crate) fn openai_compatible(self) -> Option<(&'static str, &'static str)> {
        match self {
            Provider::OpenAi => Some(("https://api.openai.com/v1/chat/completions", "gpt-4o-mini")),
            Provider::Glm => Some(("https://api.z.ai/api/paas/v4/chat/completions", "glm-4.6")),
            Provider::Kimi => Some(("https://api.moonshot.ai/v1/chat/completions", "kimi-k2.5")),
            Provider::Grok => Some(("https://api.x.ai/v1/chat/completions", "grok-4")),
            // `deepseek-chat` maps to the non-thinking DeepSeek model; the
            // documented successor is `deepseek-v4-flash` if this ever 404s.
            Provider::DeepSeek => Some((
                "https://api.deepseek.com/v1/chat/completions",
                "deepseek-chat",
            )),
            // Gemini/Anthropic have bespoke transports; OpenAiCompatible and
            // LlamaLocal are OpenAI-shaped but their endpoint+model are resolved
            // at runtime from user settings, not from this static table.
            Provider::Gemini
            | Provider::Anthropic
            | Provider::OpenAiCompatible
            | Provider::LlamaLocal => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every variant, for exhaustive iteration in the tests below.
    const ALL: [Provider; 9] = [
        Provider::OpenAi,
        Provider::OpenAiCompatible,
        Provider::Gemini,
        Provider::Anthropic,
        Provider::Glm,
        Provider::Kimi,
        Provider::Grok,
        Provider::DeepSeek,
        Provider::LlamaLocal,
    ];

    #[test]
    fn provider_from_setting_is_case_insensitive_and_defaults_to_openai() {
        assert_eq!(Provider::from_setting("gemini"), Provider::Gemini);
        assert_eq!(Provider::from_setting("  GEMINI "), Provider::Gemini);
        assert_eq!(Provider::from_setting("openai"), Provider::OpenAi);
        assert_eq!(
            Provider::from_setting("openai-compatible"),
            Provider::OpenAiCompatible
        );
        assert_eq!(
            Provider::from_setting("  OpenAI-Compatible "),
            Provider::OpenAiCompatible
        );
        assert_eq!(Provider::from_setting("anthropic"), Provider::Anthropic);
        assert_eq!(Provider::from_setting("GLM"), Provider::Glm);
        assert_eq!(Provider::from_setting(" kimi "), Provider::Kimi);
        assert_eq!(Provider::from_setting("grok"), Provider::Grok);
        assert_eq!(Provider::from_setting("DeepSeek"), Provider::DeepSeek);
        assert_eq!(Provider::from_setting("Llama"), Provider::LlamaLocal);
        // Unknown / empty fall back to OpenAI (lenient parse for reads).
        assert_eq!(Provider::from_setting(""), Provider::OpenAi);
        assert_eq!(Provider::from_setting("something-else"), Provider::OpenAi);
    }

    #[test]
    fn try_from_setting_is_strict_and_rejects_unknown() {
        assert_eq!(Provider::try_from_setting("openai"), Some(Provider::OpenAi));
        assert_eq!(
            Provider::try_from_setting("openai-compatible"),
            Some(Provider::OpenAiCompatible)
        );
        assert_eq!(Provider::try_from_setting("gemini"), Some(Provider::Gemini));
        assert_eq!(
            Provider::try_from_setting("ANTHROPIC"),
            Some(Provider::Anthropic)
        );
        assert_eq!(Provider::try_from_setting("glm"), Some(Provider::Glm));
        assert_eq!(Provider::try_from_setting("kimi"), Some(Provider::Kimi));
        assert_eq!(Provider::try_from_setting("grok"), Some(Provider::Grok));
        assert_eq!(
            Provider::try_from_setting("deepseek"),
            Some(Provider::DeepSeek)
        );
        assert_eq!(
            Provider::try_from_setting("llama"),
            Some(Provider::LlamaLocal)
        );
        // Strict: unknown is None (so writes can be rejected), unlike from_setting.
        assert_eq!(Provider::try_from_setting(""), None);
        assert_eq!(Provider::try_from_setting("bogus"), None);
    }

    #[test]
    fn id_is_the_canonical_lowercase_setting_and_keychain_name() {
        // id() doubles as the persisted setting string AND the keychain service.
        for p in ALL {
            assert_eq!(p.key_service(), p.id());
            // Round-trips through the strict parser.
            assert_eq!(Provider::try_from_setting(p.id()), Some(p));
        }
        assert_eq!(Provider::OpenAi.id(), "openai");
        assert_eq!(Provider::OpenAiCompatible.id(), "openai-compatible");
        assert_eq!(Provider::Gemini.id(), "gemini");
        assert_eq!(Provider::Anthropic.id(), "anthropic");
        assert_eq!(Provider::Glm.id(), "glm");
        assert_eq!(Provider::Kimi.id(), "kimi");
        assert_eq!(Provider::Grok.id(), "grok");
        assert_eq!(Provider::DeepSeek.id(), "deepseek");
        assert_eq!(Provider::LlamaLocal.id(), "llama");
    }

    #[test]
    fn every_variant_has_a_non_empty_label() {
        assert_eq!(ALL.len(), 9);
        for p in ALL {
            assert!(!p.label().is_empty());
        }
    }

    #[test]
    fn openai_compatible_providers_expose_endpoint_and_model() {
        // OpenAI + the four OpenAI-compatible cloud backends route through the OpenAI transport.
        for p in [
            Provider::OpenAi,
            Provider::Glm,
            Provider::Kimi,
            Provider::Grok,
            Provider::DeepSeek,
        ] {
            let (endpoint, model) = p
                .openai_compatible()
                .unwrap_or_else(|| panic!("{} should be OpenAI-compatible", p.id()));
            assert!(endpoint.starts_with("https://"), "{}", endpoint);
            assert!(!model.is_empty());
        }
        // Gemini and Anthropic have bespoke transports, not the OpenAI shape.
        assert_eq!(Provider::Gemini.openai_compatible(), None);
        assert_eq!(Provider::Anthropic.openai_compatible(), None);
        // Generic OpenAI Compatible and local Llama are OpenAI-shaped but their
        // endpoint/model are user-configured at runtime, so not in the static table.
        assert_eq!(Provider::OpenAiCompatible.openai_compatible(), None);
        assert_eq!(Provider::LlamaLocal.openai_compatible(), None);
    }

    #[test]
    fn llama_chat_url_appends_chat_completions_unless_already_present() {
        // Default base (Ollama) gets the OpenAI path appended.
        assert_eq!(
            llama_chat_url("http://localhost:11434/v1"),
            "http://localhost:11434/v1/chat/completions"
        );
        // A trailing slash is tolerated.
        assert_eq!(
            llama_chat_url("http://localhost:11434/v1/"),
            "http://localhost:11434/v1/chat/completions"
        );
        // A full URL is left untouched (idempotent).
        assert_eq!(
            llama_chat_url("http://localhost:11434/v1/chat/completions"),
            "http://localhost:11434/v1/chat/completions"
        );
        // Other local runtimes (LM Studio :1234, llama.cpp :8080) work too.
        assert_eq!(
            llama_chat_url(" http://localhost:1234/v1 "),
            "http://localhost:1234/v1/chat/completions"
        );
    }

    #[test]
    fn default_model_is_non_empty_for_every_provider() {
        for p in ALL {
            assert!(!p.default_model().is_empty(), "{}", p.id());
        }
        // Spot-check the cheap/fast-tier defaults.
        assert_eq!(Provider::OpenAi.default_model(), "gpt-4o-mini");
        assert_eq!(Provider::Gemini.default_model(), "gemini-2.5-flash");
        assert_eq!(Provider::Anthropic.default_model(), "claude-haiku-4-5");
        assert_eq!(
            Provider::OpenAiCompatible.default_model(),
            "openai/gpt-4o-mini"
        );
        assert_eq!(Provider::DeepSeek.default_model(), "deepseek-chat");
        assert_eq!(Provider::LlamaLocal.default_model(), LLAMA_DEFAULT_MODEL);
    }

    #[test]
    fn llama_defaults_point_at_ollama() {
        assert!(LLAMA_DEFAULT_BASE_URL.starts_with("http://"));
        assert!(llama_chat_url(LLAMA_DEFAULT_BASE_URL).ends_with("/chat/completions"));
        assert!(!LLAMA_DEFAULT_MODEL.is_empty());
    }
}
