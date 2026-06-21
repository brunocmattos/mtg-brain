"""Embeddings de texto via fastembed (ONNX, local, grátis) para busca semântica.

Modelo pequeno (BAAI/bge-small-en-v1.5, 384 dims) carregado uma vez e cacheado em
memória. Roda no container do app (Python 3.12, onde o onnxruntime instala). É bem
mais leve que um LLM local — só o necessário pra transformar texto em vetor.
"""
import os
from functools import lru_cache

MODEL_NAME = os.getenv("EMBED_MODEL", "BAAI/bge-base-en-v1.5")
DIM = 768
CACHE_DIR = os.getenv("FASTEMBED_CACHE", "/app/.fastembed_cache")
# bge (short query -> long passage): a QUERY leva a instrução; os passages (corpus) NÃO.
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


@lru_cache(maxsize=1)
def model():
    from fastembed import TextEmbedding
    return TextEmbedding(model_name=MODEL_NAME, cache_dir=CACHE_DIR)


def to_literal(vec):
    """numpy array -> literal pgvector '[v1,v2,...]' (pra usar com '%s::vector')."""
    return "[" + ",".join(f"{float(x):.6f}" for x in vec) + "]"


def embed_query(text):
    """Texto da busca -> literal pgvector pronto. Prepende a instrução de query do bge
    (o corpus foi embedado como 'passages', sem prefixo) — uso assimétrico recomendado,
    melhor que query_embed (que era no-op nesta versão do fastembed)."""
    vec = next(iter(model().embed([QUERY_PREFIX + (text or "")])))
    return to_literal(vec)
