import re
from typing import List, Tuple
from PyPDF2 import PdfReader

class NoExtractableTextException(Exception):
    """Raised when extracted text from PDF is below minimum threshold (< 200 chars)."""
    def __init__(self, message: str = "Extracted text is below threshold. Scanned PDFs / OCR are out of scope."):
        super().__init__(message)
        self.code = "NO_EXTRACTABLE_TEXT"

def normalize_text(text: str) -> str:
    """Normalize whitespace while preserving paragraphs and punctuation."""
    if not text:
        return ""
    # Normalize carriage returns and non-breaking spaces
    text = text.replace('\r\n', '\n').replace('\r', '\n').replace('\xa0', ' ')
    # Collapse multiple horizontal spaces to single space
    text = re.sub(r'[ \t]+', ' ', text)
    # Collapse 3 or more newlines to 2 newlines (paragraph separator)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def extract_text_by_pages(file_path: str, min_char_threshold: int = 200) -> List[Tuple[int, str]]:
    """
    Extracts text page-by-page (1-indexed) using PyPDF2.
    Returns: List of (page_number, page_text)
    Raises: NoExtractableTextException if total chars < min_char_threshold
    """
    reader = PdfReader(file_path)
    pages: List[Tuple[int, str]] = []
    total_chars = 0

    for idx, page in enumerate(reader.pages):
        page_num = idx + 1
        raw_text = page.extract_text() or ""
        clean_text = normalize_text(raw_text)
        pages.append((page_num, clean_text))
        total_chars += len(clean_text)

    if total_chars < min_char_threshold:
        raise NoExtractableTextException(
            f"Extracted only {total_chars} characters (threshold is {min_char_threshold}). "
            "Scanned PDF or image-only document detected (OCR out of scope)."
        )

    return pages

