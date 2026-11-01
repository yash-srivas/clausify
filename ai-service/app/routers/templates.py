from fastapi import APIRouter, HTTPException, Header, status
from ..schemas import EmbedTemplateRequest, EmbedTemplateResponse
from ..config import settings
from ..db import get_db
from ..services.embeddings import get_embedder

router = APIRouter(prefix="/templates", tags=["Templates"])

def verify_internal_key(x_internal_key: str = Header(None)):
    if not x_internal_key or x_internal_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Invalid or missing X-Internal-Key"}}
        )

@router.post("/embed", response_model=EmbedTemplateResponse)
async def embed_template_clauses(
    req: EmbedTemplateRequest,
    x_internal_key: str = Header(None)
):
    verify_internal_key(x_internal_key)

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, text FROM template_clauses WHERE template_id = %s",
                (req.template_id,)
            )
            rows = cur.fetchall()

            if not rows:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"error": {"code": "TEMPLATE_NOT_FOUND", "message": f"No template clauses found for template {req.template_id}"}}
                )

            embedder = get_embedder()
            clause_ids = [r[0] for r in rows]
            clause_texts = [r[1] for r in rows]
            embeddings = embedder.embed_batch(clause_texts)

            for cid, emb in zip(clause_ids, embeddings):
                cur.execute(
                    "UPDATE template_clauses SET embedding = %s::vector WHERE id = %s",
                    (emb, cid)
                )

    return EmbedTemplateResponse(
        template_id=req.template_id,
        clauses_embedded=len(rows)
    )
