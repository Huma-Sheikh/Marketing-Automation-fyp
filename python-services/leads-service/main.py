"""Entry point for the leads + NER + scoring service: ``uvicorn main:app --port 8002``.

Builds the FastAPI app from the ``app`` package. Models are loaded eagerly at
import time, exactly as before the package split.
"""
import logging

from fastapi import FastAPI

from app import models
from app.errors import register_exception_handlers
from app.routes import router

logging.basicConfig(level=logging.INFO)

models.load_models()

app = FastAPI(title="Leads + NER + Scoring Service")
app.include_router(router)
register_exception_handlers(app)
