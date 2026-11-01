import json
import re
from typing import Dict, Any, List, Optional
from abc import ABC, abstractmethod
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from ..config import settings
from ..prompts import SYSTEM_PROMPT, ANALYSIS_USER_PROMPT, REWRITE_USER_PROMPT
from ..db import get_db

class BaseLLM(ABC):
    @abstractmethod
    def generate_analysis(
        self,
        clause_type: str,
        clause_definition: str,
        safe_template_text: str,
        chunks: List[Dict[str, Any]],
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        pass

    @abstractmethod
    def generate_rewrite(
        self,
        clause_type: str,
        clause_text: str,
        template_clause_text: str,
        tone: str = "neutral",
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        pass

def extract_verbatim_sentence(text: str, pattern: str) -> str:
    """Finds a regex pattern in text and returns the exact surrounding sentence."""
    match = re.search(pattern, text, re.IGNORECASE)
    if not match:
        return ""
    start = max(0, text.rfind('.', 0, match.start()) + 1)
    if start == 0:
        newline_idx = text.rfind('\n', 0, match.start())
        start = 0 if newline_idx == -1 else newline_idx + 1

    end = text.find('.', match.end())
    if end == -1:
        end = text.find('\n', match.end())
    end = len(text) if end == -1 else end + 1

    sentence = text[start:end].strip()
    return sentence if sentence else match.group(0)

class MockLLM(BaseLLM):
    """
    High-fidelity deterministic Mock LLM for offline testing without an OpenAI API key.
    Inspects retrieved chunks for high-risk legal patterns and extracts verbatim quotes.
    """
    def generate_analysis(
        self,
        clause_type: str,
        clause_definition: str,
        safe_template_text: str,
        chunks: List[Dict[str, Any]],
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        if not chunks:
            return {"status": "NOT_FOUND"}

        full_text = " \n ".join([c.get("text", "") for c in chunks])

        # 1. Liability
        if clause_type == "liability":
            if "liability" not in full_text.lower() and "damages" not in full_text.lower():
                return {"status": "NOT_FOUND"}
            if re.search(r'(unlimited|no\s+aggregate\s+cap|not\s+be\s+subject\s+to\s+any\s+aggregate\s+cap)', full_text, re.I):
                quote = extract_verbatim_sentence(full_text, r'liability\s+shall\s+be\s+unlimited|not\s+be\s+subject\s+to\s+any\s+aggregate\s+cap')
                return {
                    "status": "FOUND",
                    "clause_type": "liability",
                    "risk_level": "HIGH",
                    "text_span": quote or "Vendor liability shall be unlimited and Vendor shall not be subject to any aggregate cap on damages whatsoever under this Agreement.",
                    "reason": "Deviates from template, which caps liability at a fixed multiple of 12 months fees. Current clause leaves unlimited catastrophic liability.",
                    "suggested_rewrite": safe_template_text or "Vendor aggregate liability under this Agreement shall not exceed total fees paid in the preceding twelve (12) months."
                }
            return {
                "status": "FOUND",
                "clause_type": "liability",
                "risk_level": "LOW",
                "text_span": extract_verbatim_sentence(full_text, r'liability') or "Liability terms present in contract.",
                "reason": "Liability terms align with standard commercial expectations.",
                "suggested_rewrite": safe_template_text
            }

        # 2. Auto-Renewal
        elif clause_type == "auto_renewal":
            if "renew" not in full_text.lower() and "term" not in full_text.lower():
                return {"status": "NOT_FOUND"}
            if re.search(r'(automatically\s+renew|renewal\s+period)', full_text, re.I):
                quote = extract_verbatim_sentence(full_text, r'automatically\s+renew')
                return {
                    "status": "FOUND",
                    "clause_type": "auto_renewal",
                    "risk_level": "HIGH",
                    "text_span": quote or "This Agreement shall automatically renew for successive terms of three (3) years unless Vendor terminates the contract.",
                    "reason": "Deviates from safe template: binds customer to multi-year renewal terms without reasonable customer non-renewal notification window.",
                    "suggested_rewrite": safe_template_text or "This Agreement may renew for successive one-year terms only upon mutual written agreement, or upon 60 days notice of non-renewal."
                }
            return {
                "status": "FOUND",
                "clause_type": "auto_renewal",
                "risk_level": "LOW",
                "text_span": extract_verbatim_sentence(full_text, r'term') or "Standard renewal terms.",
                "reason": "Renewal terms comply with corporate guidelines.",
                "suggested_rewrite": safe_template_text
            }

        # 3. Termination
        elif clause_type == "termination":
            if "terminate" not in full_text.lower() and "termination" not in full_text.lower():
                return {"status": "NOT_FOUND"}
            if re.search(r'(without\s+cause|sole\s+discretion|may\s+not\s+terminate)', full_text, re.I):
                quote = extract_verbatim_sentence(full_text, r'terminate\s+this\s+agreement\s+at\s+any\s+time\s+without\s+cause|customer\s+may\s+not\s+terminate')
                return {
                    "status": "FOUND",
                    "clause_type": "termination",
                    "risk_level": "HIGH",
                    "text_span": quote or "Vendor may terminate this Agreement at any time without cause or prior notice in its sole discretion.",
                    "reason": "Deviates from template by granting vendor immediate unilateral termination while locking customer into full financial term.",
                    "suggested_rewrite": safe_template_text or "Either party may terminate this Agreement without cause upon giving at least thirty (30) days prior written notice."
                }
            return {
                "status": "FOUND",
                "clause_type": "termination",
                "risk_level": "LOW",
                "text_span": extract_verbatim_sentence(full_text, r'terminate') or "Standard termination terms.",
                "reason": "Termination notice periods adhere to approved 30-day standards.",
                "suggested_rewrite": safe_template_text
            }

        # 4. Indemnity
        elif clause_type == "indemnity":
            if "indemnif" not in full_text.lower() and "hold harmless" not in full_text.lower():
                return {"status": "NOT_FOUND"}
            if re.search(r'(no\s+obligation\s+to\s+defend|shall\s+have\s+no\s+obligation|customer\s+shall\s+indemnify)', full_text, re.I):
                quote = extract_verbatim_sentence(full_text, r'no\s+obligation\s+to\s+defend|customer\s+shall\s+indemnify')
                return {
                    "status": "FOUND",
                    "clause_type": "indemnity",
                    "risk_level": "HIGH",
                    "text_span": quote or "Vendor shall have no obligation to defend or indemnify Customer against any third-party claims alleging infringement.",
                    "reason": "Unilateral indemnification placing all third-party defense duties on Customer with zero vendor IP indemnification.",
                    "suggested_rewrite": safe_template_text or "Each party shall defend, indemnify, and hold harmless the other party against material breaches and IP infringement."
                }
            return {
                "status": "FOUND",
                "clause_type": "indemnity",
                "risk_level": "LOW",
                "text_span": extract_verbatim_sentence(full_text, r'indemnif') or "Mutual indemnification clause.",
                "reason": "Balanced mutual indemnification detected.",
                "suggested_rewrite": safe_template_text
            }

        # 5. Data Protection
        elif clause_type == "data_protection":
            if "data" not in full_text.lower() and "privacy" not in full_text.lower() and "security" not in full_text.lower():
                return {"status": "NOT_FOUND"}
            if re.search(r'(does\s+not\s+warrant\s+compliance|without\s+end-to-end|ninety\s+\(90\)\s+business\s+days)', full_text, re.I):
                quote = extract_verbatim_sentence(full_text, r'does\s+not\s+warrant\s+compliance|within\s+ninety')
                return {
                    "status": "FOUND",
                    "clause_type": "data_protection",
                    "risk_level": "HIGH",
                    "text_span": quote or "Vendor does not warrant compliance with GDPR, HIPAA, or CCPA.",
                    "reason": "Vendor expressly disclaims data privacy compliance and delays security breach notification up to 90 days.",
                    "suggested_rewrite": safe_template_text
                }
            return {
                "status": "FOUND",
                "clause_type": "data_protection",
                "risk_level": "LOW",
                "text_span": extract_verbatim_sentence(full_text, r'data') or "Standard data protection clause.",
                "reason": "Satisfactory GDPR/CCPA data protection measures.",
                "suggested_rewrite": safe_template_text
            }

        # 6. IP Ownership
        elif clause_type == "ip_ownership":
            if "intellectual property" not in full_text.lower() and "proprietary" not in full_text.lower() and "assign" not in full_text.lower():
                return {"status": "NOT_FOUND"}
            if re.search(r'(assigns\s+and\s+transfers|perpetual\s+worldwide\s+rights)', full_text, re.I):
                quote = extract_verbatim_sentence(full_text, r'assigns\s+and\s+transfers|perpetual\s+worldwide')
                return {
                    "status": "FOUND",
                    "clause_type": "ip_ownership",
                    "risk_level": "HIGH",
                    "text_span": quote or "Customer hereby assigns and transfers to Vendor all right, title, and interest in and to all data and custom workflows.",
                    "reason": "Customer forfeits title and ownership to custom work product and customer-derived IP.",
                    "suggested_rewrite": safe_template_text
                }
            return {
                "status": "FOUND",
                "clause_type": "ip_ownership",
                "risk_level": "LOW",
                "text_span": extract_verbatim_sentence(full_text, r'intellectual') or "Standard IP ownership provisions.",
                "reason": "Customer retains IP ownership in deliverables.",
                "suggested_rewrite": safe_template_text
            }

        # 7. Payment Terms
        elif clause_type == "payment_terms":
            if "payment" not in full_text.lower() and "invoice" not in full_text.lower() and "fees" not in full_text.lower():
                return {"status": "NOT_FOUND"}
            if re.search(r'(3\.5%|ten\s+\(10\)\s+calendar\s+days|unilateral\s+right\s+to\s+increase)', full_text, re.I):
                quote = extract_verbatim_sentence(full_text, r'ten\s+\(10\)\s+calendar\s+days|unilateral\s+right\s+to\s+increase|3\.5%')
                return {
                    "status": "FOUND",
                    "clause_type": "payment_terms",
                    "risk_level": "HIGH",
                    "text_span": quote or "Customer shall remit payments within ten (10) calendar days of invoice date.",
                    "reason": "Payment window of 10 days is aggressively short and late fee interest is usurious.",
                    "suggested_rewrite": safe_template_text
                }
            return {
                "status": "FOUND",
                "clause_type": "payment_terms",
                "risk_level": "LOW",
                "text_span": extract_verbatim_sentence(full_text, r'payment|invoice') or "Net 30 payment terms.",
                "reason": "Payment terms adhere to standard Net 30 guidelines.",
                "suggested_rewrite": safe_template_text
            }

        # 8. Warranty
        elif clause_type == "warranty":
            if "warrant" not in full_text.lower() and "as-is" not in full_text.lower():
                return {"status": "NOT_FOUND"}
            if re.search(r'(strictly\s+as-is|disclaimer\s+of\s+all\s+warranties)', full_text, re.I):
                quote = extract_verbatim_sentence(full_text, r'strictly\s+as-is')
                return {
                    "status": "FOUND",
                    "clause_type": "warranty",
                    "risk_level": "HIGH",
                    "text_span": quote or "The services are provided strictly AS-IS and AS-AVAILABLE without warranty of any kind.",
                    "reason": "Broad disclaimer stripping all service level and performance guarantees.",
                    "suggested_rewrite": safe_template_text
                }
            return {
                "status": "FOUND",
                "clause_type": "warranty",
                "risk_level": "LOW",
                "text_span": extract_verbatim_sentence(full_text, r'warrant') or "Standard warranties provided.",
                "reason": "Satisfactory warranty commitment.",
                "suggested_rewrite": safe_template_text
            }

        # 9. Governing Law
        elif clause_type == "governing_law":
            if "governing law" not in full_text.lower() and "jurisdiction" not in full_text.lower():
                return {"status": "NOT_FOUND"}
            if re.search(r'(cayman\s+islands|switzerland|george\s+town)', full_text, re.I):
                quote = extract_verbatim_sentence(full_text, r'cayman\s+islands|exclusive\s+jurisdiction')
                return {
                    "status": "FOUND",
                    "clause_type": "governing_law",
                    "risk_level": "MEDIUM",
                    "text_span": quote or "This Agreement shall be governed exclusively by the laws of the Cayman Islands.",
                    "reason": "Non-domestic offshore jurisdiction creates expensive cross-border litigation hurdles.",
                    "suggested_rewrite": safe_template_text
                }
            return {
                "status": "FOUND",
                "clause_type": "governing_law",
                "risk_level": "LOW",
                "text_span": extract_verbatim_sentence(full_text, r'governing\s+law') or "Governing law clause.",
                "reason": "Standard domestic venue.",
                "suggested_rewrite": safe_template_text
            }

        # 10. Confidentiality
        elif clause_type == "confidentiality":
            if "confidential" not in full_text.lower():
                return {"status": "NOT_FOUND"}
            return {
                "status": "FOUND",
                "clause_type": "confidentiality",
                "risk_level": "LOW",
                "text_span": extract_verbatim_sentence(full_text, r'confidential') or "Mutual confidentiality obligations.",
                "reason": "Mutual confidentiality terms align with corporate benchmark.",
                "suggested_rewrite": safe_template_text
            }

        return {"status": "NOT_FOUND"}

    def generate_rewrite(
        self,
        clause_type: str,
        clause_text: str,
        template_clause_text: str,
        tone: str = "neutral",
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        prefix = "Strict Compliance Revision: " if tone == "firm" else "Mutual Commercial Revision: "
        rewrite = f"{prefix}{template_clause_text}"
        rationale = f"Replaces risky language with approved benchmark terms in a {tone} tone to safeguard the organization."
        return {
            "suggested_rewrite": rewrite,
            "rationale": rationale
        }

class OpenAILLM(BaseLLM):
    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key)
        self.model = model

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True
    )
    def generate_analysis(
        self,
        clause_type: str,
        clause_definition: str,
        safe_template_text: str,
        chunks: List[Dict[str, Any]],
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        excerpts_formatted = "\n\n".join([
            f"[Chunk ID: {c.get('id')} | Page: {c.get('page')}]\n{c.get('text')}"
            for c in chunks
        ])

        user_content = ANALYSIS_USER_PROMPT.format(
            clause_type=clause_type,
            clause_definition=clause_definition,
            safe_template_text=safe_template_text,
            contract_excerpts=excerpts_formatted
        )

        response = self.client.chat.completions.create(
            model=self.model,
            temperature=0.0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content}
            ]
        )

        # Log tokens in DB
        if response.usage and contract_id:
            try:
                with get_db() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO api_usage (service, tokens_in, tokens_out, contract_id, created_at)
                            VALUES ('llm', %s, %s, %s, NOW())
                            """,
                            (response.usage.prompt_tokens, response.usage.completion_tokens, contract_id)
                        )
            except Exception as e:
                print(f"[API Usage Log Error] {e}")

        raw_json = response.choices[0].message.content
        return json.loads(raw_json)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True
    )
    def generate_rewrite(
        self,
        clause_type: str,
        clause_text: str,
        template_clause_text: str,
        tone: str = "neutral",
        contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        user_content = REWRITE_USER_PROMPT.format(
            clause_type=clause_type,
            clause_text=clause_text,
            template_clause_text=template_clause_text,
            tone=tone
        )

        response = self.client.chat.completions.create(
            model=self.model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content}
            ]
        )

        raw_json = response.choices[0].message.content
        return json.loads(raw_json)

def get_llm() -> BaseLLM:
    if settings.llm_provider == "openai" and settings.openai_api_key:
        return OpenAILLM(api_key=settings.openai_api_key, model=settings.llm_model)
    return MockLLM()

