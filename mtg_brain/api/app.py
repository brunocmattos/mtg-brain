"""FastAPI — expõe o cérebro e os dados do mtg-brain por HTTP.

Rotas sob /api. Em produção, serve o build do React (web/dist) na raiz.
Rode com:  uvicorn mtg_brain.api.app:app --port 8000
"""
import os
from uuid import UUID

from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .. import db, fx, queries

app = FastAPI(
    title="mtg-brain",
    version="0.1.0",
    description="Magic: The Gathering — cartas, combos, regras, comandantes e decks.",
)

# CORS só para o dev server do Vite (Fase 2). Em produção tudo vem da mesma origem.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")


@api.get("/health")
def health():
    status = {"db": "ok"}
    try:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
    except Exception as e:  # noqa: BLE001
        status["db"] = f"erro: {e}"
    return status


@api.get("/stats")
def stats():
    return db.counts()


@api.get("/fx/usd-brl")
def fx_usd_brl():
    rate, source = fx.usd_to_brl()
    return {"rate": rate, "source": source}


@api.get("/symbols")
def symbols():
    return queries.symbol_map()


@api.get("/cards")
def cards(q: str | None = None, colors: list[str] | None = Query(None), limit: int = 40,
          sort: str = "edhrec"):
    return queries.search_cards(q, colors, limit, sort)


@api.get("/cards/{card_id}")
def card(card_id: UUID):  # UUID inválido → 422 (em vez de 500 no cast do Postgres)
    c = queries.get_card(str(card_id))
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
    cmc_min: float | None = None,
    cmc_max: float | None = None,
):
    return queries.list_commanders(q, colors, max_price, sort, limit, cmc_min, cmc_max)


@api.get("/commanders/recommend")
def recommend(
    theme: str,
    colors: list[str] | None = Query(None),
    max_price: float | None = None,
    limit: int = 12,
    sort: str = "edhrec",
    cmc_min: float | None = None,
    cmc_max: float | None = None,
):
    return queries.recommend_commanders(theme, colors, max_price, limit, sort, cmc_min, cmc_max)


@api.get("/combos")
def combos(card: str | None = None, identity: str | None = None, limit: int = 20):
    if card:
        return queries.combos_for_card(card, limit)
    if identity:
        return queries.combos_for_identity(identity, limit)
    raise HTTPException(status_code=400, detail="informe ?card= ou ?identity=")


class DeckCreate(BaseModel):
    name: str
    commander: str | None = None


class DeckCardBody(BaseModel):
    card_name: str
    qty: int = 1
    is_commander: bool = False


class DeckImport(BaseModel):
    name: str
    text: str
    commander: str | None = None


@api.post("/decks")
def create_deck(body: DeckCreate):
    return queries.create_deck(body.name, body.commander)


@api.post("/decks/import")
def import_deck(body: DeckImport):
    res = queries.import_deck(body.name, body.text, body.commander)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@api.get("/decks")
def list_decks():
    return queries.list_decks()


@api.get("/decks/{deck_id}")
def get_deck(deck_id: int):
    d = queries.get_deck(deck_id)
    if not d:
        raise HTTPException(status_code=404, detail="deck não encontrado")
    return d


@api.delete("/decks/{deck_id}")
def delete_deck(deck_id: int):
    return queries.delete_deck(deck_id)


@api.post("/decks/{deck_id}/cards")
def add_card(deck_id: int, body: DeckCardBody):
    return queries.add_card(deck_id, body.card_name, body.qty, body.is_commander)


@api.delete("/decks/{deck_id}/cards")
def remove_card(deck_id: int, name: str):
    return queries.remove_card(deck_id, name)


@api.get("/decks/{deck_id}/analysis")
def deck_analysis(deck_id: int):
    a = queries.deck_analysis(deck_id)
    if a is None:
        raise HTTPException(status_code=404, detail="deck não encontrado")
    return a


@api.get("/commanders/suggest")
def suggest(commander: str, limit: int = 40):
    return queries.suggest_cards(commander, limit)


app.include_router(api)

# Serve o frontend (build do React) com fallback de SPA: rotas client-side
# (/commanders, /cards, /decks) devolvem index.html; assets reais são servidos direto.
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
