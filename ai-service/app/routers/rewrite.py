from fastapi import APIRouter, HTTPException, Header, status
from ..schemas import RewriteRequest, RewriteResponse
from ..config import settings
from ..db import get_db
from ..services.llm import get_llm

router = APIRouter(prefix="", tags=["Rewrite"])

def verify_internal_key(x_internal_key: str = Header(None)):
    if not x_internal_key or x_internal_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Invalid or missing X-Internal-Key"}}
        )

@router.post("/rewrite", response_model=RewriteResponse)
async def rewrite_clause(
    req: RewriteRequest,
    x_internal_key: str = Header(None)
):
    verify_internal_key(x_internal_key)

    clause_text = req.clause_text

    # If finding_id is provided but clause_text is missing, look it up in DB
    if not clause_text and req.finding_id:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT text_span FROM findings WHERE id = %s", (req.finding_id,))
                row = cur.fetchone()
                if row:
                    clause_text = row[0]

    if not clause_text:
        clause_text = "Vendor contract clause requiring revision."

    llm = get_llm()
    result = llm.generate_rewrite(
        clause_type=req.clause_type,
        clause_text=clause_text,
        template_clause_text=req.template_clause_text,
        tone=req.tone or "neutral"
    )

    return RewriteResponse(
        suggested_rewrite=result.get("suggested_rewrite", req.template_clause_text),
        rationale=result.get("rationale", "Aligned clause language with approved safe legal template.")
    )

