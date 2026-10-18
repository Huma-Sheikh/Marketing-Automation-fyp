"""Service configuration: every environment variable and tunable constant in one place."""
import os

# ── Model ─────────────────────────────────────────────────────────────────────
MODELS_DIR: str = "models"
MODEL_FILE: str = os.path.join(MODELS_DIR, "model-q4_K_M.gguf")
N_CTX: int = 2048

# ── Environment ───────────────────────────────────────────────────────────────
# CPU threads llama.cpp uses for inference.
N_THREADS: int = int(os.getenv("LLM_THREADS", "4"))
# Hard cap on sentences in a spoken /chat reply (<= 0 disables the cap).
MAX_REPLY_SENTENCES: int = int(os.getenv("LLM_MAX_SENTENCES", "2"))
# Generation is the expensive half of a turn, and clamp_sentences throws away
# anything past two sentences anyway — so generating the backend's default 150
# tokens just buys latency we then discard. Two sentences is ~40-60 tokens.
MAX_CHAT_TOKENS: int = int(os.getenv("LLM_MAX_CHAT_TOKENS", "80"))

# ── Prompt / generation limits ────────────────────────────────────────────────
MAX_PROFILE_CHARS: int = 1200        # cap on the injected company-facts block
CHAT_HISTORY_TURNS: int = 6          # most recent messages sent to the model
CHAT_TEMPERATURE: float = 0.7
CHAT_TOP_P: float = 0.9
QUALIFY_MAX_TOKENS: int = 120
QUALIFY_TEMPERATURE: float = 0.1
QUALIFY_MAX_TRANSCRIPT_CHARS: int = 1500
QUALIFY_MAX_NOTES_CHARS: int = 200
