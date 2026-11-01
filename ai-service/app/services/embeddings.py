import re
import math
from typing import List
from abc import ABC, abstractmethod
from ..config import settings

class BaseEmbedder(ABC):
    @abstractmethod
    def embed_text(self, text: str) -> List[float]:
        pass

    @abstractmethod
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        pass

class MockEmbedder(BaseEmbedder):
    """
    Deterministic bag-of-words / token-hash embedder.
    Maps word tokens into EMBEDDING_DIM buckets and L2-normalizes.
    Texts sharing legal terms (liability, indemnity, renewal, termination) produce
    high cosine similarity, enabling offline testing without an OpenAI API key.
    """
    def __init__(self, dim: int = 1536):
        self.dim = dim

    def embed_text(self, text: str) -> List[float]:
        vec = [0.0] * self.dim
        clean_text = text.lower()
        words = re.findall(r'[a-z0-9]+', clean_text)
        
        if not words:
            vec[0] = 1.0
            return vec

        for word in words:
            # 32-bit integer hash
            h = 0
            for char in word:
                h = ((h << 5) - h) + ord(char)
                h &= 0xFFFFFFFF
            
            idx = abs(h) % self.dim
            sign = 1.0 if ((abs(h >> 8) % 2) == 0) else -1.0
            vec[idx] += sign

        # Compute L2 norm
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [round(x / norm, 6) for x in vec]
        else:
            vec[0] = 1.0

        return vec

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        return [self.embed_text(t) for t in texts]

class OpenAIEmbedder(BaseEmbedder):
    def __init__(self, api_key: str, model: str = "text-embedding-3-small", dim: int = 1536):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.dim = dim

    def embed_text(self, text: str) -> List[float]:
        response = self.client.embeddings.create(
            model=self.model,
            input=text
        )
        return response.data[0].embedding

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        response = self.client.embeddings.create(
            model=self.model,
            input=texts
        )
        # Sort by index to maintain ordering
        sorted_data = sorted(response.data, key=lambda x: x.index)
        return [item.embedding for item in sorted_data]

def get_embedder() -> BaseEmbedder:
    if settings.embedding_provider == "openai" and settings.openai_api_key:
        return OpenAIEmbedder(
            api_key=settings.openai_api_key,
            model=settings.embedding_model,
            dim=settings.embedding_dim
        )
    return MockEmbedder(dim=settings.embedding_dim)

