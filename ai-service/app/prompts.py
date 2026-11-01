"""
Standardized Prompts and Schemas for Legal Risk Analysis and Redlining.
"""

PROMPT_VERSION = "v1.0.0"

SYSTEM_PROMPT = (
    "You are a senior contract risk analyst. Use ONLY the provided CONTRACT EXCERPTS and "
    "SAFE TEMPLATE CLAUSE. Do not use outside knowledge. Quote text exactly, character for character. "
    "Respond with a single JSON object and nothing else."
)

ANALYSIS_USER_PROMPT = """
You are evaluating a vendor contract clause for deviations against the organization's Standard Safe Legal Template.

CLAUSE CATEGORY: {clause_type}
CATEGORY DEFINITION: {clause_definition}

SAFE BENCHMARK TEMPLATE CLAUSE:
\"\"\"{safe_template_text}\"\"\"

CONTRACT EXCERPTS (Retrieved from uploaded document):
{contract_excerpts}

RISK EVALUATION RUBRIC:
- HIGH: Significant legal exposure, unlimited liability, absence of aggregate damages cap, one-sided termination, forced vendor auto-renewal, customer IP forfeiture, or lack of data security standards.
- MEDIUM: Minor deviation from template, ambiguous notice windows, non-standard payment terms, or lack of mutual indemnity.
- LOW: Substantially aligns with safe template benchmark with standard commercially acceptable terms.

INSTRUCTIONS:
1. If the clause category is not addressed in any of the excerpts, respond with:
   {{"status": "NOT_FOUND"}}
2. If found, identify the specific deviation, select an EXACT VERBATIM QUOTE (text_span) from the excerpts, and propose a safer replacement aligned with the safe template clause.
3. Your response MUST be valid JSON matching this schema:
{{
  "status": "FOUND",
  "clause_type": "{clause_type}",
  "risk_level": "LOW|MEDIUM|HIGH",
  "text_span": "Exact verbatim sentence quoted from the excerpt",
  "reason": "Clear explanation of why this deviates from the safe template",
  "suggested_rewrite": "Replacement text based on the safe template clause"
}}
"""

REWRITE_USER_PROMPT = """
Rewrite the following contract clause to align with the organization's approved Safe Template.

CLAUSE TYPE: {clause_type}
CURRENT CONTRACT CLAUSE:
\"\"\"{clause_text}\"\"\"

SAFE TEMPLATE BENCHMARK:
\"\"\"{template_clause_text}\"\"\"

REQUESTED TONE: {tone} (neutral: balanced commercial language; firm: protective, strict corporate compliance)

Respond with a single JSON object:
{{
  "suggested_rewrite": "Proposed replacement clause text",
  "rationale": "Brief 1-2 sentence explanation of improvements made"
}}
"""

