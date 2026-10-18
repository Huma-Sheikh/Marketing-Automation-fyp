"""Romanization (uroman) for MMS-TTS voices trained on romanized non-Latin text."""
import os
import subprocess
from typing import Optional

from app.config import UROMAN_PATH

_uroman_instance = None  # pure-Python romanizer; built once, it loads data files


def uromanize(text: str, lcode: Optional[str] = None) -> str:
    """Romanize non-Latin script text before tokenizing.

    Required by the MMS-TTS checkpoints fine-tuned on non-Latin scripts
    (Arabic/Urdu), whose tokenizer_config.json says "is_uroman": true. This MUST
    match what the trainer did — feeding those voices native script instead of
    romanized text produces near-noise, not a slightly worse accent.

    Resolution order mirrors colab_04's `uromanize()`: the pure-Python `uroman`
    package first, then a perl uroman checkout via $UROMAN. The Python package
    is why the Dockerfile no longer needs to clone a perl repo; the perl path
    stays as a fallback for existing images that still have one.
    """
    global _uroman_instance
    try:
        import uroman as uroman_pkg
        if _uroman_instance is None:
            _uroman_instance = uroman_pkg.Uroman()
        return _uroman_instance.romanize_string(text, lcode=lcode).strip()
    except ImportError:
        pass

    if not UROMAN_PATH:
        raise RuntimeError(
            "This voice requires uroman preprocessing, but neither the `uroman` Python package "
            "nor the UROMAN env var is available. Run `pip install uroman`, or set UROMAN to the "
            "path of a cloned https://github.com/isi-nlp/uroman checkout."
        )
    script_path = os.path.join(UROMAN_PATH, "bin", "uroman.pl")
    process = subprocess.Popen(
        ["perl", script_path] + (["-l", lcode] if lcode else []),
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    stdout, stderr = process.communicate(input=text.encode())
    if process.returncode != 0:
        raise ValueError(f"uroman failed ({process.returncode}): {stderr.decode()}")
    return stdout.decode().strip()
