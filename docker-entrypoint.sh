#!/bin/sh
# api     : apply database migrations, then serve the API
# worker  : run the background worker (documents and research runs)
set -e
case "$1" in
  api)
    alembic upgrade head
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${WEB_CONCURRENCY:-2}"
    ;;
  worker)
    exec arq app.workers.tasks.WorkerSettings
    ;;
  *)
    exec "$@"
    ;;
esac
