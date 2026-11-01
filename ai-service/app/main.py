from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .db import check_db_health
from .schemas import HealthResponse
from .routers import ingest, templates, analyze, rewrite

app = FastAPI(
    title="Intelligent Legal Contract & Vendor Risk Analyzer - AI Service",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[AI Service Error] {request.method} {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_SERVER_ERROR", "message": "An internal error occurred in the AI microservice"}}
    )

@app.get("/health", response_model=HealthResponse)
async def health():
    db_ok = check_db_health()
    return HealthResponse(
        status="healthy" if db_ok else "degraded",
        service="ai-service",
        database="connected" if db_ok else "disconnected",
        embedding_provider=settings.embedding_provider,
        llm_provider=settings.llm_provider
    )

# Include Routers
app.include_router(ingest.router)
app.include_router(templates.router)
app.include_router(analyze.router)
app.include_router(rewrite.router)

