# API do mtg-brain (FastAPI + frontend já buildado em web/dist).
# Sobe junto com o Postgres via docker compose — sem precisar rodar nada na mão.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-baixa o modelo de embedding (camada cacheada ANTES do COPY do codigo, pra
# mudanca de codigo nao re-baixar o modelo). Nome/cache batem com mtg_brain/embed.py.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/app/.fastembed_cache')"

COPY mtg_brain/ ./mtg_brain/
COPY web/dist/ ./web/dist/

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "mtg_brain.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
