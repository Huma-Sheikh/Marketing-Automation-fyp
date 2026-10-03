"""
=============================================================================
  NO-AUTH LEAD SCRAPER — LinkedIn · Twitter/X · Instagram · TikTok · Facebook
  Marketing Automation FYP — Google Colab Free Tier
=============================================================================

NO ACCOUNTS OR API KEYS REQUIRED FOR ANY PLATFORM.

How each platform is scraped (publicly accessible data only):
  LinkedIn   → DuckDuckGo  site:linkedin.com/in/  →  public profile JSON-LD
  Twitter/X  → Nitter public mirrors (open-source Twitter frontend, zero auth)
  Instagram  → instaloader no-login mode (public hashtag posts + profiles)
  TikTok     → Selenium headless Chrome  (public creator search page)
  Facebook   → DuckDuckGo  site:facebook.com  →  public page meta tags

OUTPUT:
  leads_<timestamp>.csv   — one row per lead, all platforms combined
  leads_<timestamp>.json  — same data as JSON
  Saved to Google Drive if mounted, else to /content/ (lost on disconnect)
=============================================================================
"""

# ═══════════════════════════════════════════════════════════════════════════
# CELL 1 — Install packages + Chromium  (run this cell first in Colab)
# ═══════════════════════════════════════════════════════════════════════════

"""
# Paste into Colab Cell 1:

# Chromium is needed for TikTok scraping (JavaScript-heavy page)
!apt-get update -qq
!apt-get install -yq chromium-browser chromium-chromedriver 2>/dev/null

!pip install -q \
    requests==2.31.0 \
    beautifulsoup4==4.12.2 \
    selenium==4.16.0 \
    webdriver-manager==4.0.1 \
    duckduckgo-search==3.9.6 \
    pandas==2.1.4 \
    tqdm==4.66.1 \
    python-dateutil==2.8.2 \
    openpyxl==3.1.2

from google.colab import drive
drive.mount('/content/drive')
print("Setup complete.")
"""

# ═══════════════════════════════════════════════════════════════════════════
# CELL 2 — Imports
# ═══════════════════════════════════════════════════════════════════════════

import json
import logging
import random
import re
import time
import uuid
import warnings
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import pandas as pd
import requests
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("scraper")

# ── Output paths ─────────────────────────────────────────────────────────
DRIVE_ROOT = (
    Path("/content/drive/MyDrive/marketing_fyp")
    if Path("/content/drive/MyDrive").exists()
    else Path("/content")
)
DATA_DIR = DRIVE_ROOT / "leads"
DATA_DIR.mkdir(parents=True, exist_ok=True)

if DRIVE_ROOT != Path("/content"):
    logger.info(f"Google Drive mounted. Leads will be saved to: {DATA_DIR}")
else:
    logger.warning("Drive not mounted — leads saved to /content (lost on disconnect).")

# ── Nitter instances — tried in order, first working one is used ──────────
NITTER_INSTANCES = [
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
    "https://nitter.cz",
    "https://nitter.1d4.us",
    "https://nitter.kavin.rocks",
    "https://nitter.lucabased.xyz",
]

# ── Browser headers — looks like a real Chrome visit ─────────────────────
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


# ═══════════════════════════════════════════════════════════════════════════
# CELL 3 — Lead schema
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class Lead:
    platform:        str   = ""
    full_name:       str   = ""
    first_name:      str   = ""
    last_name:       str   = ""
    headline:        str   = ""
    bio:             str   = ""
    email:           str   = ""
    phone:           str   = ""
    company:         str   = ""
    job_title:       str   = ""
    location:        str   = ""
    website:         str   = ""
    profile_url:     str   = ""
    followers:       int   = 0
    following:       int   = 0
    engagement_rate: float = 0.0
    scraped_at:      str   = field(default_factory=lambda: datetime.now().isoformat())
    id:              str   = field(default_factory=lambda: str(uuid.uuid4())[:8])


# ═══════════════════════════════════════════════════════════════════════════
# CELL 4 — Shared utilities
# ═══════════════════════════════════════════════════════════════════════════

def _parse_count(text: str) -> int:
    """Convert '1.2K', '3.5M', '10,000' → int."""
    text = text.strip().upper().replace(",", "").replace(" ", "")
    try:
        if "K" in text:
            return int(float(text.replace("K", "")) * 1_000)
        if "M" in text:
            return int(float(text.replace("M", "")) * 1_000_000)
        return int(float(text))
    except (ValueError, AttributeError):
        return 0


def _split_name(full_name: str):
    parts = full_name.strip().split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else "")


def _ddg_search(query: str, max_results: int = 20) -> List[dict]:
    """DuckDuckGo text search. Returns list of {title, href, body} dicts."""
    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception as e:
        logger.warning(f"DuckDuckGo search failed: {e}")
        return []


def _create_selenium_driver() -> webdriver.Chrome:
    """Create a headless Chrome driver. Works on Colab and local."""
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1920,1080")
    opts.add_argument(f"--user-agent={BROWSER_HEADERS['User-Agent']}")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])

    # FIX: apt-get places chromedriver at /usr/bin/chromedriver, NOT
    # /usr/lib/chromium-browser/chromedriver. Try all known Colab paths.
    COLAB_PAIRS = [
        ("/usr/bin/chromium-browser", "/usr/bin/chromedriver"),
        ("/usr/bin/chromium-browser", "/usr/lib/chromium-browser/chromedriver"),
        ("/usr/bin/chromium",         "/usr/bin/chromedriver"),
        ("/usr/bin/google-chrome-stable", "/usr/bin/chromedriver"),
    ]
    for chrome_bin, driver_path in COLAB_PAIRS:
        if Path(chrome_bin).exists() and Path(driver_path).exists():
            opts.binary_location = chrome_bin
            try:
                logger.info(f"  Chrome: {chrome_bin}  driver: {driver_path}")
                return webdriver.Chrome(service=Service(driver_path), options=opts)
            except Exception as e:
                logger.debug(f"  Chrome pair failed ({driver_path}): {e}")
                continue

    # Fallback: webdriver-manager downloads the matching driver automatically
    from webdriver_manager.chrome import ChromeDriverManager
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)


# ═══════════════════════════════════════════════════════════════════════════
# CELL 5 — LinkedIn scraper  (no account needed)
# ═══════════════════════════════════════════════════════════════════════════
#
# Strategy:
#   1. DuckDuckGo  site:linkedin.com/in/ "job title" "city"  → profile URLs
#   2. GET each public LinkedIn profile page
#   3. Extract the JSON-LD <script type="application/ld+json"> block
#      which LinkedIn embeds on all public profile pages — contains
#      structured Person data (name, jobTitle, worksFor, address, description)
#   4. Fall back to <meta property="og:title"> if no JSON-LD found

class LinkedInScraper:
    def search(
        self,
        query: str,
        location: str = "",
        max_results: int = 20,
    ) -> List[Lead]:
        ddg_query = f'site:linkedin.com/in/ "{query}"'
        if location:
            ddg_query += f' "{location}"'

        logger.info(f"  LinkedIn: searching for → {ddg_query}")
        results = _ddg_search(ddg_query, max_results=max_results * 2)

        profile_urls = [
            r["href"]
            for r in results
            if "linkedin.com/in/" in r["href"]
            and "linkedin.com/in/?" not in r["href"]
        ][:max_results]

        leads = []
        for url in profile_urls:
            lead = self._scrape_profile(url)
            if lead:
                leads.append(lead)
            time.sleep(random.uniform(2.5, 4.5))

        logger.info(f"  LinkedIn: {len(leads)} leads scraped")
        return leads

    def _scrape_profile(self, url: str) -> Optional[Lead]:
        try:
            r = requests.get(url, headers=BROWSER_HEADERS, timeout=12)
            if r.status_code != 200:
                return None
            soup = BeautifulSoup(r.text, "html.parser")

            # Try JSON-LD (most structured, always present on public pages)
            ld_tag = soup.find("script", {"type": "application/ld+json"})
            if ld_tag and ld_tag.string:
                try:
                    data = json.loads(ld_tag.string)
                    if isinstance(data, list):
                        data = next((d for d in data if d.get("@type") == "Person"), data[0])
                    if data.get("@type") == "Person":
                        return self._from_jsonld(data, url)
                except (json.JSONDecodeError, IndexError, KeyError):
                    pass

            # Fallback: og:title  "Name | Job | LinkedIn"
            og_title = soup.find("meta", property="og:title")
            og_desc  = soup.find("meta", property="og:description")
            if og_title and og_title.get("content"):
                parts = re.split(r"\s[|–\-]\s", og_title["content"])
                if len(parts) >= 2 and "linkedin" not in parts[0].lower():
                    name      = parts[0].strip()
                    job_title = parts[1].strip() if len(parts) > 1 else ""
                    bio       = og_desc["content"] if og_desc and og_desc.get("content") else ""
                    fn, ln    = _split_name(name)
                    return Lead(
                        platform="linkedin", full_name=name,
                        first_name=fn, last_name=ln,
                        job_title=job_title, bio=bio,
                        headline=job_title, profile_url=url,
                    )
        except Exception as e:
            logger.debug(f"LinkedIn profile error ({url}): {e}")
        return None

    @staticmethod
    def _from_jsonld(data: dict, url: str) -> Lead:
        name     = data.get("name", "")
        fn, ln   = _split_name(name)
        works_for = data.get("worksFor", {})
        company  = works_for.get("name", "") if isinstance(works_for, dict) else ""
        address  = data.get("address", {})
        location = address.get("addressLocality", "") if isinstance(address, dict) else ""
        return Lead(
            platform="linkedin", full_name=name,
            first_name=fn, last_name=ln,
            job_title=data.get("jobTitle", ""),
            company=company, location=location,
            bio=data.get("description", ""),
            headline=data.get("jobTitle", ""),
            profile_url=url,
        )


# ═══════════════════════════════════════════════════════════════════════════
# CELL 6 — Twitter/X scraper via Nitter  (no account needed)
# ═══════════════════════════════════════════════════════════════════════════
#
# Strategy:
#   Nitter is an open-source Twitter frontend that serves plain HTML — no
#   JavaScript, no login, no API key. We try each instance in NITTER_INSTANCES
#   until one responds, then search /search?q=...&f=users.
#   If every instance is down, the scraper logs a warning and returns [].

class TwitterScraper:
    def _working_instance(self) -> Optional[str]:
        for base in NITTER_INSTANCES:
            try:
                r = requests.get(base, headers=BROWSER_HEADERS, timeout=6)
                if r.status_code == 200 and "nitter" in r.text.lower():
                    logger.info(f"  Twitter: using Nitter instance {base}")
                    return base
            except Exception:
                continue
        return None

    def search(self, query: str, max_results: int = 20) -> List[Lead]:
        instance = self._working_instance()
        if not instance:
            logger.warning("  Twitter: all Nitter instances unreachable — skipping.")
            return []

        url = f"{instance}/search?q={requests.utils.quote(query)}&f=users"
        try:
            r = requests.get(url, headers=BROWSER_HEADERS, timeout=15)
            soup = BeautifulSoup(r.text, "html.parser")
            leads = self._parse_cards(soup)
            logger.info(f"  Twitter: {len(leads)} leads scraped")
            return leads[:max_results]
        except Exception as e:
            logger.warning(f"  Twitter: Nitter search error — {e}")
            return []

    @staticmethod
    def _parse_cards(soup: BeautifulSoup) -> List[Lead]:
        leads = []
        cards = soup.find_all("div", class_="timeline-item")
        if not cards:
            cards = soup.find_all("div", class_="user-card")

        for card in cards:
            try:
                fn_el  = card.find("a", class_="fullname") or card.find("span", class_="fullname")
                un_el  = card.find("a", class_="username") or card.find("span", class_="username")
                bio_el = (
                    card.find("div", class_="tweet-content")
                    or card.find("p", class_="bio-text")
                    or card.find("div", class_="bio")
                )

                if not fn_el:
                    continue

                name     = fn_el.get_text(strip=True)
                username = un_el.get_text(strip=True).lstrip("@") if un_el else ""
                bio      = bio_el.get_text(strip=True) if bio_el else ""

                followers = 0
                for stat in card.find_all("span", class_=re.compile(r"tweet-stat|stat")):
                    txt = stat.get_text(strip=True)
                    if re.search(r"follower", txt, re.I):
                        num_match = re.search(r"[\d.,KkMm]+", txt)
                        if num_match:
                            followers = _parse_count(num_match.group())

                fn, ln = _split_name(name)
                leads.append(Lead(
                    platform="twitter",
                    full_name=name, first_name=fn, last_name=ln,
                    bio=bio, headline=bio[:120],
                    followers=followers,
                    profile_url=f"https://twitter.com/{username}" if username else "",
                ))
            except Exception:
                continue
        return leads


# ═══════════════════════════════════════════════════════════════════════════
# CELL 7 — Instagram scraper  (no account needed)
# ═══════════════════════════════════════════════════════════════════════════
#
# Strategy:
#   Instagram blocked unauthenticated hashtag API access in 2023
#   (instaloader Hashtag.from_name() → 404).
#
#   FIX: Use DuckDuckGo  site:instagram.com "query"  to discover profile URLs,
#   then GET each public profile page and extract the og:title / og:description
#   meta tags that Instagram always includes on public profiles.
#   og:description contains: "X Followers, Y Following, Z Posts — ..."
#   so we can parse follower counts without any API or login.

class InstagramScraper:
    def search(
        self,
        query: str,
        location: str = "",
        max_results: int = 20,
    ) -> List[Lead]:
        ddg_query = f'site:instagram.com "{query}"'
        if location:
            ddg_query += f' "{location}"'

        logger.info(f"  Instagram: searching for → {ddg_query}")
        results = _ddg_search(ddg_query, max_results=max_results * 3)

        # Keep only profile URLs — skip individual post/reel/explore links
        profile_urls = [
            r["href"] for r in results
            if re.match(r"https?://(?:www\.)?instagram\.com/[\w.]+/?$", r["href"])
            and "/explore/" not in r["href"]
        ]
        # Deduplicate while preserving order
        seen_urls: set = set()
        unique_urls = []
        for u in profile_urls:
            if u not in seen_urls:
                seen_urls.add(u)
                unique_urls.append(u)

        leads = []
        for url in unique_urls[:max_results]:
            lead = self._scrape_profile(url)
            if lead:
                leads.append(lead)
            time.sleep(random.uniform(2, 3.5))

        logger.info(f"  Instagram: {len(leads)} leads scraped")
        return leads

    @staticmethod
    def _scrape_profile(url: str) -> Optional[Lead]:
        try:
            r = requests.get(url, headers=BROWSER_HEADERS, timeout=12)
            if r.status_code != 200:
                return None
            soup = BeautifulSoup(r.text, "html.parser")

            og_title = soup.find("meta", property="og:title")
            og_desc  = soup.find("meta", property="og:description")

            if not og_title or not og_title.get("content"):
                return None

            title_text = og_title["content"]
            # Format: "Name (@handle) • Instagram photos and videos"
            name_match = re.match(r"^(.+?)\s*\(@?([\w.]+)\)", title_text)
            if name_match:
                name     = name_match.group(1).strip()
                username = name_match.group(2).strip()
            else:
                name     = title_text.split("•")[0].split("(")[0].strip()
                username = re.search(r"instagram\.com/([\w.]+)", url)
                username = username.group(1) if username else ""

            desc = og_desc["content"] if og_desc and og_desc.get("content") else ""

            # og:description: "X Followers, Y Following, Z Posts - See Instagram..."
            followers = 0
            fol_match = re.search(r"([\d,.KkMm]+)\s+Followers", desc, re.I)
            if fol_match:
                followers = _parse_count(fol_match.group(1).replace(",", ""))

            if not name or name.lower() in ("instagram", ""):
                return None

            fn, ln = _split_name(name)
            return Lead(
                platform="instagram",
                full_name=name, first_name=fn, last_name=ln,
                bio=desc, headline=desc[:120],
                followers=followers,
                profile_url=url,
                website=url,
            )
        except Exception as e:
            logger.debug(f"Instagram profile error ({url}): {e}")
            return None


# ═══════════════════════════════════════════════════════════════════════════
# CELL 8 — TikTok scraper via Selenium  (no account needed)
# ═══════════════════════════════════════════════════════════════════════════
#
# Strategy:
#   Navigate to tiktok.com/search/user?q=<keyword> with headless Chrome.
#   TikTok renders creator cards in the DOM with data-e2e attributes.
#   We read: unique ID (handle), display name, bio, follower count.
#
# Note: TikTok's CSS selectors change on each frontend deploy. If the primary
# selector returns nothing the scraper falls back to a class-based scan.

class TikTokScraper:
    def __init__(self, driver: webdriver.Chrome):
        self.driver = driver

    def search(self, keyword: str, max_results: int = 20) -> List[Lead]:
        url = f"https://www.tiktok.com/search/user?q={requests.utils.quote(keyword)}"
        leads = []
        try:
            self.driver.get(url)
            try:
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located(
                        (By.CSS_SELECTOR, '[data-e2e="search-user-info-container"], .user-item-wrapper')
                    )
                )
            except Exception:
                time.sleep(5)

            cards = self.driver.find_elements(
                By.CSS_SELECTOR, '[data-e2e="search-user-info-container"]'
            )
            if not cards:
                cards = self.driver.find_elements(By.CSS_SELECTOR, ".user-item-wrapper, .user-card")

            for card in cards[:max_results]:
                lead = self._parse_card(card)
                if lead:
                    leads.append(lead)
        except Exception as e:
            logger.warning(f"  TikTok: Selenium error — {e}")

        logger.info(f"  TikTok: {len(leads)} leads scraped")
        return leads

    def _parse_card(self, card) -> Optional[Lead]:
        def safe(selector: str) -> str:
            try:
                return card.find_element(By.CSS_SELECTOR, selector).text.strip()
            except Exception:
                return ""

        handle  = safe('[data-e2e="search-user-unique-id"]') or safe(".username")
        disp    = safe('[data-e2e="search-user-name"]') or safe(".nickname")
        bio     = safe('[data-e2e="search-user-bio"]') or safe(".user-bio")
        fol_raw = safe('[data-e2e="search-user-follower-count"]') or safe(".follower-count")

        if not handle and not disp:
            return None

        name   = disp or handle
        fn, ln = _split_name(name)
        return Lead(
            platform="tiktok",
            full_name=name, first_name=fn, last_name=ln,
            bio=bio, headline=bio[:120],
            followers=_parse_count(fol_raw),
            profile_url=f"https://www.tiktok.com/@{handle}" if handle else "",
        )


# ═══════════════════════════════════════════════════════════════════════════
# CELL 9 — Facebook scraper  (no account needed)
# ═══════════════════════════════════════════════════════════════════════════
#
# Strategy:
#   DuckDuckGo  site:facebook.com "<query>" "<location>"  → page URLs
#   GET each Facebook URL — public page meta tags (og:title, og:description)
#   are present in the raw HTML served to non-logged-in visitors.

class FacebookScraper:
    def search(
        self,
        query: str,
        location: str = "",
        max_results: int = 20,
    ) -> List[Lead]:
        ddg_query = f'site:facebook.com "{query}"'
        if location:
            ddg_query += f' "{location}"'

        logger.info(f"  Facebook: searching for → {ddg_query}")
        results = _ddg_search(ddg_query, max_results=max_results * 2)

        fb_urls = [
            r["href"] for r in results
            if "facebook.com" in r["href"]
            and "login" not in r["href"]
            and "l.facebook.com" not in r["href"]
            and "/sharer" not in r["href"]
        ][:max_results]

        leads = []
        for url in fb_urls:
            lead = self._scrape_page(url)
            if lead:
                leads.append(lead)
            time.sleep(random.uniform(2, 3.5))

        logger.info(f"  Facebook: {len(leads)} leads scraped")
        return leads

    @staticmethod
    def _scrape_page(url: str) -> Optional[Lead]:
        try:
            r = requests.get(url, headers=BROWSER_HEADERS, timeout=12)
            if r.status_code not in (200, 302):
                return None
            soup = BeautifulSoup(r.text, "html.parser")

            og_title  = soup.find("meta", property="og:title")
            og_desc   = soup.find("meta", property="og:description")
            meta_desc = soup.find("meta", attrs={"name": "description"})
            title_tag = soup.find("title")

            name = ""
            if og_title and og_title.get("content"):
                name = og_title["content"].strip()
            elif title_tag:
                name = (
                    title_tag.get_text(strip=True)
                    .replace("| Facebook", "").replace("- Facebook", "").strip()
                )

            if not name or name.lower() in ("facebook", "log into facebook", ""):
                return None

            bio = ""
            if og_desc and og_desc.get("content"):
                bio = og_desc["content"].strip()
            elif meta_desc and meta_desc.get("content"):
                bio = meta_desc["content"].strip()

            fn, ln = _split_name(name)
            return Lead(
                platform="facebook",
                full_name=name, first_name=fn, last_name=ln,
                company=name, bio=bio, headline=bio[:120],
                profile_url=url,
            )
        except Exception as e:
            logger.debug(f"Facebook page error ({url}): {e}")
            return None


# ═══════════════════════════════════════════════════════════════════════════
# CELL 10 — UnifiedScraper — orchestrates all 5 platforms
# ═══════════════════════════════════════════════════════════════════════════

class UnifiedScraper:
    def __init__(self):
        self._driver: Optional[webdriver.Chrome] = None

    def _get_driver(self) -> webdriver.Chrome:
        if self._driver is None:
            logger.info("Starting headless Chrome for TikTok...")
            self._driver = _create_selenium_driver()
        return self._driver

    def scrape(
        self,
        query: str,
        location: str = "",
        max_per_platform: int = 20,
        platforms: Optional[List[str]] = None,
    ) -> pd.DataFrame:
        """
        Scrape leads from all (or selected) platforms.

        Args:
            query:            Search keyword, e.g. "digital marketing agency"
            location:         City or country, e.g. "Dubai"
            max_per_platform: Max leads per platform (5 × 20 = up to 100 total)
            platforms:        Subset list, e.g. ["linkedin", "instagram"]
                              Defaults to all 5 if None.

        Returns:
            DataFrame with one row per lead, unified schema.
        """
        if platforms is None:
            platforms = ["linkedin", "twitter", "instagram", "tiktok", "facebook"]

        all_leads: List[Lead] = []

        if "linkedin" in platforms:
            all_leads.extend(LinkedInScraper().search(query, location, max_per_platform))

        if "twitter" in platforms:
            tw_query = f"{query} {location}".strip()
            all_leads.extend(TwitterScraper().search(tw_query, max_per_platform))

        if "instagram" in platforms:
            hashtag = query.lower().replace(" ", "")
            all_leads.extend(InstagramScraper().search(hashtag, max_per_platform))

        if "tiktok" in platforms:
            tk_query = f"{query} {location}".strip()
            all_leads.extend(TikTokScraper(self._get_driver()).search(tk_query, max_per_platform))

        if "facebook" in platforms:
            all_leads.extend(FacebookScraper().search(query, location, max_per_platform))

        df = pd.DataFrame([asdict(lead) for lead in all_leads])
        if df.empty:
            logger.warning("No leads collected. Check your query or network.")
            return df

        df = df.drop_duplicates(subset=["profile_url"], keep="first").reset_index(drop=True)

        ts        = datetime.now().strftime("%Y%m%d_%H%M%S")
        csv_path  = DATA_DIR / f"leads_{ts}.csv"
        json_path = DATA_DIR / f"leads_{ts}.json"
        df.to_csv(csv_path, index=False)
        df.to_json(json_path, orient="records", indent=2)

        logger.info(f"\n{'='*55}")
        logger.info(f"  Total leads collected : {len(df)}")
        for plat, grp in df.groupby("platform"):
            logger.info(f"    {plat:12s} : {len(grp)} leads")
        logger.info(f"  CSV  → {csv_path}")
        logger.info(f"  JSON → {json_path}")
        logger.info(f"{'='*55}\n")

        return df

    def close(self):
        if self._driver:
            self._driver.quit()
            self._driver = None


# ═══════════════════════════════════════════════════════════════════════════
# CELL 11 — MAIN: configure and run
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":

    # ── Edit these three lines ───────────────────────────────────────────
    SEARCH_QUERY     = "digital marketing agency"   # business type to find
    LOCATION         = "Dubai"                      # city / country (or "" for global)
    MAX_PER_PLATFORM = 20                           # leads per platform (max 100 total)

    # To scrape only certain platforms, edit this list:
    PLATFORMS = ["linkedin", "twitter", "instagram", "tiktok", "facebook"]
    # ────────────────────────────────────────────────────────────────────

    scraper = UnifiedScraper()
    try:
        df = scraper.scrape(
            query=SEARCH_QUERY,
            location=LOCATION,
            max_per_platform=MAX_PER_PLATFORM,
            platforms=PLATFORMS,
        )

        if not df.empty:
            print("\nSample leads:")
            print(
                df[["platform", "full_name", "job_title", "company",
                    "location", "followers", "profile_url"]]
                .head(15)
                .to_string(index=False)
            )
    finally:
        scraper.close()
