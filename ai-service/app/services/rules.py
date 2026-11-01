import re
from typing import List, Dict, Any, Optional

def extract_sentence(text: str, match_start: int, match_end: int) -> str:
    """Extracts the entire sentence enclosing the matched substring."""
    start = text.rfind('.', 0, match_start)
    if start == -1:
        start = text.rfind('\n', 0, match_start)
    start = 0 if start == -1 else start + 1

    end = text.find('.', match_end)
    if end == -1:
        end = text.find('\n', match_end)
    end = len(text) if end == -1 else end + 1

    sentence = text[start:end].strip()
    return sentence if sentence else text[match_start:match_end]

def evaluate_rules(
    clause_type: str,
    chunks: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """
    Executes deterministic legal heuristics over retrieved chunks.
    Extracts verbatim text spans and flags high-risk anomalies.
    """
    for chunk in chunks:
        text = chunk.get("text", "")
        page = chunk.get("page", 1)

        # 1. Liability Heuristics
        if clause_type == "liability":
            match = re.search(
                r'(liability\s+shall\s+be\s+unlimited|no\s+aggregate\s+cap|not\s+be\s+subject\s+to\s+any\s+aggregate\s+cap|uncapped\s+damages)',
                text,
                re.IGNORECASE
            )
            if match:
                span = extract_sentence(text, match.start(), match.end())
                return {
                    "clause_type": "liability",
                    "risk_level": "HIGH",
                    "page": page,
                    "text_span": span,
                    "reason": "Rule check: Contract establishes unlimited vendor liability with no aggregate cap on damages, creating uninsurable catastrophic exposure.",
                    "suggested_rewrite": "Except for confidentiality breaches or gross negligence, neither party's aggregate liability under this Agreement shall exceed the fees paid by Customer in the preceding twelve (12) months.",
                    "source": "rule",
                }

        # 2. Auto-Renewal Heuristics
        elif clause_type == "auto_renewal":
            match = re.search(
                r'(automatically\s+renew\s+for\s+successive\s+terms\s+of\s+\d+\s*(?:years?|yrs?)|automatically\s+renew(?:\s+unless\s+vendor\s+terminates)?)',
                text,
                re.IGNORECASE
            )
            if match:
                span = extract_sentence(text, match.start(), match.end())
                return {
                    "clause_type": "auto_renewal",
                    "risk_level": "HIGH",
                    "page": page,
                    "text_span": span,
                    "reason": "Rule check: Mandatory multi-year automatic renewal detected with asymmetrical termination windows.",
                    "suggested_rewrite": "This Agreement shall renew only upon mutual written agreement, or for successive one-year terms upon at least sixty (60) days prior written notice of renewal.",
                    "source": "rule",
                }

        # 3. Termination Heuristics
        elif clause_type == "termination":
            match = re.search(
                r'(terminate\s+(?:this\s+agreement\s+)?at\s+any\s+time\s+without\s+(?:cause|prior\s+notice)|customer\s+may\s+not\s+terminate.*convenience)',
                text,
                re.IGNORECASE
            )
            if match:
                span = extract_sentence(text, match.start(), match.end())
                return {
                    "clause_type": "termination",
                    "risk_level": "HIGH",
                    "page": page,
                    "text_span": span,
                    "reason": "Rule check: Asymmetrical termination rights detected: vendor permits immediate termination without cause while prohibiting customer convenience termination.",
                    "suggested_rewrite": "Either party may terminate this Agreement without cause upon giving at least thirty (30) days prior written notice to the other party.",
                    "source": "rule",
                }

        # 4. Payment Terms Heuristics
        elif clause_type == "payment_terms":
            interest_match = re.search(r'([2-9]|\d{2,})\.?\d*%\s*(?:per\s*month|compounded\s*daily)', text, re.IGNORECASE)
            days_match = re.search(r'within\s+(?:ten|\b10\b)\s*(?:calendar|business)?\s*days', text, re.IGNORECASE)
            if interest_match or days_match:
                span = extract_sentence(text, (interest_match or days_match).start(), (interest_match or days_match).end())
                return {
                    "clause_type": "payment_terms",
                    "risk_level": "HIGH",
                    "page": page,
                    "text_span": span,
                    "reason": "Rule check: Accelerated payment timeline (Net 10) combined with predatory late interest exceeding 2.0% per month.",
                    "suggested_rewrite": "Customer shall pay undisputed invoices within thirty (30) days of receipt. Late payments shall accrue interest at the lesser of 1.0% per month or the maximum legal rate.",
                    "source": "rule",
                }

        # 5. IP Ownership Heuristics
        elif clause_type == "ip_ownership":
            match = re.search(
                r'(assigns\s+and\s+transfers\s+to\s+vendor\s+all\s+right|perpetual\s+worldwide\s+rights\s+to\s+commercialize.*proprietary)',
                text,
                re.IGNORECASE
            )
            if match:
                span = extract_sentence(text, match.start(), match.end())
                return {
                    "clause_type": "ip_ownership",
                    "risk_level": "HIGH",
                    "page": page,
                    "text_span": span,
                    "reason": "Rule check: Predatory intellectual property clause assigning customer data and derivative workflows to vendor.",
                    "suggested_rewrite": "Customer retains all right, title, and interest in and to Customer Data and custom deliverables. Vendor is granted only a limited license strictly to provide the Services.",
                    "source": "rule",
                }

        # 6. Data Protection Heuristics
        elif clause_type == "data_protection":
            match = re.search(
                r'(does\s+not\s+warrant\s+compliance\s+with\s+gdpr|without\s+end-to-end\s+encryption|within\s+ninety\s+\(90\)\s+business\s+days)',
                text,
                re.IGNORECASE
            )
            if match:
                span = extract_sentence(text, match.start(), match.end())
                return {
                    "clause_type": "data_protection",
                    "risk_level": "HIGH",
                    "page": page,
                    "text_span": span,
                    "reason": "Rule check: Express disclaimer of privacy regulations (GDPR/CCPA) and excessive 90-day breach notification delay.",
                    "suggested_rewrite": "Vendor shall maintain administrative and technical safeguards compliant with applicable data protection laws and notify Customer in writing within twenty-four (24) hours of any security breach.",
                    "source": "rule",
                }

    return None

