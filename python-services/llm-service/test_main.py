"""
Unit + integration tests for the LLM chat service.
Runs in stub mode by default; model paths are exercised with a fake llama.cpp object.
Run: pytest python-services/llm-service/test_main.py -v
"""

import pytest
from fastapi.testclient import TestClient

import main
from app import models
from app.conversation import clamp_sentences, keyword_qualify
from app.prompts import OUTCOMES, SALES_RESPONSES, build_system_prompt

# Force stub mode regardless of whether a GGUF is present locally.
models.llm = None

client = TestClient(main.app)

HISTORY = {"conversation_history": [{"role": "user", "content": "Hi, who is this?"}]}


class FakeLlm:
    """Stands in for llama_cpp.Llama; records the messages it was given."""

    def __init__(self, reply="", fail=False):
        self.reply, self.fail, self.calls = reply, fail, []

    def create_chat_completion(self, messages, **kwargs):
        self.calls.append({"messages": messages, **kwargs})
        if self.fail:
            raise RuntimeError("inference failed")
        return {"choices": [{"message": {"content": self.reply}}]}


@pytest.fixture
def fake_llm(monkeypatch):
    def install(**kwargs):
        llm = FakeLlm(**kwargs)
        monkeypatch.setattr(models, "llm", llm)
        return llm
    return install


# ─── /health ──────────────────────────────────────────────────────────────────

class TestHealth:
    def test_stub_mode(self):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["llm_loaded"] is False
        assert body["mode"] == "stub"
        assert body["model"].endswith(".gguf")


# ─── /chat ────────────────────────────────────────────────────────────────────

class TestChat:
    def test_stub_reply_is_scripted(self):
        body = client.post("/chat", json=HISTORY).json()
        assert body["mode"] == "stub"
        assert body["response"] in SALES_RESPONSES

    def test_invalid_body_is_422(self):
        assert client.post("/chat", json={"max_tokens": 10}).status_code == 422

    def test_model_reply_is_clamped(self, fake_llm):
        fake_llm(reply="One. Two! Three? Four.")
        body = client.post("/chat", json=HISTORY).json()
        assert body == {"response": "One. Two!", "mode": "model"}

    def test_company_facts_reach_system_prompt(self, fake_llm):
        llm = fake_llm(reply="Hello there.")
        client.post("/chat", json={**HISTORY, "company": {"name": "Bright Smile Dental"}})
        assert "Bright Smile Dental" in llm.calls[0]["messages"][0]["content"]

    def test_max_tokens_is_capped(self, fake_llm):
        llm = fake_llm(reply="Hi.")
        client.post("/chat", json={**HISTORY, "max_tokens": 10_000})
        assert llm.calls[0]["max_tokens"] <= 80

    def test_history_is_trimmed(self, fake_llm):
        llm = fake_llm(reply="Hi.")
        history = [{"role": "user", "content": f"m{i}"} for i in range(20)]
        client.post("/chat", json={"conversation_history": history})
        assert len(llm.calls[0]["messages"]) == 1 + 6

    def test_model_failure_falls_back_to_stub(self, fake_llm):
        fake_llm(fail=True)
        assert client.post("/chat", json=HISTORY).json()["mode"] == "stub"

    def test_empty_model_reply_falls_back_to_stub(self, fake_llm):
        fake_llm(reply="   ")
        assert client.post("/chat", json=HISTORY).json()["mode"] == "stub"


# ─── /qualify ─────────────────────────────────────────────────────────────────

class TestQualify:
    @pytest.mark.parametrize("transcript,outcome", [
        ("No thanks, not interested", "not-interested"),
        ("Can you call back next week?", "callback"),
        ("Please leave a message after the tone", "voicemail"),
        ("Yes, send me a demo", "qualified"),
        ("Hmm okay", "contacted"),
    ])
    def test_stub_keyword_outcomes(self, transcript, outcome):
        body = client.post("/qualify", json={"transcript": transcript}).json()
        assert body["outcome"] == outcome
        assert body["mode"] == "stub"
        assert 0 <= body["score"] <= 100

    def test_model_json_is_used(self, fake_llm):
        fake_llm(reply='Sure: {"outcome": "callback", "score": 150, "notes": "wants Friday"}')
        body = client.post("/qualify", json={"transcript": "call me Friday"}).json()
        assert body == {"outcome": "callback", "score": 100, "notes": "wants Friday", "mode": "model"}

    def test_unknown_model_outcome_falls_back(self, fake_llm):
        fake_llm(reply='{"outcome": "maybe", "score": 50}')
        assert client.post("/qualify", json={"transcript": "yes"}).json()["mode"] == "stub"

    def test_non_json_model_output_falls_back(self, fake_llm):
        fake_llm(reply="I think they were qualified")
        assert client.post("/qualify", json={"transcript": "yes"}).json()["outcome"] == "qualified"

    def test_missing_transcript_is_422(self):
        assert client.post("/qualify", json={}).status_code == 422


# ─── pure helpers ─────────────────────────────────────────────────────────────

class TestClampSentences:
    def test_keeps_decimals_intact(self):
        assert clamp_sentences("We are rated 4.9 stars. Want a demo? Great.") == "We are rated 4.9 stars. Want a demo?"

    def test_drops_trailing_fragment(self):
        assert clamp_sentences("Hello there. And then", limit=5) == "Hello there."

    def test_no_terminator_returns_text(self):
        assert clamp_sentences("  no punctuation  ") == "no punctuation"

    def test_zero_limit_disables_cap(self):
        assert clamp_sentences("A. B. C.", limit=0) == "A. B. C."


class TestPrompts:
    def test_keyword_outcomes_are_valid(self):
        for t in ["stop calling", "call back", "voicemail", "demo", "hello"]:
            assert keyword_qualify(t)["outcome"] in OUTCOMES

    def test_no_company_returns_base_prompt(self):
        assert build_system_prompt(None, "BASE") == "BASE"
