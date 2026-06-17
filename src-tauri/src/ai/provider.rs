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
    /// Zhipu AI "GLM" (OpenAI-compatible).
    Glm,
    /// Moonshot AI "Kimi" (OpenAI-compatible).
    Kimi,
    /// xAI "Grok" (OpenAI-compatible).
    Grok,
    /// DeepSeek (OpenAI-compatible).
    DeepSeek,
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
            "gemini" => Some(Provider::Gemini),
            "anthropic" => Some(Provider::Anthropic),
            "glm" => Some(Provider::Glm),
            "kimi" => Some(Provider::Kimi),
            "grok" => Some(Provider::Grok),
            "deepseek" => Some(Provider::DeepSeek),
            _ => None,
        }
    }

    /// Canonical lowercase id — used both as the persisted `ai_provider` setting
    /// string and as the OS-keychain service name holding this provider's key.
    pub fn id(self) -> &'static str {
        match self {
            Provider::OpenAi => "openai",
            Provider::Gemini => "gemini",
            Provider::Anthropic => "anthropic",
            Provider::Glm => "glm",
            Provider::Kimi => "kimi",
            Provider::Grok => "grok",
            Provider::DeepSeek => "deepseek",
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
            Provider::Gemini => "Gemini",
            Provider::Anthropic => "Anthropic (Claude)",
            Provider::Glm => "GLM (Zhipu AI)",
            Provider::Kimi => "Kimi (Moonshot)",
            Provider::Grok => "Grok (xAI)",
            Provider::DeepSeek => "DeepSeek",
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
            Provider::Gemini | Provider::Anthropic => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every variant, for exhaustive iteration in the tests below.
    const ALL: [Provider; 7] = [
        Provider::OpenAi,
        Provider::Gemini,
        Provider::Anthropic,
        Provider::Glm,
        Provider::Kimi,
        Provider::Grok,
        Provider::DeepSeek,
    ];

    #[test]
    fn provider_from_setting_is_case_insensitive_and_defaults_to_openai() {
        assert_eq!(Provider::from_setting("gemini"), Provider::Gemini);
        assert_eq!(Provider::from_setting("  GEMINI "), Provider::Gemini);
        assert_eq!(Provider::from_setting("openai"), Provider::OpenAi);
        assert_eq!(Provider::from_setting("anthropic"), Provider::Anthropic);
        assert_eq!(Provider::from_setting("GLM"), Provider::Glm);
        assert_eq!(Provider::from_setting(" kimi "), Provider::Kimi);
        assert_eq!(Provider::from_setting("grok"), Provider::Grok);
        assert_eq!(Provider::from_setting("DeepSeek"), Provider::DeepSeek);
        // Unknown / empty fall back to OpenAI (lenient parse for reads).
        assert_eq!(Provider::from_setting(""), Provider::OpenAi);
        assert_eq!(Provider::from_setting("something-else"), Provider::OpenAi);
    }

    #[test]
    fn try_from_setting_is_strict_and_rejects_unknown() {
        assert_eq!(Provider::try_from_setting("openai"), Some(Provider::OpenAi));
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
        assert_eq!(Provider::Gemini.id(), "gemini");
        assert_eq!(Provider::Anthropic.id(), "anthropic");
        assert_eq!(Provider::Glm.id(), "glm");
        assert_eq!(Provider::Kimi.id(), "kimi");
        assert_eq!(Provider::Grok.id(), "grok");
        assert_eq!(Provider::DeepSeek.id(), "deepseek");
    }

    #[test]
    fn every_variant_has_a_non_empty_label() {
        assert_eq!(ALL.len(), 7);
        for p in ALL {
            assert!(!p.label().is_empty());
        }
    }

    #[test]
    fn openai_compatible_providers_expose_endpoint_and_model() {
        // OpenAI + the four OpenAI-compatible backends route through the OpenAI transport.
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
    }
}
