# Quality gate

Tick each item after running the command. Everything here can be checked on a fresh clone.

## Build and start
- [ ] `docker compose up --build` finishes and `docker compose ps` shows every service **healthy**
- [ ] `http://localhost:3000` loads and shows "Backend: online"
- [ ] `http://localhost:8000/docs` and `/redoc` load; `curl localhost:8000/api/health/ready` returns 200
- [ ] Local (non-Docker) start works: `alembic upgrade head`, `uvicorn app.main:app --reload`, `arq app.workers.tasks.WorkerSettings`, `npm run dev`
- [ ] `alembic upgrade head` on an empty database, then `alembic downgrade base` and `upgrade head` again, both succeed
- [ ] `npm run build` (production build) succeeds

## Automated tests
- [ ] `cd backend && pytest`
- [ ] `cd backend && ruff check .`
- [ ] `cd frontend && npm run typecheck && npm run lint && npm test`
- [ ] `cd frontend && npm run test:e2e` (stack and worker running)

## Manual walkthrough (offline mode, no API keys)
- [ ] Register, log in, refresh the page (still signed in), log out
- [ ] Create a workspace, rename it, see it in the dashboard activity feed
- [ ] Create a knowledge base, upload a PDF, DOCX, TXT, CSV and MD file; each reaches **Indexed**; **Chunks** shows page numbers for the PDF
- [ ] Upload a `.exe`, a text file renamed to `.pdf` and a duplicate: each is rejected with a clear message
- [ ] Ask in Chat: the answer streams, `[1]` opens the source passage, Stop keeps the partial text, Regenerate replaces the answer
- [ ] Ask something the documents don't cover: you get the "couldn't find" message and no sources
- [ ] Start a Research run, close the tab, reopen it from **Research**: progress and the report are there; export Markdown and PDF
- [ ] Create an agent with only the calculator, chat with it ("what is 15% of 2400?"), then restrict another agent to one knowledge base and confirm it can't read the others
- [ ] Sign in as a second user: none of the first user's workspaces, documents, chats, runs, agents or sources are visible or reachable by id
- [ ] Make yourself admin: **Admin** shows health, usage and users; deactivating a user signs them out

## With real keys
- [ ] With `OPENAI_API_KEY` and Pinecone configured and documents reindexed, the yellow development-mode banner disappears and vectors appear in the Pinecone console under `kb-<id>` namespaces
- [ ] With `TAVILY_API_KEY`, a research run with web research on lists web sources with retrieval dates

## Security
- [ ] Six wrong passwords in a row from one browser show the lockout message
- [ ] `git status` shows no `.env`; `git log -p | grep -E "sk-|tvly-"` finds nothing
- [ ] Response headers include `X-Content-Type-Options`, `X-Frame-Options` and `X-Request-ID`
- [ ] With `ENVIRONMENT=production` and the default JWT secret the API refuses to start
