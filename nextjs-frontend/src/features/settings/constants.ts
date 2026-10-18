/** Third-party integrations configured in nestjs-backend/.env. */
export const API_INTEGRATIONS = [
  { name: "Twilio", desc: "Platform fallback number for calls & SMS", env: "TWILIO_ACCOUNT_SID", url: "twilio.com" },
  { name: "Resend", desc: "Email sending (3000 free/mo)", env: "RESEND_API_KEY", url: "resend.com" },
  { name: "Stripe", desc: "Subscription billing", env: "STRIPE_SECRET_KEY", url: "stripe.com" },
  { name: "Google Places", desc: "Business search", env: "GOOGLE_PLACES_API_KEY", url: "console.cloud.google.com" },
];

/**
 * Where each Python service loads its trained model from (relative to the
 * repo root). Keep in sync with python-services/<service>/.
 */
export const MODEL_LOCATIONS = [
  {
    service: "STT / TTS",
    path: "python-services/stt-tts-service/models/",
    files: "stt_model_final/ (Whisper), tts_model_final/<lang>/ (fine-tuned VITS/MMS), tts_model_base/<lang>/ (base MMS voices)",
  },
  {
    service: "Leads",
    path: "python-services/leads-service/model/",
    files: "distilbert_ner_prod_v2/ (NER), scorer/xgboost_scorer.joblib (lead scoring)",
  },
  {
    service: "Business",
    path: "python-services/business-service/model/",
    files: "sentiment_roberta/ (review sentiment), business_category/ (category classifier)",
  },
  {
    service: "LLM",
    path: "python-services/llm-service/models/",
    files: "model-q4_K_M.gguf",
  },
];
