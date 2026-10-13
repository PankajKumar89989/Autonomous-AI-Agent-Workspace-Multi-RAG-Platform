# Architecture

## Components

| Component | Role |
|---|---|
| Next.js (App Router, TypeScript, Tailwind, TanStack Query, Zustand) | UI. The access token lives in memory; the refresh token is an httpOnly cookie |
| FastAPI (async SQLAlchemy, Pydantic) | REST API and Server-Sent Events. Stateless apart from the database |
| PostgreSQL | All application data, chunks, full-text index, event log, usage records |
| Redis | Job queue (ARQ) and shared rate-limit counters |
| ARQ worker | Document processing and research runs, with heartbeats and cancellation |
| OpenAI | Embeddings, answers, agent reasoning (through the OpenAI SDK, or LangChain when `CHAT_PROVIDER=langchain`) |
| Pinecone | Vector index, one namespace per knowledge base |
| Tavily | Web search for the research agents |

## Data model

```mermaid
erDiagram
    users ||--o{ workspaces : owns
    users ||--o{ agents : owns
    users ||--o{ api_usage : generates
    users ||--o{ refresh_tokens : has
    workspaces ||--o{ knowledge_bases : contains
    knowledge_bases ||--o{ documents : holds
    documents ||--o{ document_chunks : "split into"
    users ||--o{ conversations : has
    agents |o--o{ conversations : "used by"
    conversations ||--o{ messages : contains
    users ||--o{ agent_runs : starts
    agents |o--o{ agent_runs : "used by"
    agent_runs ||--o{ agent_run_events : logs
    agent_runs ||--o{ research_sources : found
```

`local_vectors` (development vector store) and `activity_logs` (dashboard feed) are standalone. Vectors carry user, knowledge base, document, page and chunk metadata; the chunk text itself stays in Postgres, and every search hit is re-checked there for ownership.

## Document ingestion

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as API
    participant Q as Redis queue
    participant W as Worker
    participant V as Vector store
    B->>A: POST /documents/upload (file)
    A->>A: validate type, MIME, signature, size, duplicate
    A->>A: store file, create document (uploaded)
    A->>Q: enqueue process_document
    A-->>B: 201 (status uploaded)
    Q->>W: job
    W->>W: parse, clean, chunk (per page)
    W->>V: embed chunks, upsert vectors
    W->>A: (database) swap chunks, status completed
    B->>A: poll documents (every 2s while active)
```

Embedding happens before the old chunks are replaced, so a failed reindex leaves the previous version intact.

## Chat

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as API
    A->>A: save user message and an empty reply
    B->>A: POST /chat (SSE)
    A-->>B: meta
    A->>A: rewrite follow-up, hybrid search, (agent tools), re-rank
    A-->>B: status, sources
    alt nothing relevant found
        A-->>B: fixed "could not find" answer (no model call)
    else evidence found
        A->>A: build cited prompt, stream model output
        A-->>B: token ... token
    end
    A->>A: save reply, sources, tokens, usage (before done)
    A-->>B: done
```

If the client disconnects, the reply is saved as `stopped` with what was written (finalisation runs as a shielded task).

## Research

```mermaid
flowchart TD
    S[POST /research] -->|queue| W[Worker claims run]
    W --> PL[Planner]
    PL --> D[Document agent]
    PL --> WB[Web research agent]
    D --> AN[Analyst]
    WB --> AN
    AN --> SU[Summarizer]
    SU --> CI[Citation agent]
    CI --> R[(Report + sources + trace)]
    W -.events.-> E[(agent_run_events)]
    E -.SSE replay.-> B[Browser]
```

Retrieval steps run in parallel. Each step has a timeout and retries transient errors. If the planner, analyst or summarizer fail they fall back to a simpler method with a warning; one failed retrieval step does not stop the run; no evidence produces an honest "won't guess" report. Cancellation and heartbeats are checked by a watcher task, and a run whose worker disappears is marked failed instead of hanging.

## Security model

- **Identity:** bcrypt passwords; 30-minute access JWT; refresh tokens stored server-side, rotated on use, with reuse detection that revokes all sessions; deactivated users are rejected on every request.
- **Isolation:** every query filters by the owner; foreign ids return 404; an agent limited to certain knowledge bases never falls back to all of them when those are deleted.
- **Input:** Pydantic validation everywhere; uploads checked by extension, MIME type, magic bytes and decompressed size; filenames sanitised and files stored under random ids; body-size limits.
- **Abuse controls:** rate limits per IP and per user (Redis), login lockout per IP and email.
- **Output:** security headers and a strict CSP on the API; Markdown from models and web pages is rendered without raw HTML.
- **Prompt injection:** documents, web pages and tool results are quoted as data in prompts with an explicit instruction not to follow them; agent instructions sit below the fixed grounding rules.
- **Secrets:** server-side only, redacted from logs; production refuses weak configuration.

## Key decisions

| Decision | Reason |
|---|---|
| ARQ instead of Celery | Async-native and works on Windows without extra pools |
| Event log in Postgres, replayed over SSE | Runs survive closed tabs and API restarts; reconnecting is trivial |
| Provider interfaces | Each vendor can be replaced in one file; offline stand-ins make the whole app testable without keys |
| Custom orchestration rather than an agent framework | Deterministic, testable failure handling; LangChain remains available as the model client |
| Chunk text in Postgres, vectors elsewhere | One source of truth and an ownership check on every hit |
| Hybrid retrieval plus re-ranking | Vectors catch meaning, full-text catches exact terms, the re-ranker trims noise |
