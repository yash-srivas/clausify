import os
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.db import get_db
from app.config import settings
from app.services.retrieval import retrieve_contract_chunks

client = TestClient(app)

TEST_CONTRACT_ID = "99999999-9999-9999-9999-999999999999"
TEST_USER_ID = "11111111-1111-1111-1111-111111111111"
SEED_TEMPLATE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

@pytest.fixture(autouse=True)
def setup_teardown_contract():
    # Insert contract record in DB to satisfy foreign keys
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO contracts (id, title, original_filename, file_path, uploaded_by, status)
                VALUES (%s, 'Test Contract Risky', 'contract_risky_1.pdf', 'samples/contract_risky_1.pdf', %s, 'uploaded')
                ON CONFLICT (id) DO UPDATE SET status = 'uploaded'
                """,
                (TEST_CONTRACT_ID, TEST_USER_ID)
            )
    yield
    # Cleanup contract chunks and contract
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM contract_chunks WHERE contract_id = %s", (TEST_CONTRACT_ID,))
            cur.execute("DELETE FROM contracts WHERE id = %s", (TEST_CONTRACT_ID,))

def test_ingest_requires_internal_key():
    res = client.post("/ingest", json={"contract_id": TEST_CONTRACT_ID, "file_path": "samples/contract_risky_1.pdf"})
    assert res.status_code == 401

def test_ingest_risky_contract_1_and_retrieval():
    headers = {"X-Internal-Key": settings.internal_api_key}
    pdf_path = str(Path(__file__).resolve().parent.parent.parent / "samples" / "contract_risky_1.pdf")

    # Ingest contract
    res = client.post("/ingest", json={"contract_id": TEST_CONTRACT_ID, "file_path": pdf_path}, headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["contract_id"] == TEST_CONTRACT_ID
    assert data["page_count"] == 3
    assert data["chunk_count"] >= 3

    # Check chunks exist in DB
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*), count(embedding) FROM contract_chunks WHERE contract_id = %s", (TEST_CONTRACT_ID,))
            count, emb_count = cur.fetchone()
            assert count == data["chunk_count"]
            assert emb_count == count

    # Retrieve chunks for liability
    chunks = retrieve_contract_chunks(
        contract_id=TEST_CONTRACT_ID,
        query_text="limitation of liability damages aggregate cap unlimited",
        top_k=2
    )
    assert len(chunks) > 0
    # Top chunk should mention liability
    top_text = chunks[0]["text"].lower()
    assert "liability" in top_text or "damages" in top_text

def test_ingest_scanned_pdf_returns_422():
    headers = {"X-Internal-Key": settings.internal_api_key}
    pdf_path = str(Path(__file__).resolve().parent.parent.parent / "samples" / "contract_scanned.pdf")

    res = client.post("/ingest", json={"contract_id": TEST_CONTRACT_ID, "file_path": pdf_path}, headers=headers)
    assert res.status_code == 422
    assert "NO_EXTRACTABLE_TEXT" in str(res.json())

def test_template_embed_endpoint():
    headers = {"X-Internal-Key": settings.internal_api_key}
    res = client.post(
        "/templates/embed",
        json={"template_id": SEED_TEMPLATE_ID},
        headers=headers
    )
    assert res.status_code == 200
    assert res.json()["clauses_embedded"] >= 10

