import math
import pytest
from app.services.embeddings import MockEmbedder

def cosine_similarity(v1, v2):
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a, b in zip(v1, v2)))
    norm2 = math.sqrt(sum(b * b for a, b in zip(v1, v2)))
    return dot / (norm1 * norm2) if norm1 and norm2 else 0.0

def test_mock_embedder_dimension_and_norm():
    embedder = MockEmbedder(dim=1536)
    vec = embedder.embed_text("Vendor liability shall not exceed twelve months of fees.")
    
    assert len(vec) == 1536
    norm = math.sqrt(sum(x * x for x in vec))
    assert pytest.approx(norm, rel=1e-3) == 1.0

def test_mock_embedder_determinism():
    embedder = MockEmbedder(dim=1536)
    text = "The quick brown fox jumps over the lazy dog."
    vec1 = embedder.embed_text(text)
    vec2 = embedder.embed_text(text)
    assert vec1 == vec2

def test_mock_embedder_semantic_similarity():
    embedder = MockEmbedder(dim=1536)
    clause_a = "Limitation of liability: Neither party aggregate liability shall exceed the fees paid in twelve months."
    clause_b = "Liability cap: Under no circumstances shall either party aggregate liability exceed total fees paid."
    unrelated = "The gourmet bakery prepares fresh artisan sourdough loaves using stone-ground wheat."

    vec_a = embedder.embed_text(clause_a)
    vec_b = embedder.embed_text(clause_b)
    vec_unrelated = embedder.embed_text(unrelated)

    sim_ab = cosine_similarity(vec_a, vec_b)
    sim_unrelated = cosine_similarity(vec_a, vec_unrelated)

    assert sim_ab > 0.60, f"Expected high similarity between related clauses, got {sim_ab}"
    assert sim_ab > sim_unrelated, f"Related clauses ({sim_ab}) should be more similar than unrelated ({sim_unrelated})"

