# Nelson AI as a free Hugging Face Space (Docker SDK).
#
# The image clones this repo from GitHub, builds the DuckDB file from the bundled CSVs and the
# Next.js dashboard, then runs both in one container. Only port 7860 is public: the dashboard
# serves it and forwards /api to the FastAPI backend on 127.0.0.1:8000 (see next.config.mjs).
#
# Space secrets: GEMINI_API_KEY (required) and SESSION_SECRET (any long random string).
# Telegram and Gmail stay off, so visitors can draft and approve actions but nothing is sent.
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl ca-certificates \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Spaces run the container as uid 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONPATH=/home/user/app/backend \
    PYTHONUNBUFFERED=1

ARG REPO=https://github.com/yenicar/nelson-ai
ARG REF=main
RUN git clone --depth 1 --branch $REF $REPO /home/user/app
WORKDIR /home/user/app

RUN pip install --no-cache-dir --user -e .
RUN python -m nelson.cli build-data
RUN cd frontend && npm ci --no-audit --no-fund && npm run build

ENV APP_ENV=production \
    APP_HOST=127.0.0.1 \
    APP_PORT=8000 \
    FRONTEND_ORIGIN=http://127.0.0.1:7860 \
    TELEGRAM_BOT_TOKEN= \
    GMAIL_FROM= \
    GMAIL_APP_PASSWORD=

EXPOSE 7860
CMD ["sh", "-c", "python -m nelson.cli serve & cd frontend && exec npx next start -p 7860 -H 0.0.0.0"]
