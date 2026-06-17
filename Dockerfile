# API do mtg-brain (FastAPI + frontend já buildado em web/dist).
# Sobe junto com o Postgres via docker compose — sem precisar rodar nada na mão.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY mtg_brain/ ./mtg_brain/
COPY web/dist/ ./web/dist/

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "mtg_brain.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
