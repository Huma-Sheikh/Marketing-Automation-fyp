"""Compatibility alias: ``import scrapers`` resolves to ``app.scrapers``.

The scraper implementation moved into the ``app`` package. Replacing this
module in ``sys.modules`` (rather than re-exporting names) means
``import scrapers`` and ``app.scrapers`` are the *same* module object, so
monkeypatching ``scrapers.SCRAPE_MODE`` / ``scrapers.SCRAPERS`` in
test_scrapers.py still affects the real implementation.
"""
import sys

from app import scrapers as _impl

sys.modules[__name__] = _impl
