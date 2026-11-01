import psycopg
from pgvector.psycopg import register_vector
from contextlib import contextmanager
from .config import settings

@contextmanager
def get_db():
    """Context manager for raw psycopg connection with pgvector registered."""
    conn = psycopg.connect(settings.database_url, autocommit=True)
    try:
        register_vector(conn)
        yield conn
    finally:
        conn.close()

def check_db_health() -> bool:
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                res = cur.fetchone()
                return bool(res and res[0] == 1)
    except Exception as e:
        print(f"[DB Health Check Failed] {e}")
        return False

