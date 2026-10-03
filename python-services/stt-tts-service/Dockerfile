FROM python:3.10-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libsndfile1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Romanization for the Arabic/Urdu MMS-TTS voices comes from the `uroman` pip
# package in requirements.txt, so this image no longer clones the perl uroman
# repo (nor installs perl/git for it). main.py's _uromanize() still honours a
# UROMAN env var pointing at a perl checkout if one is mounted in.

COPY . .
RUN mkdir -p models
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
