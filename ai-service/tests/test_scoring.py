import pytest
from app.services.scoring import calculate_overall_risk_score, calculate_risk_band, CLAUSE_CONFIG

def test_risk_band_thresholds():
    assert calculate_risk_band(0) == "LOW"
    assert calculate_risk_band(33) == "LOW"
    assert calculate_risk_band(34) == "MEDIUM"
    assert calculate_risk_band(66) == "MEDIUM"
    assert calculate_risk_band(67) == "HIGH"
    assert calculate_risk_band(100) == "HIGH"

def test_scoring_all_low():
    # If all 10 clauses are analyzed and have no findings (all baseline LOW = 1 point)
    # total points = sum(1 * weight)
    # total max points = sum(5 * weight)
    # score = 100 * (1 / 5) = 20
    clause_types = list(CLAUSE_CONFIG.keys())
    score, band = calculate_overall_risk_score([], clause_types)
    assert score == 20
    assert band == "LOW"

def test_scoring_all_high():
    # If all 10 clauses are flagged HIGH = 5 points
    # score = 100 * (5 / 5) = 100
    clause_types = list(CLAUSE_CONFIG.keys())
    findings = [{"clause_type": c, "risk_level": "HIGH"} for c in clause_types]
    score, band = calculate_overall_risk_score(findings, clause_types)
    assert score == 100
    assert band == "HIGH"

def test_scoring_weighted_calculation():
    clause_types = ["liability", "confidentiality"]
    # liability weight: 1.5, confidentiality weight: 0.8
    # max points = 5*1.5 + 5*0.8 = 7.5 + 4.0 = 11.5
    # Let liability be HIGH (5*1.5 = 7.5), confidentiality be LOW (1*0.8 = 0.8)
    # total points = 7.5 + 0.8 = 8.3
    # score = round(100 * 8.3 / 11.5) = round(72.17) = 72 (HIGH band)
    findings = [{"clause_type": "liability", "risk_level": "HIGH"}]
    score, band = calculate_overall_risk_score(findings, clause_types)
    assert score == 72
    assert band == "HIGH"

def test_scoring_worst_level_taken_for_duplicate_clause():
    clause_types = ["liability"]
    findings = [
        {"clause_type": "liability", "risk_level": "LOW"},
        {"clause_type": "liability", "risk_level": "HIGH"},
    ]
    score, band = calculate_overall_risk_score(findings, clause_types)
    assert score == 100
    assert band == "HIGH"

