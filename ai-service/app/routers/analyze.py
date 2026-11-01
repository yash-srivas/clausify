import hashlib
import asyncio
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Header, status
from ..schemas import AnalyzeRequest, AnalyzeResponse, FindingModel, AnalyzeStats
from ..config import settings
from ..db import get_db
from ..prompts import PROMPT_VERSION
from ..services.retrieval import retrieve_contract_chunks, get_template_clause
from ..services.scoring import CLAUSE_CONFIG, calculate_overall_risk_score
from ..services.verifier import verify_quote
from ..services.rules import evaluate_rules
from ..services.llm import get_llm

router = APIRouter(prefix="", tags=["Analysis"])

def verify_internal_key(x_internal_key: str = Header(None)):
    if not x_internal_key or x_internal_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Invalid or missing X-Internal-Key"}}
        )

def compute_input_hash(chunk_ids: List[str], template_text: str) -> str:
    sorted_ids = ",".join(sorted(chunk_ids))
    content = f"{sorted_ids}|{template_text}|{PROMPT_VERSION}"
    return hashlib.sha256(content.encode("utf-8")).hexdigest()

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_contract(
    req: AnalyzeRequest,
    x_internal_key: str = Header(None)
):
    verify_internal_key(x_internal_key)

    clause_types = req.clause_types or list(CLAUSE_CONFIG.keys())
    llm = get_llm()

    all_findings: List[Dict[str, Any]] = []
    stats = {
        "clauses_analyzed": len(clause_types),
        "findings": 0,
        "rejected_unverified": 0,
        "cache_hits": 0,
    }

    # Delete existing findings for this contract before reanalysis
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM findings WHERE contract_id = %s", (req.contract_id,))

    # Process in small batches
    batch_size = max(1, settings.analyze_batch_size)
    for i in range(0, len(clause_types), batch_size):
        batch = clause_types[i : i + batch_size]

        for ctype in batch:
            config = CLAUSE_CONFIG.get(ctype, {
                "weight": 1.0,
                "query": ctype,
                "description": f"Standard {ctype} clause obligations and liabilities."
            })

            # 1. Retrieve top-k chunks
            chunks = retrieve_contract_chunks(
                contract_id=req.contract_id,
                query_text=config["query"],
                top_k=settings.top_k
            )

            # 2. Fetch template clause
            tpl_clause = get_template_clause(req.template_id, ctype)
            template_text = tpl_clause["text"] if tpl_clause else ""
            template_clause_id = tpl_clause["id"] if tpl_clause else None
            is_required = tpl_clause["is_required"] if tpl_clause else True

            # 3. Check analysis cache
            chunk_ids = [c["id"] for c in chunks]
            input_hash = compute_input_hash(chunk_ids, template_text)

            cached_result = None
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT result FROM analysis_cache
                        WHERE contract_id = %s AND clause_type = %s AND input_hash = %s
                        LIMIT 1
                        """,
                        (req.contract_id, ctype, input_hash)
                    )
                    row = cur.fetchone()
                    if row:
                        cached_result = row[0]
                        stats["cache_hits"] += 1

            if cached_result:
                finding_data = cached_result
            else:
                # 4. Call LLM
                finding_data = llm.generate_analysis(
                    clause_type=ctype,
                    clause_definition=config["description"],
                    safe_template_text=template_text,
                    chunks=chunks,
                    contract_id=req.contract_id
                )

                # Cache finding result
                with get_db() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO analysis_cache (contract_id, clause_type, input_hash, result, created_at)
                            VALUES (%s, %s, %s, %s::jsonb, NOW())
                            ON CONFLICT (contract_id, clause_type, input_hash) DO NOTHING
                            """,
                            (req.contract_id, ctype, input_hash, json_dumps(finding_data))
                        )

            # 5. Process status and verification
            clause_finding = None

            if finding_data.get("status") == "NOT_FOUND":
                # Missing clause: flag if required by template
                if is_required and template_text:
                    clause_finding = {
                        "clause_type": ctype,
                        "risk_level": "MEDIUM",
                        "page": 1,
                        "text_span": "Clause not present in contract",
                        "reason": f"Required safe clause '{ctype}' is completely absent from the vendor contract.",
                        "suggested_rewrite": template_text,
                        "source": "rule",
                        "template_clause_id": template_clause_id,
                        "verified": True
                    }
            elif finding_data.get("risk_level") in ["LOW", "MEDIUM", "HIGH"]:
                # Verify quote against retrieved chunks
                raw_quote = finding_data.get("text_span", "")
                verified, matched_page, clean_quote = verify_quote(raw_quote, chunks)

                if verified and matched_page:
                    clause_finding = {
                        "clause_type": ctype,
                        "risk_level": finding_data["risk_level"],
                        "page": matched_page,  # Derived strictly from source chunk
                        "text_span": clean_quote,
                        "reason": finding_data.get("reason", "Deviates from template benchmark."),
                        "suggested_rewrite": finding_data.get("suggested_rewrite", template_text),
                        "source": "llm",
                        "template_clause_id": template_clause_id,
                        "verified": True
                    }
                else:
                    # Quote verification failed: retry once with strict extraction or drop
                    stats["rejected_unverified"] += 1
                    print(f"[Verifier Warning] Rejected unverified quote for {ctype}: '{raw_quote}'")

            # 6. Run Rule Heuristics
            rule_finding = evaluate_rules(ctype, chunks)
            if rule_finding:
                rule_finding["template_clause_id"] = template_clause_id
                rule_finding["verified"] = True

                if not clause_finding:
                    clause_finding = rule_finding
                else:
                    # If rule check indicates higher risk than LLM, elevate risk
                    if rule_finding["risk_level"] == "HIGH" and clause_finding["risk_level"] != "HIGH":
                        clause_finding["risk_level"] = "HIGH"
                        clause_finding["reason"] += f" (Elevated to HIGH: {rule_finding['reason']})"
                        clause_finding["source"] = "rule"

            if clause_finding:
                all_findings.append(clause_finding)

        # Brief rate-limiting pause between batches
        if settings.analyze_batch_delay_ms > 0 and (i + batch_size < len(clause_types)):
            await asyncio.sleep(settings.analyze_batch_delay_ms / 1000.0)

    # 7. Compute Overall Score and Risk Band
    overall_score, risk_band = calculate_overall_risk_score(all_findings, clause_types)
    stats["findings"] = len(all_findings)

    # 8. Persist findings into PostgreSQL
    with get_db() as conn:
        with conn.cursor() as cur:
            for f in all_findings:
                cur.execute(
                    """
                    INSERT INTO findings (
                        contract_id, clause_type, risk_level, page, text_span,
                        reason, suggested_rewrite, template_clause_id, source, verified, status, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'open', NOW())
                    """,
                    (
                        req.contract_id,
                        f["clause_type"],
                        f["risk_level"],
                        f["page"],
                        f["text_span"],
                        f["reason"],
                        f.get("suggested_rewrite"),
                        f.get("template_clause_id"),
                        f.get("source", "llm"),
                        f.get("verified", True)
                    )
                )

            # Update contract status and overall risk score
            cur.execute(
                """
                UPDATE contracts
                SET status = 'analyzed',
                    overall_risk_score = %s,
                    analyzed_at = NOW(),
                    updated_at = NOW()
                WHERE id = %s
                """,
                (overall_score, req.contract_id)
            )

    return AnalyzeResponse(
        contract_id=req.contract_id,
        overall_risk_score=overall_score,
        risk_band=risk_band,
        findings=[FindingModel(**f) for f in all_findings],
        stats=AnalyzeStats(**stats)
    )

def json_dumps(data: Any) -> str:
    import json
    return json.dumps(data)

