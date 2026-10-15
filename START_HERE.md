# START HERE

This single zip contains the **complete project, all 11 phases together**. You do not need any other zip.

## 1. Open it
1. Unzip `ai-agent-workspace-complete.zip`.
2. In VS Code: **File > Open Folder** and choose the `ai-agent-workspace` folder.

## 2. Easiest way to run it (Docker Desktop)
Open the VS Code terminal (PowerShell) in the project folder and run:

```powershell
copy .env.example .env
docker compose up --build
```

Wait until it finishes building (the first time takes several minutes), then open http://localhost:3000 and click **Sign up**.
API docs: http://localhost:8000/docs

No API keys are needed to try it. Without keys the app uses built-in offline stand-ins and tells you so on screen.
To use real AI, put your keys in `.env` (see the "Using the real services" section of `README.md`), then run `docker compose up --build` again.

## 3. Run it for development instead (3 terminals)
See "Local development" in `README.md`. In short: `docker compose up -d postgres redis`, then the API, the worker and the web app, each in its own terminal.

## 4. What is in the zip (by phase)

| Phase | What it added | Where to look |
|---|---|---|
| 1 | Project setup, FastAPI + Next.js skeleton, Docker for the database | `backend/app/main.py`, `frontend/app` |
| 2 | Sign-up, login, JWT with refresh tokens | `backend/app/api/routes/auth.py`, `frontend/lib/auth.ts` |
| 3 | Workspaces, dashboard, dark mode | `frontend/app/(app)/workspaces`, `dashboard` |
| 4 | Knowledge bases, document upload, parsing, chunking, background queue | `backend/app/rag`, `backend/app/services/document_service.py` |
| 5 | Embeddings, Pinecone, hybrid search | `backend/app/rag/vector_store.py`, `retrieval_service.py` |
| 6 | RAG chat with streaming, citations, re-ranking | `backend/app/services/chat_service.py`, `frontend/components/ChatView.tsx` |
| 7 | Multi-agent system (planner, document, web, analyst, summarizer, citation) | `backend/app/agents` |
| 8 | Background research, export to Markdown/PDF, source library | `backend/app/agents/runner.py`, `frontend/app/(app)/research` |
| 9 | Agent Builder (custom agents and tools) | `backend/app/agents/tools`, `frontend/app/(app)/agents` |
| 10 | Rate limits, security headers, admin dashboard, usage tracking, tests, CI | `backend/app/core`, `frontend/app/(app)/admin`, `.github/workflows` |
| 11 | Production Docker, HTTPS proxy, full documentation | `docker-compose*.yml`, `deploy/`, `docs/` |

## 5. Before you upload to GitHub
- Make sure `.env` is **not** committed (`git status` must not list it). It is already in `.gitignore`.
- After running `npm install` in `frontend`, commit the new `package-lock.json`.
- Add a few screenshots (see `docs/screenshots/README.md`).

## 6. If something does not work
- Documents or research stay on "Queued": the worker is not running. With Docker it starts by itself; in development run `arq app.workers.tasks.WorkerSettings` inside `backend`.
- Port already in use: close the other program, or stop old containers with `docker compose down`.
- Anything else: copy the exact error message and send it to me.

Full checklist to confirm everything works: `docs/quality-gate.md`.
