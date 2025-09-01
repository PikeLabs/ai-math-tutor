# backend/Dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# System deps for PDFs & audio
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils ffmpeg curl \
  && rm -rf /var/lib/apt/lists/*

# Set workdir
WORKDIR /app/backend

# Install Python deps (requirements.txt at repo root already lists core ones)
COPY requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip \
 && python -m pip install --no-cache-dir -r /app/requirements.txt

# Copy backend code
COPY . /app/backend/

# Create directories used by the app (and let Compose mount them as volumes)
RUN mkdir -p /app/backend/assignments /app/backend/slide_images /app/backend/audio_sessions

# Tell Prisma where the schema is (inside backend/)
ENV PRISMA_SCHEMA=/app/backend/prisma/schema.prisma


# Expose Flask port
EXPOSE 5001

# Gunicorn entry (change app:app if your Flask entry is different)
# If your app is strictly sync Flask, this is fine.
CMD ["bash", "/app/backend/scripts/start_backend.sh"]