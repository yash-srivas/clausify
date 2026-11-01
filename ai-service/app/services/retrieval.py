from typing import List, Dict, Any, Optional
from ..db import get_db
from .embeddings import get_embedder

def retrieve_contract_chunks(
    contract_id: str,
    query_text: str,
    top_k: int = 4
) -> List[Dict[str, Any]]:
    """
    Retrieves the top-k most semantically relevant chunks for a contract using cosine distance (<=>).
    """
    embedder = get_embedder()
    query_vector = embedder.embed_text(query_text)

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, chunk_index, page, char_start, char_end, text, (embedding <=> %s::vector) AS distance
                FROM contract_chunks
                WHERE contract_id = %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (query_vector, contract_id, query_vector, top_k)
            )
            rows = cur.fetchall()

            chunks: List[Dict[str, Any]] = []
            for row in rows:
                chunks.append({
                    "id": str(row[0]),
                    "chunk_index": row[1],
                    "page": row[2],
                    "char_start": row[3],
                    "char_end": row[4],
                    "text": row[5],
                    "distance": float(row[6]) if row[6] is not None else 0.0
                })

            return chunks

def get_template_clause(template_id: str, clause_type: str) -> Optional[Dict[str, Any]]:
    """Fetches the approved safe template clause for a given clause type."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, template_id, clause_type, title, text, is_required, version
                FROM template_clauses
                WHERE template_id = %s AND clause_type = %s
                LIMIT 1
                """,
                (template_id, clause_type)
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": str(row[0]),
                "template_id": str(row[1]),
                "clause_type": row[2],
                "title": row[3],
                "text": row[4],
                "is_required": row[5],
                "version": row[6]
            }
