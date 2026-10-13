# Deployment

This guide deploys the whole stack on one Linux server with Docker. It handles a small team comfortably; see "Scaling" for what to change beyond that.

## 1. Prepare

- A server with 2 vCPUs and 4 GB RAM or more (Ubuntu 22.04+), Docker Engine and the Compose plugin (Compose 2.20+).
- A domain with an **A record** pointing at the server. Ports **80 and 443** open (Caddy needs both to get certificates).
- API keys: OpenAI, Pinecone (and Tavily if you want web research).

## 2. Configure

```bash
git clone <your-repo-url> app && cd app
cp .env.production.example .env
nano .env        # DOMAIN, POSTGRES_PASSWORD, JWT_SECRET_KEY and your API keys
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # use for JWT_SECRET_KEY and POSTGRES_PASSWORD
```

Use letters and digits only in `POSTGRES_PASSWORD` (it is embedded in a connection URL). `docker-compose.prod.yml` sets `ENVIRONMENT=production`, secure cookies, proxy-header trust, `CORS_ORIGINS=https://$DOMAIN` and hides Swagger. The API refuses to start if the JWT secret is weak.

## 3. Start

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps        # all services should become "healthy"
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python -m app.utils.setup_pinecone
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python -m app.utils.make_admin you@example.com
```

Register at `https://<DOMAIN>` first, then run `make_admin`. Migrations are applied automatically when the API container starts. To avoid typing the file names every time: `export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml`.

The frontend image bakes in its API address at build time; in production it is empty (same origin, `/api` goes through Caddy). If you change domains, rebuild: `docker compose ... up -d --build frontend`.

## 4. Operate

| Task | Command |
|---|---|
| Logs | `docker compose ... logs -f backend worker` |
| Upgrade | `git pull && docker compose ... up -d --build` (migrations run on start) |
| Database backup | `docker compose ... exec -T postgres pg_dump -U postgres ai_workspace \| gzip > backup-$(date +%F).sql.gz` |
| Restore | `gunzip -c backup.sql.gz \| docker compose ... exec -T postgres psql -U postgres ai_workspace` |
| Uploaded files backup | `docker run --rm -v ai-agent-workspace_uploads:/data -v "$PWD":/out alpine tar czf /out/uploads-$(date +%F).tgz -C /data .` |
| Health | `curl https://<DOMAIN>/api/health/ready` |

Back up the database **and** the uploads volume together. Vectors can always be rebuilt by reindexing documents.

## 5. Scaling

- **More API capacity:** raise `WEB_CONCURRENCY`, or run several API containers behind Caddy. Rate limits are shared through Redis, so they stay correct.
- **More background capacity:** `docker compose ... up -d --scale worker=3` (each worker runs up to 4 jobs at once).
- **Files:** multiple servers need shared storage. Implement a storage adapter for S3 or similar in `app/services/storage_service.py` (the interface is three methods).
- **Managed services:** point `DATABASE_URL` and `REDIS_URL` at managed Postgres and Redis and remove those services from the Compose files.
- **Vectors:** use Pinecone in production. The Postgres vector store loads whole namespaces into memory and is for development only.

## 6. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Documents or research stay "Queued" | The worker is not running or not healthy: `docker compose ... logs worker` |
| Browser shows CORS or cookie errors | `CORS_ORIGINS`/`DOMAIN` mismatch, or the site is not on HTTPS while `COOKIE_SECURE=true` |
| `502` from Caddy | The API is still starting (check `ps`) or failed its migrations (`logs backend`) |
| API exits at start with "Unsafe production configuration" | A weak `JWT_SECRET_KEY`, `COOKIE_SECURE=false` or wildcard CORS; fix `.env` |
| Chat or research streams arrive all at once | A proxy in front of Caddy is buffering; disable buffering for `/api/*` |
| Every user gets 429 | `TRUST_PROXY_HEADERS` is off behind a proxy, so everyone shares one IP |
| Answers say "Development mode" | No `OPENAI_API_KEY` (or Pinecone key) is set; restart after adding them and reindex documents |

## 7. Checklist before going live

- [ ] `.env` is not committed and has strong, unique secrets
- [ ] HTTPS works and `http://` redirects to `https://`
- [ ] Database and uploads backups run on a schedule and a restore was tested
- [ ] An admin account exists and public registration is acceptable for your use (otherwise place the site behind a VPN or add an invite step)
- [ ] OpenAI and Pinecone usage limits and billing alerts are set
