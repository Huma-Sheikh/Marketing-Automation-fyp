"""
Unit + integration tests for the business scraper + sentiment service.
Runs entirely in stub mode (no Google API key, no trained models required).
Run: pytest python-services/business-service/test_main.py -v
"""

import pytest
from fastapi.testclient import TestClient

import main  # noqa: F401  (builds the app and runs load_models)
from app import business, classification, models
from app.reference_data import REGIONS

# Force stub mode regardless of what is installed or present in model/.
models.sentiment_model = None
models.category_model = None

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def no_google_key(monkeypatch):
    """Never reach the real Places API from tests."""
    monkeypatch.setattr(business, "GOOGLE_API_KEY", "")


class FakePipeline:
    """Stands in for a transformers text-classification pipeline."""

    def __init__(self, label, score=0.99, fail=False):
        self.label, self.score, self.fail = label, score, fail

    def __call__(self, text):
        if self.fail:
            raise RuntimeError("boom")
        return [{"label": self.label, "score": self.score}]


# ─── /health and /regions ─────────────────────────────────────────────────────

class TestHealth:
    def test_returns_200(self):
        assert client.get("/health").status_code == 200

    def test_reports_stub_state(self):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["sentiment_loaded"] is False
        assert body["category_model_loaded"] is False
        assert body["google_api"] in (True, False)

    def test_lists_regions_and_categories(self):
        body = client.get("/health").json()
        assert "ae-dubai" in body["available_regions"]
        assert len(body["business_categories"]) == 10


class TestRegions:
    def test_every_region_has_code_and_label(self):
        regions = client.get("/regions").json()["regions"]
        assert len(regions) == len(REGIONS)
        for r in regions:
            assert r["code"] in REGIONS
            assert r["label"] == REGIONS[r["code"]]["label"]


# ─── /search ──────────────────────────────────────────────────────────────────

class TestSearch:
    def test_stub_results_for_free_text_location(self):
        resp = client.post("/search", json={"location": "Dubai", "category": "restaurant", "max_results": 3})
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        assert body["location"] == "Dubai"
        assert body["businesses"][0]["phone"].startswith("+971")

    def test_region_code_resolves_location(self):
        body = client.post("/search", json={"location": "x", "category": "dentist", "region_code": "ae-dubai"}).json()
        assert body["location"] == REGIONS["ae-dubai"]["location"]
        assert body["region_code"] == "ae-dubai"

    def test_location_may_itself_be_a_region_code(self):
        body = client.post("/search", json={"location": "qa-doha", "category": "cafe"}).json()
        assert body["location"] == REGIONS["qa-doha"]["location"]

    def test_stub_count_is_capped(self):
        body = client.post("/search", json={"location": "London", "category": "gym", "max_results": 100}).json()
        assert body["total"] == 8

    def test_stub_business_shape(self):
        biz = client.post("/search", json={"location": "Dubai", "category": "restaurant", "max_results": 1}).json()["businesses"][0]
        for key in ("name", "phone", "rating", "review_count", "sentiment", "sentiment_score",
                    "opportunity", "business_category", "place_id"):
            assert key in biz
        assert biz["business_category"] == "Food & Beverage"

    def test_missing_required_field_is_422(self):
        assert client.post("/search", json={"location": "Dubai"}).status_code == 422

    def test_places_failure_falls_back_to_stub(self, monkeypatch):
        async def explode(**kwargs):
            raise RuntimeError("upstream down")
        monkeypatch.setattr(business, "GOOGLE_API_KEY", "fake-key")
        monkeypatch.setattr(business, "search_google_places", explode)
        body = client.post("/search", json={"location": "Dubai", "category": "bank", "max_results": 2}).json()
        assert body["total"] == 2
        assert body["businesses"][0]["place_id"].startswith("stub_")


# ─── /find-opportunities ──────────────────────────────────────────────────────

class TestFindOpportunities:
    def test_sorted_worst_first_with_outreach(self):
        body = client.post("/find-opportunities", json={"location": "Dubai", "category": "restaurant", "max_results": 5}).json()
        ratings = [b["rating"] for b in body["businesses"]]
        assert ratings == sorted(ratings)
        for b in body["businesses"]:
            assert b["name"] in b["outreach_script"]
            assert b["contact_info"]["can_call"] is True


# ─── /analyze ─────────────────────────────────────────────────────────────────

class TestAnalyze:
    def test_returns_one_result_per_text(self):
        body = client.post("/analyze", json={"texts": ["Great!", "Awful."]}).json()
        assert body["total"] == 2
        assert {r["text"] for r in body["results"]} == {"Great!", "Awful."}

    def test_without_models_sentiment_is_neutral(self):
        r = client.post("/analyze", json={"texts": ["anything"]}).json()["results"][0]
        assert r["sentiment"] == "NEUTRAL"
        assert r["category"] == "Professional Services"

    def test_category_can_be_skipped(self):
        r = client.post("/analyze", json={"texts": ["x"], "include_category": False}).json()["results"][0]
        assert r["category"] == ""

    def test_long_text_is_truncated(self):
        r = client.post("/analyze", json={"texts": ["a" * 1000]}).json()["results"][0]
        assert len(r["text"]) == 200

    def test_text_count_is_capped(self):
        assert client.post("/analyze", json={"texts": ["t"] * 250}).json()["total"] == 200


# ─── classification (pure functions) ─────────────────────────────────────────

class TestRatingToSentiment:
    @pytest.mark.parametrize("rating,label", [(None, "NEUTRAL"), (1.0, "NEGATIVE"), (3.5, "NEUTRAL"), (4.5, "POSITIVE")])
    def test_bands(self, rating, label):
        assert classification.rating_to_sentiment(rating)[0] == label


class TestAnalyzeSentimentWithModel:
    @pytest.mark.parametrize("raw,expected", [("LABEL_0", "NEGATIVE"), ("LABEL_2", "POSITIVE"),
                                              ("positive", "POSITIVE"), ("LABEL_1", "NEUTRAL")])
    def test_label_normalisation(self, monkeypatch, raw, expected):
        monkeypatch.setattr(models, "sentiment_model", FakePipeline(raw))
        assert classification.analyze_sentiment("some review", None)[0] == expected

    def test_model_failure_uses_rating(self, monkeypatch):
        monkeypatch.setattr(models, "sentiment_model", FakePipeline("x", fail=True))
        assert classification.analyze_sentiment("text", 1.0)[0] == "NEGATIVE"


class TestCategory:
    def test_types_win_over_model(self, monkeypatch):
        monkeypatch.setattr(models, "category_model", FakePipeline("LABEL_0"))
        assert classification.classify_business_category("Smile", ["dentist"]) == "Healthcare & Wellness"

    def test_generic_types_have_no_signal(self):
        assert classification.category_from_types(["point_of_interest", "establishment"]) is None

    def test_confident_model_used_when_no_types(self, monkeypatch):
        monkeypatch.setattr(models, "category_model", FakePipeline("LABEL_3", score=0.9))
        assert classification.classify_business_category("Acme", []) == models.business_categories[3]

    def test_unconfident_model_falls_back(self, monkeypatch):
        monkeypatch.setattr(models, "category_model", FakePipeline("LABEL_3", score=0.1))
        assert classification.classify_business_category("Acme", []) == "Professional Services"
