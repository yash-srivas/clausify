from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import UUID

class HealthResponse(BaseModel):
    status: str
    service: str
    database: str
    embedding_provider: str
    llm_provider: str

class IngestRequest(BaseModel):
    contract_id: str
    file_path: str

class IngestResponse(BaseModel):
    contract_id: str
    page_count: int
    chunk_count: int

class EmbedTemplateRequest(BaseModel):
    template_id: str

class EmbedTemplateResponse(BaseModel):
    template_id: str
    clauses_embedded: int

class FindingModel(BaseModel):
    clause_type: str
    risk_level: str = Field(description="Must be LOW, MEDIUM, or HIGH")
    page: int
    text_span: str
    reason: str
    suggested_rewrite: Optional[str] = None
    source: str = "llm"
    template_clause_id: Optional[str] = None
    verified: bool = True

class AnalyzeStats(BaseModel):
    clauses_analyzed: int
    findings: int
    rejected_unverified: int
    cache_hits: int

class AnalyzeRequest(BaseModel):
    contract_id: str
    template_id: str
    clause_types: Optional[List[str]] = None

class AnalyzeResponse(BaseModel):
    contract_id: str
    overall_risk_score: int
    risk_band: str
    findings: List[FindingModel]
    stats: AnalyzeStats

class RewriteRequest(BaseModel):
    finding_id: Optional[str] = None
    clause_text: Optional[str] = None
    clause_type: str
    template_clause_text: str
    tone: Optional[str] = "neutral"

class RewriteResponse(BaseModel):
    suggested_rewrite: str
    rationale: str

