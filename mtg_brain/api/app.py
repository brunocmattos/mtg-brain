"""FastAPI — expõe o cérebro e os dados do mtg-brain por HTTP.

Rotas sob /api. Em produção, serve o build do React (web/dist) na raiz.
Rode com:  uvicorn mtg_brain.api.app:app --port 8000
"""
import os

from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .. import brain, config, db, http, queries

app = FastAPI(
    title="mtg-brain",
    version="0.1.0",
    description="Cérebro local de Magic: The Gathering — cartas, combos, regras e chat.",
)

# CORS só para o dev server do Vite (Fase 2). Em produção tudo vem da mesma origem.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")


class ChatRequest(BaseModel):
    question: str
    verbose: bool = False


@api.get("/health")
def health():
    status = {"db": "ok", "llm": "ok"}
    try:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
    except Exception as e:  # noqa: BLE001
        status["db"] = f"erro: {e}"
    try:
        r = http.session().get(config.LLM_BASE_URL.rstrip("/") + "/models", timeout=3)
        r.raise_for_status()
    except Exception as e:  # noqa: BLE001
        status["llm"] = f"erro: {e}"
    return status


@api.get("/stats")
def stats():
    return db.counts()


@api.get("/cards")
def cards(q: str | None = None, colors: list[str] | None = Query(None), limit: int = 40):
    return queries.search_cards(q, colors, limit)


@api.get("/cards/{card_id}")
def card(card_id: str):
    c = queries.get_card(card_id)
    if not c:
        raise HTTPException(status_code=404, detail="carta não encontrada")
    return c


@api.get("/commanders")
def commanders(
    q: str | None = None,
    colors: list[str] | None = Query(None),
    max_price: float | None = None,
    sort: str = "edhrec",
    limit: int = 40,
):
    return queries.list_commanders(q, colors, max_price, sort, limit)


@api.get("/commanders/recommend")
def recommend(
    theme: str,
    colors: list[str] | None = Query(None),
    max_price: float | None = None,
    limit: int = 12,
):
    return queries.recommend_commanders(theme, colors, max_price, limit)


@api.get("/combos")
def combos(card: str | None = None, identity: str | None = None, limit: int = 20):
    if card:
        return queries.combos_for_card(card, limit)
    if identity:
        return queries.combos_for_identity(identity, limit)
    raise HTTPException(status_code=400, detail="informe ?card= ou ?identity=")


@api.post("/chat")
def chat(req: ChatRequest):
    return {"answer": brain.ask(req.question, verbose=req.verbose)}


app.include_router(api)

# Serve o frontend (build do React) com fallback de SPA: rotas client-side
# (/commanders, /cards, /chat) devolvem index.html; assets reais são servidos direto.
_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_DIST = os.path.join(_REPO, "web", "dist")
if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="rota de API não encontrada")
        candidate = os.path.abspath(os.path.join(_DIST, full_path))
        if full_path and candidate.startswith(os.path.abspath(_DIST)) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_DIST, "index.html"))
