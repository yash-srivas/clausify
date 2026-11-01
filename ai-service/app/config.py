import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from ai-service directory
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

class Settings:
    def __init__(self):
        self.database_url: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/legal_risk_analyzer")
        self.internal_api_key: str = os.getenv("INTERNAL_API_KEY", "dev-internal-secret-key-32chars-min!")
        self.embedding_provider: str = os.getenv("EMBEDDING_PROVIDER", "mock").lower()
        self.llm_provider: str = os.getenv("LLM_PROVIDER", "mock").lower()
        self.openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
        self.embedding_model: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
        self.llm_model: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
        self.embedding_dim: int = int(os.getenv("EMBEDDING_DIM", "1536"))
        self.ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.analyze_batch_size: int = int(os.getenv("ANALYZE_BATCH_SIZE", "3"))
        self.analyze_batch_delay_ms: int = int(os.getenv("ANALYZE_BATCH_DELAY_MS", "100"))
        self.top_k: int = int(os.getenv("TOP_K", "4"))
        self.upload_dir: str = os.getenv("UPLOAD_DIR", "../backend/uploads")

settings = Settings()
