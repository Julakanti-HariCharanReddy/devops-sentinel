"""Strip common credentials from log text before it is stored or sent to an LLM."""
import re

_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S),
     "[REDACTED_PRIVATE_KEY]"),
    # scheme://user:password@host
    (re.compile(r"(\b[a-z][a-z0-9+.-]*://[^\s:/@]+:)[^\s@/]+(@)", re.I), r"\1[REDACTED]\2"),
    (re.compile(r"(\bBearer\s+)[A-Za-z0-9\-._~+/]+=*", re.I), r"\1[REDACTED_TOKEN]"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"), "[REDACTED_JWT]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED_AWS_KEY]"),
    (re.compile(r"\b(?:sk|pk|rk)_(?:live|test)?_?[A-Za-z0-9]{16,}\b"), "[REDACTED_API_KEY]"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(
        r"""(\b(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|"""
        r"""client[_-]?secret|private[_-]?key|token)\b["']?\s*[:=]\s*["']?)[^\s"',;&]+""", re.I),
     r"\1[REDACTED]"),
]


def redact(text: str) -> tuple[str, int]:
    total = 0
    for pattern, repl in _PATTERNS:
        text, n = pattern.subn(repl, text)
        total += n
    return text, total
