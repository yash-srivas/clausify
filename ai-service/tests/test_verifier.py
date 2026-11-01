import pytest
from app.services.verifier import verify_quote, normalize_for_matching

def test_normalize_for_matching():
    raw = '  “Vendor’s Liability—Shall Not Be Capped.”  \n\n '
    clean = normalize_for_matching(raw)
    assert clean == '"vendor\'s liability-shall not be capped."'

def test_verify_quote_exact_match():
    chunks = [
        {"id": "1", "page": 1, "text": "Section 1. Definitions and preliminary matters."},
        {"id": "2", "page": 2, "text": "Vendor liability shall be unlimited under this Agreement or any applicable SOW."},
    ]
    quote = "Vendor liability shall be unlimited under this Agreement"
    verified, page, text = verify_quote(quote, chunks)

    assert verified is True
    assert page == 2
    assert text == quote

def test_verify_quote_fuzzy_match_95_percent():
    chunks = [
        {"id": "2", "page": 2, "text": "Customer aggregate liability for any claims or breaches shall not be limited."},
    ]
    # Minor whitespace and punctuation variation
    quote = "Customer aggregate liability for any claims or breaches shall not be limited"
    verified, page, _ = verify_quote(quote, chunks, min_fuzzy_ratio=0.95)

    assert verified is True
    assert page == 2

def test_verify_quote_rejects_hallucination():
    chunks = [
        {"id": "1", "page": 1, "text": "This Agreement is governed by the laws of Delaware."},
        {"id": "2", "page": 2, "text": "Invoices shall be paid within thirty days."},
    ]
    # Completely made up quote not in any chunk
    fabricated_quote = "Vendor warrants 99.999% uptime with zero scheduled downtime or penalty."
    verified, page, _ = verify_quote(fabricated_quote, chunks)

    assert verified is False
    assert page is None

