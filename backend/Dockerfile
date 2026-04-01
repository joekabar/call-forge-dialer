# backend/Dockerfile
# Multi-stage build for a lean production image

FROM python:3.12-slim AS builder

WORKDIR /app

# Install dependencies into a virtual environment
COPY requirements.txt .
RUN python -m venv /venv && \
    /venv/bin/pip install --no-cache-dir --upgrade pip && \
    /venv/bin/pip install --no-cache-dir -r requirements.txt

# ── Runtime stage ────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Copy venv from builder
COPY --from=builder /venv /venv

# Copy application code
COPY . .

# Use venv Python
ENV PATH="/venv/bin:$PATH"

# Expose port
EXPOSE 8000

# Health check — Railway / Render / Fly.io all use this
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import httpx; httpx.get('http://localhost:8000/api/health')" || exit 1

# Start the server
# Workers: 1 per CPU core in production. Start with 2 for a single-core dyno.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
