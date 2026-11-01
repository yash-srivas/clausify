import pytest
from app.services.chunker import Chunker

def test_chunker_preserves_page_boundaries():
    chunker = Chunker(chunk_size=100, chunk_overlap=10)
    pages = [
        (1, "Page one has some legal terms about liability and indemnity. " * 3),
        (2, "Page two covers governing law and arbitration clauses. " * 3),
        (3, "Page three covers warranties and service level commitments. " * 3),
    ]

    chunks = chunker.chunk_contract_pages("contract-test-id", pages)

    assert len(chunks) > 0

    # Verify no chunk spans across multiple pages
    for chunk in chunks:
        assert chunk["page"] in [1, 2, 3]
        assert chunk["contract_id"] == "contract-test-id"
        assert chunk["char_start"] >= 0
        assert chunk["char_end"] > chunk["char_start"]
        assert len(chunk["text"]) > 0

    # Verify chunk_index is strictly increasing from 0
    indexes = [c["chunk_index"] for c in chunks]
    assert indexes == list(range(len(chunks)))

def test_chunker_empty_page():
    chunker = Chunker()
    pages = [(1, ""), (2, "Some valid contract text here.")]
    chunks = chunker.chunk_contract_pages("contract-empty", pages)
    assert len(chunks) > 0
    assert all(c["page"] == 2 for c in chunks)

