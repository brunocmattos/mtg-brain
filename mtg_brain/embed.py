"""Embeddings de texto via fastembed (ONNX, local, grátis) para busca semântica.

Modelo pequeno (BAAI/bge-small-en-v1.5, 384 dims) carregado uma vez e cacheado em
memória. Roda no container do app (Python 3.12, onde o onnxruntime instala). É bem
mais leve que um LLM local — só o necessário pra transformar texto em vetor.
"""
import os
from functools import lru_cache

MODEL_NAME = os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
DIM = 384
CACHE_DIR = os.getenv("FASTEMBED_CACHE", "/app/.fastembed_cache")


@lru_cache(maxsize=1)
def model():
    from fastembed import TextEmbedding
    return TextEmbedding(model_name=MODEL_NAME, cache_dir=CACHE_DIR)


def to_literal(vec):
    """numpy array -> literal pgvector '[v1,v2,...]' (pra usar com '%s::vector')."""
    return "[" + ",".join(f"{float(x):.6f}" for x in vec) + "]"


def embed_query(text):
    """Texto da busca -> literal pgvector pronto. Usa query_embed (bge adiciona o
    prefixo de instrução de busca), que casa muito melhor com o corpus (que foi
    embedado como 'passages' via embed())."""
    vec = next(iter(model().query_embed(text or "")))
    return to_literal(vec)
