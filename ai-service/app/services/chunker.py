from typing import List, Tuple, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter

class Chunker:
    def __init__(self, chunk_size: int = 1500, chunk_overlap: int = 150):
        # ~500 tokens ~= 1500-2000 chars, ~50 tokens ~= 150-200 chars
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", "; ", " ", ""],
            keep_separator=True
        )

    def chunk_contract_pages(
        self,
        contract_id: str,
        pages: List[Tuple[int, str]]
    ) -> List[Dict[str, Any]]:
        """
        Chunks pages independently to ensure chunks never span multiple pages.
        Maintains chunk_index sequentially across the entire contract.
        Computes accurate char_start and char_end relative to each page text.
        """
        chunks: List[Dict[str, Any]] = []
        global_chunk_index = 0

        for page_num, page_text in pages:
            if not page_text:
                continue

            page_chunks = self.splitter.split_text(page_text)
            search_start_cursor = 0

            for chunk_text in page_chunks:
                clean_chunk = chunk_text.strip()
                if not clean_chunk:
                    continue

                # Locate chunk within page text
                idx = page_text.find(chunk_text, search_start_cursor)
                if idx != -1:
                    char_start = idx
                    char_end = idx + len(chunk_text)
                    search_start_cursor = idx + max(1, len(chunk_text) - 50)
                else:
                    char_start = 0
                    char_end = len(chunk_text)

                chunks.append({
                    "contract_id": contract_id,
                    "chunk_index": global_chunk_index,
                    "page": page_num,
                    "char_start": char_start,
                    "char_end": char_end,
                    "text": clean_chunk
                })
                global_chunk_index += 1

        return chunks

