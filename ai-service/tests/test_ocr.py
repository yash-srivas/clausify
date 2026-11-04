import os
from pathlib import Path
from PIL import Image
from app.services.ocr import (
    detect_scanned_pdf,
    preprocess_image_for_ocr,
    extract_text_with_ocr,
    check_tesseract_available
)
from app.services.pdf_parser import NoExtractableTextException
from app.services.chunker import Chunker
from app.services.verifier import verify_quote

def get_sample_path(filename: str) -> str:
    return str(Path(__file__).resolve().parent.parent.parent / "samples" / filename)

def test_detect_scanned_pdf_digital_contract():
    path = get_sample_path("contract_risky_1.pdf")
    res = detect_scanned_pdf(path)
    assert res["is_scanned"] is False
    assert res["needs_ocr"] is False
    assert res["total_chars"] > 1000
    assert res["page_count"] == 3

def test_detect_scanned_pdf_scanned_contract():
    path = get_sample_path("contract_scanned.pdf")
    res = detect_scanned_pdf(path)
    assert res["is_scanned"] is True
    assert res["needs_ocr"] is True
    assert res["total_chars"] < 100
    assert 1 in res["scanned_pages"]

def test_preprocess_image_for_ocr():
    # Create simple test image
    img = Image.new("RGB", (100, 100), color=(200, 200, 200))
    processed = preprocess_image_for_ocr(img)
    assert processed.mode == "L"  # Converted to grayscale
    assert processed.size == (100, 100)

def test_extract_text_with_ocr_digital():
    path = get_sample_path("contract_risky_1.pdf")
    pages = extract_text_with_ocr(path)
    assert len(pages) == 3
    assert pages[0][0] == 1
    assert "MASTER SERVICES AGREEMENT" in pages[0][1]

def test_extract_text_with_ocr_scanned_raises_when_no_engine():
    path = get_sample_path("contract_scanned.pdf")
    if not check_tesseract_available():
        try:
            extract_text_with_ocr(path)
            assert False, "Should have raised NoExtractableTextException"
        except NoExtractableTextException as e:
            assert e.code == "NO_EXTRACTABLE_TEXT"

def test_extract_text_with_ocr_mock_and_quotation_verification():
    path = get_sample_path("contract_scanned.pdf")
    pages = extract_text_with_ocr(path, ocr_engine="mock")
    assert len(pages) == 1
    page_num, text = pages[0]
    assert page_num == 1
    assert "Vendor liability shall be capped" in text

    # Chunk the OCR text
    chunker = Chunker(chunk_size=500, chunk_overlap=50)
    chunks = chunker.chunk_contract_pages("test-ocr-id", pages)
    assert len(chunks) >= 1
    assert chunks[0]["page"] == 1

    # Verify quotation verification works seamlessly against OCR text
    verified, found_page, matched_text = verify_quote(
        text_span="Vendor liability shall be capped at fees paid in past 12 months",
        retrieved_chunks=chunks
    )
    assert verified is True
    assert found_page == 1
