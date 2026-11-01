# Intelligent Legal Contract & Vendor Risk Analyzer

A production-grade, demo-ready B2B LegalTech SaaS platform that analyzes vendor contracts, flags risky clauses against organizational safe templates using Retrieval-Augmented Generation (RAG), and provides continuous-scroll PDF highlighting with interactive risk remediation workflows.

---

## 1. System Architecture

```mermaid
flowchart TD
    subgraph Client ["Frontend Workspace (Vanilla ES6 + Bootstrap 5.3)"]
        UI_A["Associate Dashboard & PDF Review"]
        UI_P["Partner Approvals & Safe Templates"]
        UI_ADM["Admin Analytics & Audit Telemetry"]
        PDF_JS["PDF.js Viewer + Highlight Layer"]
    end

    subgraph BackendGateway ["Backend API Gateway (Node.js 20 / Express)"]
        AUTH["Auth & RBAC Middleware"]
        AUDIT["Immutable Audit Logger"]
        RATE["Rate Limiter & File Validator"]
        WORKFLOW["Contract State Machine"]
        AI_CLIENT["Resilient AI Client (Axios + Tenacity)"]
    end

    subgraph AIService ["AI Microservice (Python 3.11+ / FastAPI)"]
        PARSER["PyPDF2 Parser (<200 char scanned check)"]
        CHUNKER["LangChain Recursive Chunker (Page-bounded)"]
        EMBED["Embedder (Mock 1536d / OpenAI text-embedding-3-small)"]
        RETRIEVAL["pgvector Cosine Retrieval (<=>)"]
        RULES["Deterministic Heuristic Rule Engine"]
        LLM["LLM Reasoner (MockLLM / OpenAI JSON Mode)"]
        VERIFY["Quote Verifier (Fuzzy Ratio >= 0.95)"]
        SCORING["Risk Scoring Engine (0-100 Score & Bands)"]
    end

    subgraph Database ["PostgreSQL 16 with pgvector"]
        PG_REL["Relational Tables (users, contracts, templates, audit_logs)"]
        PG_VEC["Vector Tables (contract_chunks, template_clauses)"]
        HNSW["HNSW Cosine Distance Index"]
    end

    UI_A -->|HTTP / JWT| BackendGateway
    UI_P -->|HTTP / JWT| BackendGateway
    UI_ADM -->|HTTP / JWT| BackendGateway

    BackendGateway -->|SQL Pool| PG_REL
    BackendGateway -->|X-Internal-Key| AIService
    
    AIService -->|Vector Storage & Search| PG_VEC
    PG_VEC --- HNSW
```

---

## 2. Tech Stack

| Layer | Technologies | Key Responsibilities |
|---|---|---|
| **Frontend** | HTML5, CSS3, Bootstrap 5.3, Vanilla JavaScript (ES Modules), PDF.js (v3.11.174), Chart.js | Continuous PDF scroll, text layer quote highlight matching, interactive finding cards, responsive admin dashboards |
| **Backend Gateway** | Node.js 20 LTS, Express 4, `pg` (node-postgres), `jsonwebtoken`, `bcryptjs`, `multer`, `helmet`, `cors`, `express-rate-limit`, `express-validator` | JWT authentication, RBAC authorization, contract lifecycle state machine, audit logging, file streaming |
| **AI Microservice** | Python 3.11+, FastAPI, Uvicorn, Pydantic v2, `psycopg` (v3) with pgvector, `PyPDF2`, `langchain-text-splitters`, `openai`, `tenacity` | PDF extraction, page-bounded chunking, vector embedding, cosine similarity retrieval, quote verification ($\ge 0.95$), risk scoring |
| **Database** | PostgreSQL 16 + pgvector | Hybrid relational & vector store, HNSW indexing on 1536-dim embeddings |
| **Testing** | Jest + Supertest (Backend), Pytest (AI Microservice) | Unit and integration test coverage across all workflow states, mathematical scoring, and quote verification |

---

## 3. Quickstart & Setup

### One-Click Double-Click Launcher (Windows)
Simply double-click **`run.bat`** (or `start.bat`) in the root directory:
- Verifies and starts Docker / PostgreSQL container (`legal_risk_db`)
- Runs database migrations and seeds demo accounts & safe templates
- Launches the AI Microservice (port 8000)
- Launches the Backend API Gateway & Web App (port 3000)
- Automatically opens **`http://localhost:3000`** in your default browser

To stop all services cleanly with one click, double-click **`stop.bat`**.

---

### Prerequisites
- Docker & Docker Compose **OR** Local PostgreSQL 16 with `pgvector`
- Node.js 20 LTS or higher
- Python 3.11 or higher

### Option A: Complete Docker Compose Setup
To launch all services (Database, AI Service, and Backend) via Docker Compose:
```bash
docker compose up -d
```
All services will start up automatically:
- Database: `localhost:5432`
- AI Microservice: `http://localhost:8000`
- Backend & Web UI: `http://localhost:3000`

### Option B: Local Setup (Recommended for Development)

#### 1. Start Database Container
```bash
docker run -d --name legal_risk_db -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=legal_risk_db pgvector/pgvector:pg16
```

#### 2. Apply Database Schema & Seeds
```bash
cd backend
npm install
npm run db:migrate
npm run seed
```

#### 3. Start AI Microservice
```bash
cd ai-service
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 4. Start Backend & Frontend Gateway
```bash
cd backend
npm start
```
Open your browser to `http://localhost:3000`.

---

## 4. Environment Variables Reference

### Backend (`backend/.env`)
| Variable | Default Value | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port for backend and frontend static assets |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/legal_risk_db` | PostgreSQL connection string |
| `JWT_SECRET` | `super-secret-jwt-key-...` | Secret used to sign authentication tokens |
| `JWT_EXPIRES_IN` | `8h` | Token expiration time |
| `AI_SERVICE_URL` | `http://localhost:8000` | Internal URL for the AI FastAPI microservice |
| `INTERNAL_API_KEY` | `legal-internal-secret-key-2026` | Shared secret header `X-Internal-Key` |
| `UPLOAD_DIR` | `uploads/` | Directory storing uploaded contract PDFs |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |

### AI Microservice (`ai-service/.env`)
| Variable | Default Value | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/legal_risk_db` | PostgreSQL connection string |
| `INTERNAL_API_KEY` | `legal-internal-secret-key-2026` | Secret required on `X-Internal-Key` header |
| `EMBEDDING_PROVIDER` | `mock` | `mock` (deterministic unit vectors) or `openai` |
| `LLM_PROVIDER` | `mock` | `mock` (deterministic pattern reasoner) or `openai` |
| `OPENAI_API_KEY` | `sk-...` | Optional API key when provider is set to `openai` |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI model name |
| `LLM_MODEL` | `gpt-4o-mini` | OpenAI LLM model name |
| `EMBEDDING_DIM` | `1536` | Vector dimensionality (must match schema) |

---

## 5. Seeded Demo Accounts

| Role | Email | Password | Pre-configured Responsibilities |
|---|---|---|---|
| **Legal Associate** | `associate@demo.com` | `Demo@123` | Uploads vendor PDFs, reviews findings, inspects quotes in PDF, accepts/dismisses findings, escalates to Partner |
| **Legal Partner** | `partner@demo.com` | `Demo@123` | Reviews escalated contracts, executes Approve/Reject/Request Changes decisions, manages Safe Legal Templates |
| **System Admin** | `admin@demo.com` | `Demo@123` | Manages users (CRUD + toggle status), inspects immutable audit logs, monitors AI token usage and health telemetry |

---

## 6. End-to-End 5-Step Demo Walkthrough

### Step 1: Upload a Risky Contract (Associate)
1. Navigate to `http://localhost:3000` and click the **Legal Associate** quick-login button (`associate@demo.com`).
2. On the **Contracts Dashboard**, select **Standard Safe Vendor Template v1** and drag & drop `samples/contract_risky_1.pdf`.
3. Click **Upload & Run AI Risk Analysis**.
4. The contract appears in the table with status `UPLOADED` $\rightarrow$ `PROCESSING`. The dashboard polls every 3 seconds and seamlessly updates to `IN REVIEW` with an overall risk score (e.g. `78/100 HIGH`).

### Step 2: Interactive PDF Review & Quote Highlighting
1. Click **Review** on the contract row to open the Split-Screen Workspace (`associate/review.html`).
2. On the right, notice the **Findings Panel** showing:
   - Overall Risk Score dial: `78 / 100` (High Risk band)
   - Risk Filter Chips (`High`, `Medium`, `Low`)
   - High-severity cards (e.g. Unlimited Liability, Auto-Renewal, Unilateral Termination).
3. Click any finding card: the left PDF viewer instantly scrolls to the exact page, highlights the text excerpt in red/amber, and applies a pulsing animation.
4. Click on a highlighted excerpt in the PDF: the right panel instantly focuses the corresponding finding card.
5. In the finding card:
   - Click **Copy** to copy the safer suggested rewrite.
   - Select tone **Firm** and click **Regenerate** to re-prompt the rewrite engine.
   - Click **Accept** or add a comment thread note.
6. Click **Submit for Partner Approval** at the bottom right. The contract status transitions to `ESCALATED`.

### Step 3: Partner Approval Workflow (Partner)
1. Logout and log in as **Legal Partner** (`partner@demo.com`).
2. Navigate to **Approvals** (`partner/approvals.html`).
3. Under the **Pending Escalations** tab, locate the submitted contract and click **Review & Decide**.
4. Review the findings overview, enter a partner note (e.g. *"Approved subject to addendum liability cap"*), and click **Approve**.
5. The contract status transitions to `APPROVED`.

### Step 4: Safe Template Versioning & Re-embedding (Partner)
1. In the navigation bar, click **Safe Templates** (`partner/templates.html`).
2. Select **Standard Safe Vendor Template v1**.
3. Expand **Limitation of Liability** and modify the safe benchmark text.
4. Click **Save & Re-embed**.
5. The template version increments to `v2`, a historical snapshot is recorded in `template_versions`, and background re-embedding updates all pgvector embeddings.
6. Click **Version History** to inspect the audit snapshot trail.

### Step 5: Executive Analytics & Audit Logs (Admin)
1. Logout and log in as **System Admin** (`admin@demo.com`).
2. Navigate to **Analytics** (`admin/analytics.html`): inspect the KPI summary cards, the Ingestion Timeline chart, Risk Distribution donut, and API Token breakdown.
3. Navigate to **Users** (`admin/users.html`): toggle a user's active status or test password reset.
4. Navigate to **Audit Logs** (`admin/audit.html`): inspect the immutable log of every upload, status update, and approval with IP and metadata inspection.

---

## 7. Risk Scoring Model

The overall contract risk score is normalized to a **0–100 scale** using weighted clause severity points:

$$\text{Total Points} = \sum_{f \in \text{Findings}} \text{Weight}(f.\text{risk\_level}) \times \text{ClauseMultiplier}$$

- **Point Weights**:
  - `LOW` Risk = 1 pt
  - `MEDIUM` Risk = 3 pts
  - `HIGH` Risk = 5 pts
- **Risk Bands**:
  - **LOW RISK**: 0 – 33
  - **MEDIUM RISK**: 34 – 66
  - **HIGH RISK**: 67 – 100

### Strict Quote Verification
To eliminate LLM hallucinations:
1. Every quote proposed by an LLM is extracted and matched against the source chunks retrieved for that contract.
2. The fuzzy similarity ratio between the quote and retrieved text is evaluated using Levenshtein distance and character bigrams.
3. If the similarity ratio is **$\ge 0.95$**, the quote is marked `verified = True` and the exact page number is derived directly from the chunk metadata.
4. If the ratio is **$< 0.95$**, the finding is discarded as a hallucination, ensuring zero ungrounded flags.

---

## 8. Test Execution

### Run All Backend Unit & Integration Tests (Jest)
```bash
cd backend
npm test
```
*Executes 29 tests covering Authentication, RBAC Matrix, Mutating Audit Loggers, Contract Workflow State Machine, and PDF Text Layer Quote Matching.*

### Run All AI Microservice Tests (Pytest)
```bash
cd ai-service
pytest
```
*Executes 24 tests covering Page-bounded LangChain Chunking, Mock 1536-dim Unit Embedder, Scanned PDF 422 Detection, Heuristic Rule Engine, Strict Quote Verifier, Scoring Algorithm, and End-to-End Analysis.*

### Root Test Command
From the project root:
```bash
npm run test:backend
npm run test:ai
```

---

## 9. Assumptions & Known Limitations

1. **Scanned PDF Documents**: OCR (Optical Character Recognition) is computationally heavy and intentionally out-of-scope for the real-time MVP. Uploaded PDFs with $<200$ extractable characters immediately trigger HTTP 422 with code `NO_EXTRACTABLE_TEXT`.
2. **Text-Layer Quote Highlighting**: PDF highlighting operates on the PDF.js HTML textLayer DOM elements rather than destructive PDF canvas modifications. This guarantees instantaneous browser rendering without altering the underlying file.
3. **Stateless AI Service**: The FastAPI microservice operates as a stateless computational worker. It reads from and writes to the shared PostgreSQL vector database using internal authentication.
4. **Mock Provider Parity**: The system functions identically in both `MOCK` and `OPENAI` modes. Mock mode generates deterministic 1536-dimensional unit vectors and applies deterministic heuristic reasoning, guaranteeing complete demo functionality without external network dependencies.

