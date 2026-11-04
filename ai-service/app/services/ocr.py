"""
OCR Integration & Scanned Document Processing Module
Provides scanned document detection, image pre-processing, pluggable OCR engines,
and page-indexed text extraction preserving quotation verification.
"""

import os
import re
import io
import shutil
from typing import List, Tuple, Dict, Any, Optional
from PyPDF2 import PdfReader
from PIL import Image, ImageOps, ImageEnhance
from .pdf_parser import normalize_text, NoExtractableTextException

class OCREngineNotAvailableException(Exception):
    """Raised when OCR is required but no local or cloud OCR engine is configured."""
    def __init__(self, message: str = "No OCR engine available. Install tesseract-ocr or enable Vision LLM."):
        super().__init__(message)
        self.code = "OCR_ENGINE_NOT_AVAILABLE"

def detect_scanned_pdf(file_path: str, min_char_threshold: int = 200) -> Dict[str, Any]:
    """
    Analyzes a PDF to determine if it is a scanned or image-only document.
    Checks page-level text density and presence of embedded raster images.
    """
    reader = PdfReader(file_path)
    page_count = len(reader.pages)
    total_chars = 0
    scanned_pages: List[int] = []
    has_images = False

    for idx, page in enumerate(reader.pages):
        page_num = idx + 1
        raw_text = page.extract_text() or ""
        char_count = len(raw_text.strip())
        total_chars += char_count

        page_has_images = False
        try:
            if hasattr(page, 'images') and len(page.images) > 0:
                page_has_images = True
                has_images = True
        except Exception:
            pass

        # If a page has very little text (< 50 chars) or has images with low text
        if char_count < 50 or (page_has_images and char_count < 100):
            scanned_pages.append(page_num)

    is_scanned = total_chars < min_char_threshold or (page_count > 0 and len(scanned_pages) == page_count)

    return {
        "is_scanned": is_scanned,
        "page_count": page_count,
        "total_chars": total_chars,
        "scanned_pages": scanned_pages,
        "has_images": has_images,
        "needs_ocr": is_scanned and total_chars < min_char_threshold
    }

def preprocess_image_for_ocr(image: Image.Image) -> Image.Image:
    """
    Applies image enhancements to improve OCR accuracy on poor-quality scans:
    - Grayscale conversion
    - Contrast auto-stretching
    - Sharpness enhancement
    """
    # 1. Convert to grayscale
    gray = image.convert('L')

    # 2. Auto-contrast stretching
    contrasted = ImageOps.autocontrast(gray, cutoff=2)

    # 3. Enhance sharpness
    enhancer = ImageEnhance.Sharpness(contrasted)
    sharpened = enhancer.enhance(1.5)

    return sharpened

def check_tesseract_available() -> bool:
    """Checks if tesseract binary is accessible in system PATH."""
    return shutil.which("tesseract") is not None

def extract_text_with_ocr(
    file_path: str,
    min_char_threshold: int = 200,
    ocr_engine: Optional[str] = None
) -> List[Tuple[int, str]]:
    """
    Extracts text page-by-page. If the document is detected as scanned,
    falls back to OCR engine while preserving 1-indexed page references.
    """
    reader = PdfReader(file_path)
    detection = detect_scanned_pdf(file_path, min_char_threshold)

    # If document has adequate digital text, return standard extracted text
    if not detection["needs_ocr"]:
        pages: List[Tuple[int, str]] = []
        for idx, page in enumerate(reader.pages):
            clean_text = normalize_text(page.extract_text() or "")
            pages.append((idx + 1, clean_text))
        return pages

    # Document is scanned / image-only. Check available OCR engine
    tesseract_available = check_tesseract_available()

    if ocr_engine == "mock":
        # Deterministic mock engine for testing and environments without external C++ binary
        pages = []
        for idx in range(detection["page_count"]):
            mock_text = (
                f"Page {idx + 1} Scanned Agreement Content. "
                "Vendor liability shall be capped at fees paid in past 12 months. "
                "All claims shall be governed under applicable laws."
            )
            pages.append((idx + 1, normalize_text(mock_text)))
        return pages

    if not tesseract_available:
        # Informative exception adhering to Clausify specification
        raise NoExtractableTextException(
            f"Extracted only {detection['total_chars']} characters (threshold: {min_char_threshold}). "
            "Scanned PDF or image-only document detected. "
            "To enable local optical character recognition, install tesseract-ocr on the host system."
        )

    # When tesseract binary is available on host:
    try:
        import pytesseract  # type: ignore
    except ImportError:
        raise OCREngineNotAvailableException("pytesseract Python package is not installed.")

    pages = []
    for idx, page in enumerate(reader.pages):
        page_num = idx + 1
        page_text = ""

        # Extract embedded images from PDF page
        if hasattr(page, 'images') and len(page.images) > 0:
            for img_obj in page.images:
                try:
                    pil_img = Image.open(io.BytesIO(img_obj.data))
                    processed = preprocess_image_for_ocr(pil_img)
                    text = pytesseract.image_to_string(processed)
                    page_text += " " + text
                except Exception as err:
                    print(f"[OCR Warning] Page {page_num} image OCR failed: {err}")

        # If page had no extractable images or OCR produced nothing, include any raw text
        if not page_text.strip():
            page_text = page.extract_text() or ""

        pages.append((page_num, normalize_text(page_text)))

    return pages

