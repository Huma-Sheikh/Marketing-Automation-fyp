"""
Public-profile lead scrapers.

Ported from python-services/ml-training/colab_01_data_collection.py, which had a
working implementation that was never wired into this service — `/scrape` was
returning five hard-coded demo records instead.

Only the dependency-light strategies are ported here (requests + BeautifulSoup +
DuckDuckGo). The Selenium/TikTok path from the notebook is deliberately left out:
it needs a headless Chrome in the image, and a browser download inside a request
handler is not something this service should do.

Scope and etiquette
-------------------
* Public, unauthenticated pages only — no login, no private data.
* SCRAPE_MODE defaults to "demo" so development, tests and CI never touch third
  party sites. Set SCRAPE_MODE=live to enable real scraping.
* Requests are serialised with a randomised delay; see REQUEST_DELAY_RANGE.
* Scraping any platform is subject to that platform's terms of service and to
  local data-protection law. Enabling live mode is a deliberate operator choice.
"""

from __future__ import annotations

import json
import logging
import os
import random
import re
import time
from dataclasses import asdict, dataclass, field
from typing import List, Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

SCRAPE_MODE = os.getenv("SCRAPE_MODE", "demo").lower()
REQUEST_TIMEOUT = int(os.getenv("SCRAPE_TIMEOUT", "12"))
REQUEST_DELAY_RANGE = (2.5, 4.5)

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Public Nitter mirrors. They come and go constantly, so we probe for a live one
# and give up gracefully when none respond.
NITTER_INSTANCES = [
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
]


@dataclass
class ScrapedLead:
    """Shape the NestJS LeadsService expects back from /scrape."""
    firstName: str = ""
    lastName: str = ""
    email: str = ""
    phone: str = ""
    company: str = ""
    jobTitle: str = ""
    location: str = ""
    website: str = ""
    bio: str = ""
    profileUrl: str = ""
    followers: int = 0
    engagement: float = 50.0
    sourcePlatform: str = ""

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items()}


# ── shared helpers ───────────────────────────────────────────────────────────

def parse_count(text: str) -> int:
    """'1.2K' -> 1200, '3.5M' -> 3500000, '10,000' -> 10000."""
    if not text:
        return 0
    cleaned = str(text).strip().upper().replace(",", "").replace(" ", "")
    try:
        if cleaned.endswith("K"):
            return int(float(cleaned[:-1]) * 1_000)
        if cleaned.endswith("M"):
            return int(float(cleaned[:-1]) * 1_000_000)
        return int(float(cleaned))
    except (ValueError, TypeError):
        return 0


def split_name(full_name: str):
    parts = (full_name or "").strip().split(" ", 1)
    if not parts or not parts[0]:
        return "", ""
    return parts[0], (parts[1] if len(parts) > 1 else "")


EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
# Deliberately conservative: 9-15 digits with optional +, spaces, dashes, parens.
PHONE_RE = re.compile(r"\+?\d[\d\s().-]{7,17}\d")
URL_RE = re.compile(r"(?:https?://)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,}(?:/[^\s]*)?)", re.I)


def extract_contacts(text: str) -> dict:
    """Pull an email / phone / website out of a free-text bio."""
    if not text:
        return {}
    out = {}

    email = EMAIL_RE.search(text)
    if email:
        out["email"] = email.group(0)

    phone = PHONE_RE.search(text)
    if phone:
        digits = re.sub(r"\D", "", phone.group(0))
        if 9 <= len(digits) <= 15:
            out["phone"] = phone.group(0).strip()

    # Skip the social domains themselves — a linkedin.com URL is not a lead's site.
    for match in URL_RE.finditer(text):
        domain = match.group(1)
        if any(s in domain.lower() for s in ("linkedin.com", "twitter.com", "x.com",
                                             "instagram.com", "facebook.com", "t.co")):
            continue
        out["website"] = domain
        break

    return out


def estimate_engagement(followers: int) -> float:
    """
    Map a follower count onto the 0-100 engagement feature the scorer expects.
    Smaller accounts genuinely engage at a higher rate, so this is deliberately
    not linear in followers.
    """
    if followers <= 0:
        return 50.0
    if followers < 1_000:
        return 70.0
    if followers < 10_000:
        return 80.0
    if followers < 100_000:
        return 65.0
    return 45.0


def _polite_sleep():
    time.sleep(random.uniform(*REQUEST_DELAY_RANGE))


def _ddg_search(query: str, max_results: int = 20) -> List[dict]:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        logger.warning("duckduckgo-search is not installed - web-search scrapers unavailable")
        return []
    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception as e:
        logger.warning(f"DuckDuckGo search failed: {e}")
        return []


def _get(url: str) -> Optional[str]:
    try:
        r = requests.get(url, headers=BROWSER_HEADERS, timeout=REQUEST_TIMEOUT)
        return r.text if r.status_code == 200 else None
    except requests.RequestException as e:
        logger.debug(f"GET failed ({url}): {e}")
        return None


# ── LinkedIn ─────────────────────────────────────────────────────────────────
# Public profile pages embed a JSON-LD Person block; og: meta tags are the
# fallback. Both parsers below are pure functions so they can be tested against
# saved fixtures instead of the live site.

def parse_linkedin_profile(html: str, url: str = "") -> Optional[ScrapedLead]:
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")

    ld_tag = soup.find("script", {"type": "application/ld+json"})
    if ld_tag and ld_tag.string:
        try:
            data = json.loads(ld_tag.string)
            if isinstance(data, dict) and "@graph" in data:
                data = data["@graph"]
            if isinstance(data, list):
                data = next((d for d in data if d.get("@type") == "Person"), None)
            if isinstance(data, dict) and data.get("@type") == "Person":
                return _linkedin_from_jsonld(data, url)
        except (json.JSONDecodeError, AttributeError, KeyError):
            pass

    og_title = soup.find("meta", property="og:title")
    og_desc = soup.find("meta", property="og:description")
    if og_title and og_title.get("content"):
        parts = re.split(r"\s[|–-]\s", og_title["content"])
        if parts and "linkedin" not in parts[0].lower():
            first, last = split_name(parts[0].strip())
            bio = og_desc["content"] if og_desc and og_desc.get("content") else ""
            lead = ScrapedLead(
                firstName=first, lastName=last,
                jobTitle=parts[1].strip() if len(parts) > 1 else "",
                bio=bio, profileUrl=url, sourcePlatform="linkedin",
            )
            for key, value in extract_contacts(bio).items():
                setattr(lead, key, value)
            return lead
    return None


def _linkedin_from_jsonld(data: dict, url: str) -> ScrapedLead:
    first, last = split_name(data.get("name", ""))

    works_for = data.get("worksFor") or {}
    if isinstance(works_for, list):
        works_for = works_for[0] if works_for else {}
    company = works_for.get("name", "") if isinstance(works_for, dict) else ""

    address = data.get("address") or {}
    location = address.get("addressLocality", "") if isinstance(address, dict) else ""
    if location and isinstance(address, dict) and address.get("addressCountry"):
        location = f"{location}, {address['addressCountry']}"

    bio = data.get("description", "") or ""
    lead = ScrapedLead(
        firstName=first, lastName=last,
        jobTitle=data.get("jobTitle", "") or "",
        company=company, location=location, bio=bio,
        profileUrl=url or data.get("url", ""), sourcePlatform="linkedin",
    )
    for key, value in extract_contacts(bio).items():
        setattr(lead, key, value)
    return lead


def scrape_linkedin(query: str, max_results: int) -> List[ScrapedLead]:
    ddg_query = f'site:linkedin.com/in/ "{query}"'
    logger.info(f"LinkedIn search: {ddg_query}")

    urls = [
        r["href"] for r in _ddg_search(ddg_query, max_results=max_results * 2)
        if "linkedin.com/in/" in r.get("href", "") and "linkedin.com/in/?" not in r["href"]
    ][:max_results]

    leads = []
    for url in urls:
        lead = parse_linkedin_profile(_get(url), url)
        if lead and (lead.firstName or lead.company):
            leads.append(lead)
        _polite_sleep()
    return leads


# ── Twitter / X via Nitter ───────────────────────────────────────────────────

def parse_nitter_users(html: str) -> List[ScrapedLead]:
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    leads = []

    for card in soup.select(".timeline-item"):
        name_el = card.select_one("a.fullname")
        handle_el = card.select_one("a.username")
        bio_el = card.select_one(".tweet-content, .profile-bio")
        if not name_el:
            continue

        first, last = split_name(name_el.get_text(strip=True))
        bio = bio_el.get_text(" ", strip=True) if bio_el else ""
        handle = handle_el.get_text(strip=True).lstrip("@") if handle_el else ""

        followers = 0
        stat = card.select_one(".profile-stat-num")
        if stat:
            followers = parse_count(stat.get_text(strip=True))

        lead = ScrapedLead(
            firstName=first, lastName=last, bio=bio,
            profileUrl=f"https://twitter.com/{handle}" if handle else "",
            followers=followers, engagement=estimate_engagement(followers),
            sourcePlatform="twitter",
        )
        for key, value in extract_contacts(bio).items():
            setattr(lead, key, value)
        leads.append(lead)

    return leads


def _working_nitter() -> Optional[str]:
    for base in NITTER_INSTANCES:
        try:
            if requests.get(base, headers=BROWSER_HEADERS, timeout=6).status_code == 200:
                return base
        except requests.RequestException:
            continue
    logger.warning("No Nitter instance reachable - Twitter scraping unavailable")
    return None


def scrape_twitter(query: str, max_results: int) -> List[ScrapedLead]:
    base = _working_nitter()
    if not base:
        return []
    html = _get(f"{base}/search?f=users&q={requests.utils.quote(query)}")
    return parse_nitter_users(html)[:max_results]


# ── Facebook / Instagram public pages via web search ─────────────────────────

def parse_social_page(html: str, platform: str, url: str = "") -> Optional[ScrapedLead]:
    """Read the og: meta block that public FB/IG pages expose."""
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")

    title = soup.find("meta", property="og:title")
    desc = soup.find("meta", property="og:description")
    if not title or not title.get("content"):
        return None

    name = re.split(r"\s[|–-]\s", title["content"])[0].strip()
    if not name or platform in name.lower():
        return None

    bio = desc["content"] if desc and desc.get("content") else ""
    first, last = split_name(name)

    followers = 0
    follower_match = re.search(r"([\d.,]+[KM]?)\s+(?:followers|likes)", bio, re.I)
    if follower_match:
        followers = parse_count(follower_match.group(1))

    lead = ScrapedLead(
        firstName=first, lastName=last, company=name, bio=bio,
        profileUrl=url, followers=followers,
        engagement=estimate_engagement(followers), sourcePlatform=platform,
    )
    for key, value in extract_contacts(bio).items():
        setattr(lead, key, value)
    return lead


def _scrape_via_search(query: str, platform: str, site: str, max_results: int) -> List[ScrapedLead]:
    urls = [
        r["href"] for r in _ddg_search(f'site:{site} "{query}"', max_results=max_results * 2)
        if site in r.get("href", "")
    ][:max_results]

    leads = []
    for url in urls:
        lead = parse_social_page(_get(url), platform, url)
        if lead:
            leads.append(lead)
        _polite_sleep()
    return leads


def scrape_facebook(query: str, max_results: int) -> List[ScrapedLead]:
    return _scrape_via_search(query, "facebook", "facebook.com", max_results)


def scrape_instagram(query: str, max_results: int) -> List[ScrapedLead]:
    return _scrape_via_search(query, "instagram", "instagram.com", max_results)


# ── dispatcher ───────────────────────────────────────────────────────────────

SCRAPERS = {
    "linkedin": scrape_linkedin,
    "twitter": scrape_twitter,
    "facebook": scrape_facebook,
    "instagram": scrape_instagram,
}

SUPPORTED_PLATFORMS = sorted(SCRAPERS)


def is_live() -> bool:
    return SCRAPE_MODE == "live"


def scrape(platform: str, query: str, max_results: int = 20) -> List[ScrapedLead]:
    """
    Run the scraper for one platform. Returns [] (never raises) so a dead mirror
    or a blocked request degrades to "no leads found" rather than a 500.
    """
    scraper = SCRAPERS.get((platform or "").lower())
    if not scraper:
        logger.warning(f"No scraper for platform '{platform}'")
        return []
    try:
        return scraper(query, max_results)
    except Exception as e:
        logger.error(f"{platform} scrape failed: {e}")
        return []
