"""Pydantic request models for the business routes."""
from typing import List, Optional

from pydantic import BaseModel


class SearchRequest(BaseModel):
    """Body of ``POST /search`` and ``POST /find-opportunities``."""

    location: str                       # Free text OR region code e.g. "ae-dubai"
    category: str                       # Business category e.g. "restaurant", "dentist"
    region_code: Optional[str] = None   # Optional: overrides location
    radius_meters: int = 25000          # Search radius in meters
    min_rating: Optional[float] = None  # Filter by minimum rating
    max_rating: Optional[float] = None  # Filter by maximum rating (find bad reviews)
    max_results: int = 20


class AnalyzeRequest(BaseModel):
    """Body of ``POST /analyze``: review/bio/post texts to classify."""

    texts: List[str]
    include_category: bool = True
