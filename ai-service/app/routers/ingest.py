import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Header, status
from ..schemas import IngestRequest, IngestResponse
from ..config import settings
from ..db import get_db
from ..services.pdf_parser import extract_text_by_pages, NoExtractableTextException
from ..services.chunker import Chunker
from ..services.embeddings import get_embedder

router = APIRouter(prefix="", tags=["Ingestion"])

def verify_internal_key(x_internal_key: str = Header(None)):
    if not x_internal_key or x_internal_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Invalid or missing X-Internal-Key"}}
        )

@router.post("/ingest", response_model=IngestResponse)
async def ingest_contract(
    req: IngestRequest,
    x_internal_key: str = Header(None)
):
    verify_internal_key(x_internal_key)

    # Resolve PDF file path
    raw_path = Path(req.file_path)
    if raw_path.is_absolute() and raw_path.exists():
        resolved_path = raw_path
    else:
        candidates = [
            raw_path,
            Path(settings.upload_dir) / raw_path.name,
            Path(settings.upload_dir) / req.file_path,
            Path(__file__).resolve().parent.parent.parent.parent / "backend" / "uploads" / raw_path.name,
            Path(__file__).resolve().parent.parent.parent.parent / req.file_path,
        ]
        resolved_path = None
        for cand in candidates:
            if cand.exists():
                resolved_path = cand
                break

    if not resolved_path or not resolved_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FILE_NOT_FOUND", "message": f"Contract PDF file not found at {req.file_path}"}}
        )

    # 1. Parse PDF page by page
    try:
        pages = extract_text_by_pages(str(resolved_path), min_char_threshold=200)
    except NoExtractableTextException as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": {"code": "NO_EXTRACTABLE_TEXT", "message": str(e)}}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"code": "PDF_PARSE_ERROR", "message": f"Failed to parse PDF: {str(e)}"}}
        )

    # 2. Chunk text without crossing page boundaries
    chunker = Chunker()
    chunks = chunker.chunk_contract_pages(req.contract_id, pages)

    # 3. Compute Embeddings in batches
    embedder = get_embedder()
    chunk_texts = [c["text"] for c in chunks]
    embeddings = embedder.embed_batch(chunk_texts)

    # 4. Insert into database idempotently (delete old chunks first)
    with get_db() as conn:
        with conn.cursor() as cur:
            # Delete existing chunks for this contract
            cur.execute("DELETE FROM contract_chunks WHERE contract_id = %s", (req.contract_id,))

            # Batch insert new chunks
            for chunk_data, emb in zip(chunks, embeddings):
                cur.execute(
                    """
                    INSERT INTO contract_chunks (
                        contract_id, chunk_index, page, char_start, char_end, text, embedding
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s::vector)
                    """,
                    (
                        chunk_data["contract_id"],
                        chunk_data["chunk_index"],
                        chunk_data["page"],
                        chunk_data["char_start"],
                        chunk_data["char_end"],
                        chunk_data["text"],
                        emb
                    )
                )

            # Update page count in contracts table if contract exists
            cur.execute(
                "UPDATE contracts SET page_count = %s WHERE id = %s",
                (len(pages), req.contract_id)
            )

    return IngestResponse(
        contract_id=req.contract_id,
        page_count=len(pages),
        chunk_count=len(chunks)
    )
