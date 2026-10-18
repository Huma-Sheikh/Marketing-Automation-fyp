"""Static reference data: regions, category labels, Places-type mapping, phone prefixes."""
from typing import Dict, List, Tuple

# Default label map for the DistilBERT category classifier. The trained
# checkpoint's training_info.json overrides it at load time (see models.py).
BUSINESS_CATEGORIES: Dict[int, str] = {
    0: "Food & Beverage",
    1: "Retail & Shopping",
    2: "Healthcare & Wellness",
    3: "Technology & Software",
    4: "Finance & Banking",
    5: "Real Estate & Property",
    6: "Entertainment & Media",
    7: "Professional Services",
    8: "Education & Training",
    9: "Automotive & Transport",
}

# ── Region presets ─────────────────────────────────────────
# Maps short region codes to full location strings for Places API
REGIONS: Dict[str, dict] = {
    # Middle East
    "ae-dubai":     {"label": "Dubai, UAE",        "location": "Dubai, United Arab Emirates",    "lat": 25.2048, "lng": 55.2708, "radius": 30000},
    "ae-abu-dhabi": {"label": "Abu Dhabi, UAE",     "location": "Abu Dhabi, United Arab Emirates","lat": 24.4539, "lng": 54.3773, "radius": 30000},
    "ae-sharjah":   {"label": "Sharjah, UAE",       "location": "Sharjah, United Arab Emirates",  "lat": 25.3462, "lng": 55.4210, "radius": 20000},
    "sa-riyadh":    {"label": "Riyadh, Saudi Arabia","location": "Riyadh, Saudi Arabia",          "lat": 24.7136, "lng": 46.6753, "radius": 40000},
    "sa-jeddah":    {"label": "Jeddah, Saudi Arabia","location": "Jeddah, Saudi Arabia",          "lat": 21.5433, "lng": 39.1728, "radius": 30000},
    "kw-kuwait":    {"label": "Kuwait City, Kuwait", "location": "Kuwait City, Kuwait",            "lat": 29.3759, "lng": 47.9774, "radius": 25000},
    "qa-doha":      {"label": "Doha, Qatar",         "location": "Doha, Qatar",                   "lat": 25.2854, "lng": 51.5310, "radius": 20000},
    "bh-manama":    {"label": "Manama, Bahrain",     "location": "Manama, Bahrain",               "lat": 26.2235, "lng": 50.5876, "radius": 15000},
    "om-muscat":    {"label": "Muscat, Oman",        "location": "Muscat, Oman",                  "lat": 23.5880, "lng": 58.3829, "radius": 25000},
    # South Asia
    "pk-karachi":   {"label": "Karachi, Pakistan",   "location": "Karachi, Pakistan",             "lat": 24.8607, "lng": 67.0011, "radius": 40000},
    "pk-lahore":    {"label": "Lahore, Pakistan",    "location": "Lahore, Pakistan",              "lat": 31.5204, "lng": 74.3587, "radius": 30000},
    "pk-islamabad": {"label": "Islamabad, Pakistan", "location": "Islamabad, Pakistan",           "lat": 33.6844, "lng": 73.0479, "radius": 20000},
    "in-mumbai":    {"label": "Mumbai, India",       "location": "Mumbai, India",                 "lat": 19.0760, "lng": 72.8777, "radius": 40000},
    "in-delhi":     {"label": "Delhi, India",        "location": "New Delhi, India",              "lat": 28.6139, "lng": 77.2090, "radius": 40000},
    # Europe
    "gb-london":    {"label": "London, UK",          "location": "London, United Kingdom",        "lat": 51.5074, "lng": -0.1278, "radius": 30000},
    "de-berlin":    {"label": "Berlin, Germany",     "location": "Berlin, Germany",               "lat": 52.5200, "lng": 13.4050, "radius": 30000},
    "fr-paris":     {"label": "Paris, France",       "location": "Paris, France",                 "lat": 48.8566, "lng": 2.3522,  "radius": 25000},
    # North America
    "us-nyc":       {"label": "New York, USA",       "location": "New York City, USA",            "lat": 40.7128, "lng": -74.0060,"radius": 30000},
    "us-la":        {"label": "Los Angeles, USA",    "location": "Los Angeles, USA",              "lat": 34.0522, "lng": -118.2437,"radius":40000},
    "ca-toronto":   {"label": "Toronto, Canada",     "location": "Toronto, Canada",               "lat": 43.6532, "lng": -79.3832, "radius":30000},
}

# Google Places `types` substrings -> our category set (first match wins).
TYPE_CATEGORY_MAP: List[Tuple[Tuple[str, ...], str]] = [
    (("restaurant", "food", "cafe", "bar", "bakery", "meal_"),        "Food & Beverage"),
    (("store", "shop", "retail", "clothing", "mall", "supermarket"),  "Retail & Shopping"),
    (("hospital", "doctor", "dentist", "gym", "pharmacy", "health",
      "physiotherapist", "spa", "veterinary"),                        "Healthcare & Wellness"),
    (("school", "university", "education", "training", "library"),    "Education & Training"),
    (("bank", "finance", "insurance", "accounting", "atm"),           "Finance & Banking"),
    (("real_estate", "property", "housing", "lodging"),               "Real Estate & Property"),
    (("car", "automotive", "vehicle", "gas_station", "parking"),      "Automotive & Transport"),
    (("movie", "night_club", "casino", "museum", "art_gallery"),      "Entertainment & Media"),
    (("electronics", "software", "computer"),                         "Technology & Software"),
]

# Location keywords -> phone prefix used for realistic stub businesses.
STUB_PHONE_PREFIXES: List[Tuple[Tuple[str, ...], str]] = [
    (("uae", "united arab emirates", "dubai", "abu dhabi", "sharjah"), "+971 50"),
    (("pakistan", "karachi", "lahore", "islamabad"),                   "+92 300"),
    (("saudi", "riyadh", "jeddah"),                                    "+966 50"),
    (("kuwait",),                                                      "+965 5"),
    (("qatar", "doha"),                                                "+974 3"),
    (("bahrain", "manama"),                                            "+973 3"),
    (("oman", "muscat"),                                               "+968 9"),
    (("india", "mumbai", "delhi"),                                     "+91 98"),
    (("uk", "united kingdom", "london"),                               "+44 20"),
    (("usa", "united states", "new york", "los angeles"),              "+1 212"),
    (("canada", "toronto"),                                            "+1 416"),
    (("germany", "berlin"),                                            "+49 30"),
    (("france", "paris"),                                              "+33 1"),
]
DEFAULT_STUB_PHONE_PREFIX: str = "+1 555"

# Sales angle per sentiment label.
OPPORTUNITY_TEXT: Dict[str, str] = {
    "NEGATIVE": "⚠ Poor reviews — strong SEO/reputation management opportunity",
    "NEUTRAL":  "→ Average rating — digital marketing improvement opportunity",
    "POSITIVE": "✓ Good reputation — upsell premium marketing services",
}
DEFAULT_OPPORTUNITY_TEXT: str = "Marketing opportunity"
