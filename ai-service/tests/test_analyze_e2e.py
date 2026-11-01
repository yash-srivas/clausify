import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.db import get_db
from app.config import settings

client = TestClient(app)

TEST_CONTRACT_ID = "88888888-8888-8888-8888-888888888888"
TEST_USER_ID = "11111111-1111-1111-1111-111111111111"
SEED_TEMPLATE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

@pytest.fixture(autouse=True)
def setup_teardown():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO contracts (id, title, original_filename, file_path, uploaded_by, template_id, status)
                VALUES (%s, 'Risky Contract 1', 'contract_risky_1.pdf', 'samples/contract_risky_1.pdf', %s, %s, 'uploaded')
                ON CONFLICT (id) DO UPDATE SET status = 'uploaded', overall_risk_score = NULL
                """,
                (TEST_CONTRACT_ID, TEST_USER_ID, SEED_TEMPLATE_ID)
            )
    yield
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM findings WHERE contract_id = %s", (TEST_CONTRACT_ID,))
            cur.execute("DELETE FROM contract_chunks WHERE contract_id = %s", (TEST_CONTRACT_ID,))
            cur.execute("DELETE FROM analysis_cache WHERE contract_id = %s", (TEST_CONTRACT_ID,))
            cur.execute("DELETE FROM contracts WHERE id = %s", (TEST_CONTRACT_ID,))

def test_analyze_contract_mock_end_to_end():
    headers = {"X-Internal-Key": settings.internal_api_key}
    pdf_path = str(Path(__file__).resolve().parent.parent.parent / "samples" / "contract_risky_1.pdf")

    # 1. Ingest PDF
    ingest_res = client.post("/ingest", json={"contract_id": TEST_CONTRACT_ID, "file_path": pdf_path}, headers=headers)
    assert ingest_res.status_code == 200

    # 2. Analyze contract
    res = client.post(
        "/analyze",
        json={"contract_id": TEST_CONTRACT_ID, "template_id": SEED_TEMPLATE_ID},
        headers=headers
    )
    assert res.status_code == 200, res.text
    data = res.json()

    # Verify score and band
    assert data["overall_risk_score"] >= 67, f"Expected HIGH risk score (>=67), got {data['overall_risk_score']}"
    assert data["risk_band"] == "HIGH"
    assert len(data["findings"]) >= 4

    findings_by_clause = {f["clause_type"]: f for f in data["findings"]}

    # Verify unlimited liability finding
    assert "liability" in findings_by_clause
    liab = findings_by_clause["liability"]
    assert liab["risk_level"] == "HIGH"
    assert "unlimited" in liab["text_span"].lower()
    assert liab["page"] == 2
    assert liab["verified"] is True
    assert len(liab["suggested_rewrite"]) > 0

    # Verify auto-renewal finding (definitions on page 1)
    assert "auto_renewal" in findings_by_clause
    renewal = findings_by_clause["auto_renewal"]
    assert renewal["risk_level"] == "HIGH"
    assert "automatically renew" in renewal["text_span"].lower()
    assert renewal["page"] == 1
    assert renewal["verified"] is True

    # Verify termination finding (page 2)
    assert "termination" in findings_by_clause
    term = findings_by_clause["termination"]
    assert term["risk_level"] == "HIGH"
    assert term["page"] == 2

    # 3. Verify Database updates
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status, overall_risk_score FROM contracts WHERE id = %s", (TEST_CONTRACT_ID,))
            db_status, db_score = cur.fetchone()
            assert db_status == "analyzed"
            assert db_score == data["overall_risk_score"]

            cur.execute("SELECT count(*) FROM findings WHERE contract_id = %s", (TEST_CONTRACT_ID,))
            count = cur.fetchone()[0]
            assert count == len(data["findings"])

    # 4. Verify Analysis Cache: calling /analyze again should hit cache
    cached_res = client.post(
        "/analyze",
        json={"contract_id": TEST_CONTRACT_ID, "template_id": SEED_TEMPLATE_ID},
        headers=headers
    )
    assert cached_res.status_code == 200
    cached_data = cached_res.json()
    assert cached_data["stats"]["cache_hits"] > 0

def test_rewrite_endpoint():
    headers = {"X-Internal-Key": settings.internal_api_key}
    res = client.post(
        "/rewrite",
        json={
            "clause_type": "liability",
            "clause_text": "Vendor's liability shall be unlimited under this Agreement.",
            "template_clause_text": "Neither party's aggregate liability shall exceed total fees paid in 12 months.",
            "tone": "firm"
        },
        headers=headers
    )
    assert res.status_code == 200
    data = res.json()
    assert "suggested_rewrite" in data
    assert "rationale" in data
    assert "aggregate liability" in data["suggested_rewrite"].lower()

