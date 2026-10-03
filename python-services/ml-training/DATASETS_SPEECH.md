# Multilingual STT + TTS — Dataset Reference

Companion doc for [colab_03_stt_whisper_multilingual.py](colab_03_stt_whisper_multilingual.py) and
[colab_04_tts_mms_multilingual.py](colab_04_tts_mms_multilingual.py).

7 languages: **English, Urdu, Arabic, German** (required) + **French, Spanish, Hindi** (optional —
toggle in the `LANGUAGES` dict at the top of each notebook). 17 datasets total, all free, all
loadable with `datasets.load_dataset(...)` or a direct Kaggle download — no paid API keys anywhere.

Every dataset below was verified to exist on Hugging Face / Kaggle at the time this was written
(2026-07). Hugging Face dataset pages occasionally get renamed or re-gated — if a `load_dataset()`
call in the notebooks fails, open the linked page first to confirm the id/config didn't change;
the notebooks already skip a failed dataset and keep training on the rest rather than crashing.

## ⚠️ About Common Voice

Mozilla moved Common Voice distribution to **Mozilla Data Collective** in October 2025. The
`mozilla-foundation/common_voice_17_0` mirror on Hugging Face still works, but you must click
"Agree and access repository" on the dataset page once while logged in, then pass a HF token
(`huggingface-cli login` in Cell 1) — otherwise `load_dataset` raises a 403. Because of this extra
friction it's treated as an **optional bonus** dataset in every language below, not a required one;
training works fine with it disabled.

## STT datasets (speech → text, used by `colab_03`)

| # | Language | Dataset | HF / Kaggle id | Size | Notes |
|---|----------|---------|-----------------|------|-------|
| 1 | English (en) | LibriSpeech ASR | [`openslr/librispeech_asr`](https://huggingface.co/datasets/openslr/librispeech_asr), config `clean`, split `train.100` | ~100h | Clean read audiobooks, the standard English ASR baseline |
| 2 | English (en) | Common Voice 17 — *optional* | [`mozilla-foundation/common_voice_17_0`](https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0), config `en` | large, we cap it | Gated, see note above |
| 3 | German (de) | VoxPopuli | [`facebook/voxpopuli`](https://huggingface.co/datasets/facebook/voxpopuli), config `de` | ~200h | European Parliament speech, ungated |
| 4 | German (de) | FLEURS | [`google/fleurs`](https://huggingface.co/datasets/google/fleurs), config `de_de` | ~10h | Ungated, high quality, also used for eval |
| 5 | German (de) | Common Voice 17 — *optional* | `mozilla-foundation/common_voice_17_0`, config `de` | large | Gated, see note above |
| 6 | Arabic (ar) | FLEURS | `google/fleurs`, config `ar_eg` | ~10h | Ungated |
| 7 | Arabic (ar) | Common Voice 17 — *optional* | `mozilla-foundation/common_voice_17_0`, config `ar` | large | Gated, see note above |
| 8 | Urdu (ur) | FLEURS | `google/fleurs`, config `ur_pk` | ~10h | Ungated |
| 9 | Urdu (ur) | Urdu TTS/ASR pairs | [`muhammadsaadgondal/urdu-tts`](https://huggingface.co/datasets/muhammadsaadgondal/urdu-tts) | community-sized | Audio + transcript pairs, ungated |
| 10 | Urdu (ur) | Kaggle Urdu Speech | [Kaggle: `bitlord/urdu-language-speech-dataset`](https://www.kaggle.com/datasets/bitlord/urdu-language-speech-dataset) | community-sized | Download via `kagglehub`, see Cell 1 of colab_03 |
| 11 | French (fr) — *optional lang* | VoxPopuli | `facebook/voxpopuli`, config `fr` | ~200h | Ungated |
| 12 | Spanish (es) — *optional lang* | VoxPopuli | `facebook/voxpopuli`, config `es` | ~150h | Ungated |
| 13 | Hindi (hi) — *optional lang* | FLEURS | `google/fleurs`, config `hi_in` | ~10h | Ungated |

## TTS datasets (clean/single- or few-speaker, used by `colab_04`)

| # | Language | Dataset | HF id | Size | Why it's good for TTS |
|---|----------|---------|-------|------|------------------------|
| 14 | English (en) | LJSpeech | [`keithito/lj_speech`](https://huggingface.co/datasets/keithito/lj_speech) | ~24h | Single female speaker, studio-clean — the standard TTS gold-standard corpus |
| 15 | Arabic (ar) | Arabic Speech Corpus | [`halabi2016/arabic_speech_corpus`](https://huggingface.co/datasets/halabi2016/arabic_speech_corpus) | ~3.7h | Single male speaker, MSA, phonetically balanced |
| 16 | Arabic (ar) | ClArTTS *(alternative, not wired in by default)* | [`MBZUAI/ClArTTS`](https://huggingface.co/datasets/MBZUAI/ClArTTS) | ~12h | Single male speaker, Classical Arabic, more volume than #15 — but its `audio` column isn't a standard HF `Audio` feature (raw array + separate `sampling_rate` field), so `colab_04`'s generic `dataset_name`/`dataset_config_name` loading won't decode it as-is. Row #15 is what `colab_04` actually trains on; swap this in only if you're ready to write a small custom loader for it. |
| 17 | Urdu (ur) | Synthetic Urdu TTS | [`humairawan/Urdu-aud01`](https://huggingface.co/datasets/humairawan/Urdu-aud01) | community-sized | Clean synthetic single/few-speaker Urdu, fills the gap left by no LJSpeech-equivalent for Urdu |

German, French, Spanish, and Hindi don't have an equally famous single-speaker corpus in this free
tier, so `colab_04` fine-tunes their `facebook/mms-tts-<lang>` checkpoint on the same FLEURS /
VoxPopuli speech used for STT (rows 3, 4, 6, 8, 11, 12, 13 above) — multi-speaker, but MMS's VITS
architecture handles that fine and it keeps everything free and license-clean. If you find or record
a cleaner single-speaker corpus for those languages later, point `TTS_DATASETS[lang]` at it instead.

## Pretrained base checkpoints (all Apache-2.0 / MIT, all free, no gating)

| Task | Model | HF id |
|------|-------|-------|
| STT (all 7 languages, one checkpoint) | Whisper small | [`openai/whisper-small`](https://huggingface.co/openai/whisper-small) |
| TTS English | VITS-LJS w/ discriminator | [`ylacombe/vits-ljs-with-discriminator`](https://huggingface.co/ylacombe/vits-ljs-with-discriminator) |
| TTS German | MMS-TTS German | [`facebook/mms-tts-deu`](https://huggingface.co/facebook/mms-tts-deu) |
| TTS Arabic | MMS-TTS Arabic | [`facebook/mms-tts-ara`](https://huggingface.co/facebook/mms-tts-ara) |
| TTS Urdu | MMS-TTS Urdu (Arabic script) | [`facebook/mms-tts-urd-script_arabic`](https://huggingface.co/facebook/mms-tts-urd-script_arabic) |
| TTS French | MMS-TTS French | [`facebook/mms-tts-fra`](https://huggingface.co/facebook/mms-tts-fra) |
| TTS Spanish | MMS-TTS Spanish | [`facebook/mms-tts-spa`](https://huggingface.co/facebook/mms-tts-spa) |
| TTS Hindi | MMS-TTS Hindi | [`facebook/mms-tts-hin`](https://huggingface.co/facebook/mms-tts-hin) |

MMS covers 1100+ languages under `facebook/mms-tts-<iso639-3>` — if you add an 8th language, look
its checkpoint up at [facebook/mms-tts](https://huggingface.co/facebook/mms-tts) before hardcoding
a guessed code.
