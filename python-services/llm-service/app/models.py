"""Model state and loading for the llama.cpp GGUF sales model.

``load_models()`` is called once at import time of ``main`` (eager, as before).
A missing file or missing ``llama_cpp`` leaves ``llm`` at ``None`` (stub mode).
"""
import logging
import os
from typing import Any

from app.config import MODEL_FILE, N_CTX, N_THREADS

logger = logging.getLogger(__name__)

llm: Any = None  # llama_cpp.Llama instance once loaded


def load_models() -> None:
    """Load the GGUF model with llama-cpp-python if the file exists."""
    global llm
    if not os.path.exists(MODEL_FILE):
        logger.info("LLM model not found - running in stub mode")
        return
    try:
        from llama_cpp import Llama
        llm = Llama(model_path=MODEL_FILE, n_ctx=N_CTX, n_threads=N_THREADS, verbose=False)
        logger.info("Llama model loaded from %s", MODEL_FILE)
    except Exception as e:
        logger.warning("LLM load failed (install llama-cpp-python): %s", e)
