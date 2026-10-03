"""
Offline tests for the scraper parsers.

Every test here runs against a saved HTML fixture. Nothing in this file touches
the network: parsing is the part that breaks when a site changes its markup, and
it is the part worth pinning down.
"""

import scrapers
from scrapers import (
    ScrapedLead,
    estimate_engagement,
    extract_contacts,
    parse_count,
    parse_linkedin_profile,
    parse_nitter_users,
    parse_social_page,
    split_name,
)


# ── helpers ──────────────────────────────────────────────────────────────────

class TestParseCount:
    def test_plain_integer(self):
        assert parse_count("1234") == 1234

    def test_thousands_suffix(self):
        assert parse_count("1.2K") == 1200

    def test_millions_suffix(self):
        assert parse_count("3.5M") == 3_500_000

    def test_comma_separated(self):
        assert parse_count("10,000") == 10000

    def test_garbage_is_zero(self):
        assert parse_count("not a number") == 0

    def test_empty_is_zero(self):
        assert parse_count("") == 0
        assert parse_count(None) == 0


class TestSplitName:
    def test_first_and_last(self):
        assert split_name("Ahmed Al-Rashid") == ("Ahmed", "Al-Rashid")

    def test_single_word(self):
        assert split_name("Cher") == ("Cher", "")

    def test_three_parts_keeps_remainder_as_last(self):
        assert split_name("Maria del Carmen") == ("Maria", "del Carmen")

    def test_empty(self):
        assert split_name("") == ("", "")
        assert split_name(None) == ("", "")


class TestExtractContacts:
    def test_finds_email(self):
        assert extract_contacts("reach me at sam@acme.co")["email"] == "sam@acme.co"

    def test_finds_phone(self):
        got = extract_contacts("call +971 50 123 4567 anytime")
        assert "phone" in got

    def test_rejects_a_number_that_is_too_short(self):
        assert "phone" not in extract_contacts("we are 12345 strong")

    def test_finds_website(self):
        assert extract_contacts("more at acme.co/about")["website"].startswith("acme.co")

    def test_ignores_the_social_domain_itself(self):
        assert "website" not in extract_contacts("profile: linkedin.com/in/sam")

    def test_empty_text(self):
        assert extract_contacts("") == {}


class TestEstimateEngagement:
    def test_no_followers_is_neutral(self):
        assert estimate_engagement(0) == 50.0

    def test_micro_accounts_score_high(self):
        assert estimate_engagement(500) > estimate_engagement(500_000)

    def test_stays_within_feature_range(self):
        for n in (0, 10, 5_000, 50_000, 10_000_000):
            assert 0 <= estimate_engagement(n) <= 100


# ── LinkedIn ─────────────────────────────────────────────────────────────────

LINKEDIN_JSONLD = """
<html><head>
<script type="application/ld+json">
{"@type":"Person","name":"Ahmed Al-Rashid","jobTitle":"Chief Executive Officer",
 "worksFor":{"@type":"Organization","name":"TechCorp Dubai"},
 "address":{"@type":"PostalAddress","addressLocality":"Dubai","addressCountry":"AE"},
 "description":"Scaling B2B SaaS. Contact ahmed@techcorp.ae or visit techcorp.ae"}
</script>
</head><body></body></html>
"""

LINKEDIN_OG_ONLY = """
<html><head>
<meta property="og:title" content="Sarah Johnson | Marketing Director | LinkedIn"/>
<meta property="og:description" content="Growth marketer at GrowthCo in New York."/>
</head><body></body></html>
"""


class TestParseLinkedInProfile:
    def test_reads_the_jsonld_person_block(self):
        lead = parse_linkedin_profile(LINKEDIN_JSONLD, "https://linkedin.com/in/ahmed")

        assert lead.firstName == "Ahmed"
        assert lead.lastName == "Al-Rashid"
        assert lead.jobTitle == "Chief Executive Officer"
        assert lead.company == "TechCorp Dubai"
        assert lead.location == "Dubai, AE"
        assert lead.sourcePlatform == "linkedin"

    def test_pulls_contacts_out_of_the_bio(self):
        lead = parse_linkedin_profile(LINKEDIN_JSONLD)

        assert lead.email == "ahmed@techcorp.ae"
        assert lead.website.startswith("techcorp.ae")

    def test_falls_back_to_og_tags_when_there_is_no_jsonld(self):
        lead = parse_linkedin_profile(LINKEDIN_OG_ONLY, "https://linkedin.com/in/sarah")

        assert lead.firstName == "Sarah"
        assert lead.jobTitle == "Marketing Director"

    def test_handles_a_jsonld_graph_wrapper(self):
        html = """<script type="application/ld+json">
        {"@graph":[{"@type":"WebPage"},{"@type":"Person","name":"Lee Wong","jobTitle":"CTO"}]}
        </script>"""

        lead = parse_linkedin_profile(html)
        assert lead.firstName == "Lee"
        assert lead.jobTitle == "CTO"

    def test_handles_worksfor_given_as_a_list(self):
        html = """<script type="application/ld+json">
        {"@type":"Person","name":"Ann Diaz","worksFor":[{"name":"Acme"},{"name":"Old Co"}]}
        </script>"""

        assert parse_linkedin_profile(html).company == "Acme"

    def test_returns_none_for_empty_html(self):
        assert parse_linkedin_profile("") is None
        assert parse_linkedin_profile(None) is None

    def test_returns_none_for_a_page_with_no_profile_data(self):
        assert parse_linkedin_profile("<html><body>Sign in</body></html>") is None

    def test_survives_malformed_jsonld(self):
        html = '<script type="application/ld+json">{not json at all</script>'
        assert parse_linkedin_profile(html) is None


# ── Nitter / Twitter ─────────────────────────────────────────────────────────

NITTER_RESULTS = """
<html><body>
  <div class="timeline-item">
    <a class="fullname">Mohammed Khan</a>
    <a class="username">@mkhan</a>
    <div class="tweet-content">Founder @StartupPK. m.khan@startup.pk</div>
    <span class="profile-stat-num">12.5K</span>
  </div>
  <div class="timeline-item">
    <a class="fullname">Emma Mueller</a>
    <a class="username">@emmam</a>
    <div class="tweet-content">VP Sales, Berlin.</div>
  </div>
</body></html>
"""


class TestParseNitterUsers:
    def test_extracts_every_result_card(self):
        assert len(parse_nitter_users(NITTER_RESULTS)) == 2

    def test_splits_names_and_builds_the_profile_url(self):
        lead = parse_nitter_users(NITTER_RESULTS)[0]

        assert (lead.firstName, lead.lastName) == ("Mohammed", "Khan")
        assert lead.profileUrl == "https://twitter.com/mkhan"

    def test_reads_the_follower_count_and_derives_engagement(self):
        lead = parse_nitter_users(NITTER_RESULTS)[0]

        assert lead.followers == 12500
        assert lead.engagement == estimate_engagement(12500)

    def test_pulls_an_email_out_of_the_bio(self):
        assert parse_nitter_users(NITTER_RESULTS)[0].email == "m.khan@startup.pk"

    def test_handles_a_card_with_no_follower_count(self):
        lead = parse_nitter_users(NITTER_RESULTS)[1]

        assert lead.followers == 0
        assert lead.engagement == 50.0

    def test_empty_html_yields_nothing(self):
        assert parse_nitter_users("") == []
        assert parse_nitter_users("<html></html>") == []


# ── Facebook / Instagram ─────────────────────────────────────────────────────

FB_PAGE = """
<html><head>
<meta property="og:title" content="Dubai Dental Clinic - Home"/>
<meta property="og:description" content="4.2K followers. Book at dubaidental.ae or call +971 4 123 4567"/>
</head></html>
"""


class TestParseSocialPage:
    def test_reads_name_and_bio(self):
        lead = parse_social_page(FB_PAGE, "facebook", "https://facebook.com/dubaidental")

        assert lead.company == "Dubai Dental Clinic"
        assert lead.sourcePlatform == "facebook"
        assert lead.profileUrl.endswith("dubaidental")

    def test_reads_the_follower_count_from_the_description(self):
        assert parse_social_page(FB_PAGE, "facebook").followers == 4200

    def test_extracts_website_and_phone(self):
        lead = parse_social_page(FB_PAGE, "facebook")

        assert lead.website.startswith("dubaidental.ae")
        assert lead.phone

    def test_returns_none_without_og_tags(self):
        assert parse_social_page("<html><body>hi</body></html>", "facebook") is None

    def test_rejects_a_generic_platform_landing_page(self):
        html = '<meta property="og:title" content="Facebook - log in"/>'
        assert parse_social_page(html, "facebook") is None


# ── dispatcher ───────────────────────────────────────────────────────────────

class TestScrapeDispatcher:
    def test_unknown_platform_returns_empty_rather_than_raising(self):
        assert scrapers.scrape("myspace", "ceo", 5) == []

    def test_a_failing_scraper_degrades_to_empty(self, monkeypatch):
        def boom(query, max_results):
            raise RuntimeError("network down")

        monkeypatch.setitem(scrapers.SCRAPERS, "linkedin", boom)
        assert scrapers.scrape("linkedin", "ceo", 5) == []

    def test_platform_matching_is_case_insensitive(self, monkeypatch):
        monkeypatch.setitem(scrapers.SCRAPERS, "linkedin", lambda q, n: [ScrapedLead(firstName="X")])
        assert len(scrapers.scrape("LinkedIn", "ceo", 5)) == 1

    def test_demo_is_the_default_mode(self, monkeypatch):
        monkeypatch.setattr(scrapers, "SCRAPE_MODE", "demo")
        assert scrapers.is_live() is False

    def test_live_mode_is_opt_in(self, monkeypatch):
        monkeypatch.setattr(scrapers, "SCRAPE_MODE", "live")
        assert scrapers.is_live() is True


class TestScrapedLead:
    def test_serialises_to_the_shape_the_backend_expects(self):
        d = ScrapedLead(firstName="A", lastName="B", email="a@b.co").to_dict()

        for key in ("firstName", "lastName", "email", "phone", "company",
                    "jobTitle", "location", "website", "engagement"):
            assert key in key and key in d
