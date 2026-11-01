import re
import difflib
from typing import List, Dict, Any, Tuple, Optional

def normalize_for_matching(text: str) -> str:
    """Normalize text for quote verification: lowercase, standard quotes, collapsed spaces."""
    if not text:
        return ""
    # Standardize unicode quotes and dashes
    s = text.lower()
    s = re.sub(r'[\u2018\u2019\u201a\u201b\u2032\u2035`\']', "'", s)
    s = re.sub(r'[\u201c\u201d\u201e\u201f\u2033\u2036"]', '"', s)
    s = re.sub(r'[\u2013\u2014\u2015-]', '-', s)
    # Collapse all whitespace and linebreaks to single space
    s = re.sub(r'\s+', ' ', s)
    return s.strip()

def verify_quote(
    text_span: str,
    retrieved_chunks: List[Dict[str, Any]],
    min_fuzzy_ratio: float = 0.95
) -> Tuple[bool, Optional[int], str]:
    """
    Verifies that text_span appears in one of the retrieved chunks.
    Matches exact normalized substring first, then falls back to sliding-window fuzzy match (>= 0.95).
    Crucially derives the exact source page number from the matching chunk, preventing LLM hallucinations.

    Returns:
        (is_verified: bool, page_number: Optional[int], matched_text: str)
    """
    if not text_span or not retrieved_chunks:
        return False, None, ""

    norm_quote = normalize_for_matching(text_span)
    if not norm_quote:
        return False, None, ""

    quote_len = len(norm_quote)

    for chunk in retrieved_chunks:
        chunk_raw = chunk.get("text", "")
        norm_chunk = normalize_for_matching(chunk_raw)
        chunk_page = chunk.get("page")

        # 1. Exact normalized substring match
        if norm_quote in norm_chunk:
            return True, chunk_page, text_span

        # 2. Sliding window fuzzy matching if lengths are comparable
        chunk_len = len(norm_chunk)
        if chunk_len < quote_len:
            # Check ratio directly if chunk is smaller than quote
            matcher = difflib.SequenceMatcher(None, norm_quote, norm_chunk)
            if matcher.ratio() >= min_fuzzy_ratio:
                return True, chunk_page, text_span
        else:
            # Sliding window with step
            window_size = quote_len
            step = max(1, quote_len // 10)
            best_ratio = 0.0

            for i in range(0, chunk_len - window_size + 1, step):
                window = norm_chunk[i : i + window_size]
                ratio = difflib.SequenceMatcher(None, norm_quote, window).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                if best_ratio >= min_fuzzy_ratio:
                    return True, chunk_page, text_span

            # Also check boundary window at the very end
            if chunk_len >= window_size:
                tail_window = norm_chunk[-window_size:]
                tail_ratio = difflib.SequenceMatcher(None, norm_quote, tail_window).ratio()
                if tail_ratio >= min_fuzzy_ratio:
                    return True, chunk_page, text_span

    return False, None, ""

