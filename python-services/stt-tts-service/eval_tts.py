"""Round-trip intelligibility eval: base MMS voices vs fine-tuned voices.

Each test sentence is synthesised by a voice, transcribed back by the
service's own Whisper model (models/stt_model_final), and scored by word error
rate against the input text. Lower is better. The same ASR judges both voices,
so its own errors largely cancel out of the comparison.

Run from python-services/stt-tts-service/:
    python eval_tts.py                 # every language present in both dirs
    python eval_tts.py en de           # just these

A fine-tuned voice is worth serving (TTS_FINETUNED_LANGS) only if its WER is
at or below the base voice's.
"""
import os
import re
import sys
import unicodedata

import librosa
import numpy as np
import torch
from transformers import AutoTokenizer, VitsModel, WhisperForConditionalGeneration, WhisperProcessor

BASE_DIR = os.path.join("models", "tts_model_base")
TUNED_DIR = os.path.join("models", "tts_model_final")
STT_DIR = os.path.join("models", "stt_model_final")
SEEDS = (0, 1)  # VITS sampling is stochastic; average over a couple of draws

SENTENCES = {
    "en": ["Welcome to our store, we have special offers today.",
           "Your order has been shipped and will arrive tomorrow.",
           "Thank you for contacting customer support.",
           "Our new summer collection is now available online.",
           "Please confirm your email address to continue.",
           "Get twenty percent off on your first purchase."],
    "de": ["Willkommen in unserem Geschäft, heute haben wir besondere Angebote.",
           "Ihre Bestellung wurde versandt und kommt morgen an.",
           "Vielen Dank für Ihre Nachricht an unseren Kundenservice.",
           "Unsere neue Sommerkollektion ist jetzt online erhältlich.",
           "Bitte bestätigen Sie Ihre E-Mail-Adresse.",
           "Sie erhalten zwanzig Prozent Rabatt auf Ihren ersten Einkauf."],
    "fr": ["Bienvenue dans notre magasin, nous avons des offres spéciales aujourd'hui.",
           "Votre commande a été expédiée et arrivera demain.",
           "Merci d'avoir contacté notre service client.",
           "Notre nouvelle collection d'été est disponible en ligne.",
           "Veuillez confirmer votre adresse email pour continuer.",
           "Profitez de vingt pour cent de réduction sur votre premier achat."],
    "es": ["Bienvenidos a nuestra tienda, hoy tenemos ofertas especiales.",
           "Su pedido ha sido enviado y llegará mañana.",
           "Gracias por contactar con nuestro servicio al cliente.",
           "Nuestra nueva colección de verano ya está disponible en línea.",
           "Por favor confirme su correo electrónico para continuar.",
           "Obtenga un veinte por ciento de descuento en su primera compra."],
    "ar": ["مرحبا بكم في متجرنا لدينا عروض خاصة اليوم",
           "تم شحن طلبك وسيصل غدا",
           "شكرا لتواصلك مع خدمة العملاء",
           "مجموعتنا الصيفية الجديدة متاحة الآن على الإنترنت",
           "يرجى تأكيد بريدك الإلكتروني للمتابعة",
           "احصل على خصم عشرين بالمئة على أول عملية شراء"],
}


def words(text):
    text = unicodedata.normalize("NFKC", text.lower())
    text = "".join(ch for ch in text if not unicodedata.category(ch).startswith("M"))
    return re.sub(r"[^\w\s]", " ", text).split()


def wer(ref, hyp):
    r, h = words(ref), words(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return d[len(h)] / max(len(r), 1)


def load_voice(path):
    model, info = VitsModel.from_pretrained(path, output_loading_info=True)
    if info["missing_keys"]:
        raise RuntimeError(f"{path}: {len(info['missing_keys'])} weights missing — not a valid voice")
    return model.eval(), AutoTokenizer.from_pretrained(path)


def main(langs):
    processor = WhisperProcessor.from_pretrained(STT_DIR)
    asr = WhisperForConditionalGeneration.from_pretrained(STT_DIR).eval()

    def transcribe(waveform, sr, lang):
        audio = librosa.resample(waveform, orig_sr=sr, target_sr=16000) if sr != 16000 else waveform
        feats = processor.feature_extractor(audio, sampling_rate=16000, return_tensors="pt").input_features
        with torch.no_grad():
            ids = asr.generate(feats, language=lang, task="transcribe", max_new_tokens=225)
        return processor.tokenizer.batch_decode(ids, skip_special_tokens=True)[0].strip()

    rows = []
    for lang in langs:
        if lang not in SENTENCES:
            print(f"[{lang}] no test sentences — skipping")
            continue
        scores = {}
        for label, root in (("base", BASE_DIR), ("finetuned", TUNED_DIR)):
            path = os.path.join(root, lang)
            if not os.path.exists(os.path.join(path, "config.json")):
                continue
            model, tok = load_voice(path)
            errs = []
            for seed in SEEDS:
                for s in SENTENCES[lang]:
                    torch.manual_seed(seed)
                    with torch.no_grad():
                        wav = model(**tok(s, return_tensors="pt")).waveform[0].numpy()
                    hyp = transcribe(wav, model.config.sampling_rate, lang)
                    errs.append(wer(s, hyp))
                    if seed == SEEDS[0]:
                        print(f"  [{lang}/{label}] {hyp}")
            scores[label] = float(np.mean(errs))
        rows.append((lang, scores.get("base"), scores.get("finetuned")))

    fmt = lambda v: "   -" if v is None else f"{v * 100:3.0f}%"
    print("\nlang   base WER   fine-tuned WER   serve")
    for lang, b, f in rows:
        better = f is not None and (b is None or f <= b)
        print(f"{lang:4}   {fmt(b):>8}   {fmt(f):>14}   {'finetuned' if better else 'base'}")
    keep = [lang for lang, b, f in rows if f is not None and (b is None or f <= b)]
    print(f"\nTTS_FINETUNED_LANGS={','.join(keep)}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    requested = sys.argv[1:]
    if not requested:
        requested = sorted(set(os.listdir(BASE_DIR) if os.path.isdir(BASE_DIR) else [])
                           & set(os.listdir(TUNED_DIR) if os.path.isdir(TUNED_DIR) else []))
    main(requested)
