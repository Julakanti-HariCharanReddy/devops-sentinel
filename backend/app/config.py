import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader so the app has no extra runtime dependency."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(BACKEND_DIR / ".env")

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "").strip()
SARVAM_BASE_URL = os.getenv("SARVAM_BASE_URL", "https://api.sarvam.ai/v1").rstrip("/")
# Per https://docs.sarvam.ai/api-reference-docs/chat/chat-completions
SARVAM_MODEL = os.getenv("SARVAM_MODEL", "sarvam-105b")
SARVAM_TIMEOUT_S = float(os.getenv("SARVAM_TIMEOUT_S", "90"))

# Supabase persistence (server-side secret / service_role key). When unset, local SQLite is used.
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "").strip()

# Live monitoring: "Name|URL;Name|URL". Each URL gets a real HTTP GET every MONITOR_INTERVAL_S.
ON_VERCEL = bool(os.getenv("VERCEL"))
_self_url = (f"https://{os.environ['VERCEL_PROJECT_PRODUCTION_URL']}" if os.getenv("VERCEL_PROJECT_PRODUCTION_URL")
             else "http://127.0.0.1:8000")
MONITOR_TARGETS = os.getenv(
    "MONITOR_TARGETS", f"Sentinel API|{_self_url}/api/health;Sarvam AI API|https://api.sarvam.ai")
MONITOR_INTERVAL_S = float(os.getenv("MONITOR_INTERVAL_S", "30"))
MONITOR_TIMEOUT_S = float(os.getenv("MONITOR_TIMEOUT_S", "5"))
MONITOR_DEGRADED_MS = float(os.getenv("MONITOR_DEGRADED_MS", "1500"))

# Serverless filesystems are read-only except /tmp (ephemeral): use Supabase for durable storage there.
DB_PATH = Path(os.getenv("SENTINEL_DB_PATH", "/tmp/sentinel.db" if ON_VERCEL else str(BACKEND_DIR / "sentinel.db")))

# When set, every /api route except /api/health requires the X-Access-Code header.
ACCESS_CODE = os.getenv("ACCESS_CODE", "").strip()
SAMPLE_LOGS_DIR = PROJECT_DIR / "sample-logs"

CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

MAX_LOG_BYTES = int(os.getenv("MAX_LOG_BYTES", str(512 * 1024)))
MAX_LOG_LINES = int(os.getenv("MAX_LOG_LINES", "5000"))
# Lines sent to the LLM after filtering to errors, warnings and suspicious events.
MAX_AI_EXCERPT_LINES = int(os.getenv("MAX_AI_EXCERPT_LINES", "120"))
ALLOWED_UPLOAD_EXTENSIONS = {".log", ".txt"}
