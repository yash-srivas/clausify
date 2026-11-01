import pytest
from app.services.rules import evaluate_rules

def test_evaluate_rules_unlimited_liability():
    chunks = [
        {"page": 2, "text": "Section 4.1 Vendor liability shall be unlimited and Vendor shall not be subject to any aggregate cap."}
    ]
    finding = evaluate_rules("liability", chunks)
    assert finding is not None
    assert finding["risk_level"] == "HIGH"
    assert finding["page"] == 2
    assert "unlimited" in finding["text_span"].lower()

def test_evaluate_rules_auto_renewal():
    chunks = [
        {"page": 1, "text": "This Agreement shall automatically renew for successive terms of three (3) years unless Vendor terminates."}
    ]
    finding = evaluate_rules("auto_renewal", chunks)
    assert finding is not None
    assert finding["risk_level"] == "HIGH"
    assert finding["page"] == 1
    assert "automatically renew" in finding["text_span"].lower()

def test_evaluate_rules_termination():
    chunks = [
        {"page": 2, "text": "Vendor may terminate this Agreement at any time without cause or prior notice in its sole discretion."}
    ]
    finding = evaluate_rules("termination", chunks)
    assert finding is not None
    assert finding["risk_level"] == "HIGH"
    assert finding["page"] == 2
    assert "without cause" in finding["text_span"].lower()

def test_evaluate_rules_compliant_clause_returns_none():
    chunks = [
        {"page": 2, "text": "Either party may terminate upon thirty (30) days prior written notice."}
    ]
    finding = evaluate_rules("termination", chunks)
    assert finding is None

