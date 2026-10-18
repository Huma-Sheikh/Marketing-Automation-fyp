"""Business scraper + sentiment service package.

Config, reference data, schemas, model loading, Google Places client,
sentiment/category classification and HTTP routes. ``main.py`` at the service
root builds the FastAPI app from this package, so ``uvicorn main:app`` (the
Dockerfile CMD) keeps working unchanged.
"""
