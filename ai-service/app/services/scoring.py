import math
from typing import List, Dict, Any, Tuple

# Clause category weights and retrieval queries per specification (Section 5.4)
CLAUSE_CONFIG = {
    "liability": {
        "weight": 1.5,
        "query": "limitation of liability aggregate damages uncapped cap exclusions",
        "description": "Caps on direct and indirect damages, exclusions for gross negligence or willful misconduct.",
    },
    "indemnity": {
        "weight": 1.4,
        "query": "indemnification defend hold harmless claims liabilities third-party infringement",
        "description": "Duty to defend and indemnify against intellectual property infringement and gross negligence.",
    },
    "termination": {
        "weight": 1.3,
        "query": "termination for convenience notice period breach cure period immediate",
        "description": "Termination for convenience with notice and termination for cause with cure period.",
    },
    "auto_renewal": {
        "weight": 1.2,
        "query": "automatic renewal term notice of non-renewal cancel opt-out",
        "description": "Automatic renewal provisions and required prior written notice window.",
    },
    "data_protection": {
        "weight": 1.3,
        "query": "data privacy personal data gdpr security breach notification safeguards",
        "description": "Security standards, compliance with GDPR/CCPA, and incident notification timelines.",
    },
    "ip_ownership": {
        "weight": 1.2,
        "query": "intellectual property rights work made for hire license ownership deliverables",
        "description": "Customer retention of IP in customer data and custom deliverables.",
    },
    "payment_terms": {
        "weight": 1.0,
        "query": "payment due net days invoices interest late fees taxes disputed",
        "description": "Payment timeline (e.g. Net 30), reasonable late fees, good-faith dispute withholding.",
    },
    "confidentiality": {
        "weight": 0.8,
        "query": "confidential information obligations non-disclosure term exceptions trade secrets",
        "description": "Standard mutual duty of care, reasonable survival term, customary exclusions.",
    },
    "governing_law": {
        "weight": 0.7,
        "query": "governing law jurisdiction dispute resolution arbitration venue court",
        "description": "Choice of governing law and domestic, neutral court jurisdiction.",
    },
    "warranty": {
        "weight": 0.9,
        "query": "representations warranties as-is disclaimer merchantability fitness workmanlike",
        "description": "Express service warranties, compliance with documentation, non-infringement.",
    },
}

RISK_POINTS = {
    "LOW": 1,
    "MEDIUM": 3,
    "HIGH": 5,
}

def calculate_risk_band(score: int) -> str:
    """Bands: 0-33 LOW, 34-66 MEDIUM, 67-100 HIGH."""
    if score <= 33:
        return "LOW"
    elif score <= 66:
        return "MEDIUM"
    return "HIGH"

def calculate_overall_risk_score(
    findings: List[Dict[str, Any]],
    analyzed_clause_types: List[str]
) -> Tuple[int, str]:
    """
    Computes weighted risk score:
    Point values: LOW=1, MEDIUM=3, HIGH=5 multiplied by clause weight.
    If a clause has multiple findings, the highest risk level is taken for that clause type.
    If an analyzed clause type has no findings, its risk point is treated as LOW (1 point).
    Overall score = round(100 * sum(points) / sum(max_points_for_analyzed_clause_types)), clamped 0-100.
    """
    if not analyzed_clause_types:
        return 0, "LOW"

    # Map clause type to worst finding level
    worst_risk_by_clause: Dict[str, str] = {}
    for f in findings:
        ctype = f.get("clause_type")
        rlevel = f.get("risk_level", "LOW").upper()
        if ctype in analyzed_clause_types:
            current_worst = worst_risk_by_clause.get(ctype, "LOW")
            if RISK_POINTS.get(rlevel, 1) > RISK_POINTS.get(current_worst, 1):
                worst_risk_by_clause[ctype] = rlevel

    total_points = 0.0
    total_max_points = 0.0

    for ctype in analyzed_clause_types:
        weight = CLAUSE_CONFIG.get(ctype, {}).get("weight", 1.0)
        max_points = 5.0 * weight
        total_max_points += max_points

        # If flagged, use worst risk level; if clean, assign baseline LOW (1)
        rlevel = worst_risk_by_clause.get(ctype, "LOW")
        points = float(RISK_POINTS.get(rlevel, 1)) * weight
        total_points += points

    if total_max_points <= 0:
        return 0, "LOW"

    raw_score = round(100.0 * (total_points / total_max_points))
    clamped_score = max(0, min(100, raw_score))
    band = calculate_risk_band(clamped_score)

    return clamped_score, band

