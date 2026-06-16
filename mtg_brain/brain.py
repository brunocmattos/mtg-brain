"""Fase 3 — o "cérebro" que responde perguntas sobre Magic em português.

Usa um LLM via API **OpenAI-compatível**. Por padrão aponta pro **Ollama local**
(http://localhost:11434/v1 — $0 e ilimitado). Funciona igual com Groq, Gemini, etc.,
trocando LLM_BASE_URL / LLM_MODEL / LLM_API_KEY no .env.

O modelo consulta o Postgres do mtg-brain por uma ferramenta de SQL **somente-leitura**
e responde fundamentado nos dados reais (cartas, combos, regras, rulings, sets).
"""
import datetime
import json

from . import config, db

SYSTEM = """Você é um especialista em Magic: The Gathering (foco em Commander/EDH) com acesso a um \
banco Postgres COMPLETO e atualizado (2026). Responda em português brasileiro, SEMPRE com base em \
dados obtidos via a ferramenta executar_sql. Não invente cartas, textos nem regras.

ESQUEMA (colunas úteis):
- cards: name, mana_cost, cmc, type_line, oracle_text, colors (text[]), color_identity (text[]),
  keywords (text[]), rarity, set_code, released_at (date), edhrec_rank,
  legalities (jsonb -> legalities->>'commander'='legal'), prices (jsonb -> (prices->>'usd')::numeric).
  NUNCA faça SELECT da coluna `data`.
- combos: card_names (text[]), color_identity (TEXTO, ex.: 'UB','B','WUG'), prerequisites, steps, results (text[]).
- rules: rule_number, section, text.
- rulings: oracle_id, comment.
- sets: code, name, released_at, set_type.
- VIEW commanders: como cards, já filtrada para quem pode ser comandante.

PADRÕES DE QUERY — copie estes formatos:
- Combos que usam uma carta (filtre o ARRAY card_names; NÃO junte combos com cards):
    SELECT card_names, results, steps FROM combos WHERE 'Gravecrawler' = ANY(card_names) LIMIT 5;
- Combos numa identidade UB (combos.color_identity é TEXTO; use regex, nunca use && nela):
    SELECT card_names, results FROM combos WHERE color_identity ~ '^[UB]+$' LIMIT 10;
- Comandantes de uma cor, por popularidade:
    SELECT name, mana_cost, edhrec_rank FROM commanders WHERE color_identity = ARRAY['B'] ORDER BY edhrec_rank NULLS LAST LIMIT 10;
- Cartas por texto/legalidade/preço:
    SELECT name, mana_cost, (prices->>'usd') FROM cards WHERE oracle_text ILIKE '%loses%life%'
    AND (legalities->>'commander')='legal' ORDER BY (prices->>'usd')::numeric NULLS LAST LIMIT 10;
- Regra por palavra:
    SELECT rule_number, text FROM rules WHERE text ILIKE '%deathtouch%' LIMIT 5;

REGRAS:
- card_names e results JÁ são text[] — não use array_agg neles.
- color_identity em cards/commanders é text[] ('W','U','B','R','G'); 'jogável em UB' = color_identity <@ ARRAY['U','B'].
- Use ILIKE para texto, sempre com LIMIT, e selecione colunas específicas (nunca SELECT *).
- Assim que UMA query retornar dados úteis, PARE de consultar e responda citando as cartas/regras.
- Se uma query der erro, leia a mensagem e corrija — não repita o mesmo erro."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "executar_sql",
            "description": (
                "Executa UMA query SQL somente-leitura (SELECT ou WITH) no Postgres do mtg-brain "
                "e retorna até 50 linhas. Tabelas: cards, combos, rules, rulings, sets; view: commanders."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {"type": "string", "description": "Uma única instrução SELECT/WITH."}
                },
                "required": ["sql"],
            },
        },
    }
]


def _clean(v):
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    if isinstance(v, str):
        return v if len(v) <= 800 else v[:800] + "…"
    if isinstance(v, (dict, list)):
        s = json.dumps(v, ensure_ascii=False, default=str)
        return s if len(s) <= 1000 else s[:1000] + "…"
    return v


def run_sql(sql, max_rows=50):
    """Roda uma query somente-leitura com várias travas de segurança."""
    s = (sql or "").strip().rstrip(";")
    low = s.lower()
    if not (low.startswith("select") or low.startswith("with")):
        return {"error": "Apenas consultas SELECT/WITH são permitidas."}
    if ";" in s:
        return {"error": "Envie apenas uma instrução por chamada."}
    try:
        with db.connect() as conn:
            conn.read_only = True  # transação somente-leitura: o banco rejeita qualquer escrita
            with conn.cursor() as cur:
                cur.execute("SET LOCAL statement_timeout = '15s'")
                cur.execute(s)
                cols = [d.name for d in cur.description]
                rows = cur.fetchmany(max_rows)
            conn.rollback()
        return {
            "columns": cols,
            "rows": [[_clean(v) for v in r] for r in rows],
            "row_count": len(rows),
            "truncated": len(rows) == max_rows,
        }
    except Exception as e:  # devolve o erro pro modelo, que pode corrigir a query
        return {"error": str(e)}


def ask(question, model=None, max_steps=8, verbose=False):
    from openai import OpenAI

    client = OpenAI(base_url=config.LLM_BASE_URL, api_key=config.LLM_API_KEY or "ollama")
    model = model or config.LLM_MODEL
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": question},
    ]
    try:
        for _ in range(max_steps):
            resp = client.chat.completions.create(
                model=model, messages=messages, tools=TOOLS, temperature=0
            )
            msg = resp.choices[0].message
            if msg.tool_calls:
                messages.append({
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in msg.tool_calls
                    ],
                })
                for tc in msg.tool_calls:
                    if tc.function.name == "executar_sql":
                        try:
                            sql = json.loads(tc.function.arguments).get("sql", "")
                        except (ValueError, TypeError):
                            sql = ""
                        if verbose:
                            print(f"  [SQL] {sql}")
                        out = run_sql(sql)
                    else:
                        out = {"error": f"ferramenta desconhecida: {tc.function.name}"}
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(out, ensure_ascii=False, default=str),
                    })
                continue
            return (msg.content or "").strip()
        return "(parei após várias consultas sem chegar a uma resposta final)"
    except Exception as e:
        return (
            f"Erro ao falar com o LLM (base_url={config.LLM_BASE_URL}, modelo={model}): {e}\n"
            "Se for Ollama: confira se o serviço está rodando e se o modelo (LLM_MODEL) "
            "foi baixado — ex.: ollama pull qwen2.5:14b."
        )
