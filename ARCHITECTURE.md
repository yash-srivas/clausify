# Architecture Specification: Intelligent Legal Contract & Vendor Risk Analyzer

This document details the architectural principles, RAG pipeline mechanics, data schemas, security boundaries, and fault-tolerance strategies for the Intelligent Legal Contract & Vendor Risk Analyzer platform.

---

## 1. High-Level System Architecture

The solution adopts a decoupled, microservices-oriented architecture:
1. **Frontend Presentation Layer**: Static Single Page Architecture built with HTML5, CSS3, Bootstrap 5.3, vanilla ES Modules, PDF.js, and Chart.js.
2. **Backend API Gateway**: Node.js/Express service responsible for authentication, role-based authorization (RBAC), file upload validation, immutable audit logging, and contract lifecycle state management.
3. **AI Microservice**: Python/FastAPI stateless service responsible for document ingestion, page-bounded chunking, vector embedding, cosine similarity retrieval, heuristic rule execution, LLM clause deviation analysis, quote verification, and risk scoring.
4. **Data Layer**: Single unified PostgreSQL 16 database running `pgvector`, storing relational entities, vector embeddings, historical snapshots, and execution logs.

```mermaid
graph TD
    User([Legal User Browser]) -->|HTTPS / JWT| Gateway[Backend Gateway :3000]
    
    subgraph Storage [Storage Layer]
        Disk[(Local Disk /uploads)]
        DB[(PostgreSQL 16 + pgvector :5432)]
    end

    subgraph AIService [AI Microservice :8000]
        FastAPI[FastAPI Router]
        IngestEngine[PDF Ingest & Chunker]
        VectorStore[pgvector Client]
        RiskEngine[Risk & Rule Engine]
        Verifier[Quote Verifier]
        LLMAdapter[LLM Adapter]
    end

    Gateway -->|Store PDF| Disk
    Gateway -->|CRUD & Audit| DB
    Gateway -->|X-Internal-Key| FastAPI

    FastAPI -->|Extract & Read| Disk
    FastAPI -->|Query / Insert Chunks| DB
```

---

## 2. End-to-End RAG Analysis Pipeline

The RAG pipeline operates through a deterministic 7-stage sequence:

```mermaid
sequenceDiagram
    autonumber
    actor Associate
    participant Backend as Backend Gateway (Node.js)
    participant AI as AI Service (FastAPI)
    participant DB as PostgreSQL (pgvector)
    
    Associate->>Backend: POST /api/contracts (PDF file + template_id)
    Backend->>Backend: Validate %PDF- magic bytes & store with UUID
    Backend->>DB: INSERT contracts (status = 'uploaded')
    Backend-->>Associate: 202 Accepted (Contract queued)
    
    Backend->>AI: POST /ingest { contract_id, file_path }
    AI->>AI: PyPDF2 extract text per page (< 200 chars check)
    AI->>AI: LangChain RecursiveCharacterTextSplitter (Page-bounded)
    AI->>AI: Generate 1536d Embeddings (Mock / OpenAI)
    AI->>DB: INSERT contract_chunks (page, text, embedding)
    AI-->>Backend: 200 OK { chunk_count, page_count }
    
    Backend->>DB: UPDATE contracts (status = 'processing')
    Backend->>AI: POST /analyze { contract_id, template_id }
    
    loop For each Standard Safe Clause
        AI->>DB: Cosine Distance (<=>) search contract_chunks vs template_clause
        DB-->>AI: Top matching chunks
        AI->>AI: Evaluate Heuristic Rules (liability, renewal, notice)
        AI->>AI: LLM Prompting with retrieved chunks
        AI->>AI: Verifier fuzzy check (ratio >= 0.95 against source chunks)
        AI->>DB: INSERT findings (clause_type, risk_level, quote, page, rewrite)
    end
    
    AI->>AI: Compute Weighted Risk Score (0-100)
    AI->>DB: UPDATE contracts (overall_risk_score, status = 'analyzed')
    AI-->>Backend: 200 OK { overall_risk_score, findings_count }
    Backend->>DB: UPDATE contracts (status = 'in_review')
```

---

## 3. Core Subsystems

### 3.1 Document Ingestion & Chunking
- **Page Boundary Integrity**: Splitting is executed strictly page by page. Chunks never bridge across page breaks, guaranteeing that every retrieved excerpt maps to an authentic, unambiguous page number.
- **Scanned Document Detection**: If total extractable text across all pages is $< 200$ characters, ingestion immediately rejects the file with HTTP 422 `NO_EXTRACTABLE_TEXT`.
- **Idempotency**: Ingesting a document wipes any preexisting chunks for that `contract_id` prior to inserting new records.

### 3.2 Vector Retrieval (`pgvector`)
- Vector similarity uses the cosine distance operator `<=>`.
- An HNSW (Hierarchical Navigable Small World) index is maintained on `contract_chunks.embedding` and `template_clauses.embedding` (`vector_cosine_ops`), ensuring logarithmic nearest-neighbor lookups.

### 3.3 Strict Quote Verification & Anti-Hallucination
- LLMs are prone to slight paraphrasing or hallucinating non-existent clauses.
- The `Verifier` service performs a sliding-window fuzzy ratio comparison ($\text{Levenshtein} / \text{Bigram Dice}$) between the LLM's proposed quote and the raw text in the retrieved chunks.
- If the similarity ratio is $\ge 0.95$, the quote is accepted and marked `verified = True`. The actual chunk's page number is assigned rather than trusting LLM self-reported page numbers.
- If $< 0.95$, the finding is dropped.

### 3.4 Continuous-Scroll PDF Highlighting
- PDF.js renders `<canvas>` and an overlaying `<div class="textLayer">` for every page.
- The pure function `findQuoteMatches(textItems, quoteText)` maps normalized quoted strings to the underlying DOM text spans in the text layer.
- Matching spans receive the CSS class `.pdf-highlight` and risk color modifiers (`.pdf-highlight-high`, `.pdf-highlight-medium`, `.pdf-highlight-low`).
- Bi-directional synchronization: clicking a finding card scrolls the PDF viewer to the page and triggers a keyframe highlight pulse; clicking a highlight in the PDF activates and focuses the corresponding finding card.

### 3.5 State Machine Lifecycle

```mermaid
stateDiagram-v2
    [*] --> uploaded
    uploaded --> processing
    processing --> analyzed
    processing --> failed
    analyzed --> in_review
    in_review --> escalated: Associate submits
    escalated --> approved: Partner approves
    escalated --> rejected: Partner rejects
    escalated --> in_review: Partner requests changes
    in_review --> processing: Reanalyze triggered
```

---

## 4. Security & Compliance Architecture

1. **Authentication**: Stateless JSON Web Tokens (JWT) using HMAC SHA-256 with an 8-hour expiry.
2. **Role-Based Access Control (RBAC)**:
   - `associate`: Upload contracts, review findings, accept/dismiss findings, add comments, submit for approval.
   - `partner`: Everything associate can do, plus approve/reject/request changes on escalated contracts and manage benchmark templates.
   - `admin`: User administration, system analytics, immutable audit logs, and infrastructure health monitoring.
3. **Internal Microservice Protection**: FastAPI microservice requires the custom header `X-Internal-Key: <INTERNAL_API_KEY>`, preventing unauthorized direct access.
4. **Immutable Audit Trails**: Every state mutation (upload, status change, comment, template update, user creation) triggers an automated entry in `audit_logs` storing user ID, action, entity, entity ID, metadata JSON, IP address, and timestamp.

