"""STT/TTS service package: config, schemas, model loading, speech logic and HTTP routes.

``main.py`` at the service root builds the FastAPI app from this package, so
``uvicorn main:app`` (the Dockerfile CMD) keeps working unchanged.
"""
