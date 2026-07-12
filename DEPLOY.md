# Deploying Sentifix

Sentifix needs four things running: the app, PostgreSQL (with pgvector), Redis, and RabbitMQ. This guide gets all of them up **without touching a server or running `ngrok`** — your deployment gets a real public HTTPS URL that GitHub and Slack can reach directly.

> **The big win:** once deployed, you point GitHub straight at `https://your-app.onrender.com/webhooks/github`. No tunnels, no laptop that has to stay awake.

---

## Option A — Render (one-click blueprint) ⭐ recommended

The repo ships a [`render.yaml`](./render.yaml) blueprint that provisions the whole stack.

### Steps

1. **Fork this repo** to your own GitHub account.
2. Go to **[dashboard.render.com/blueprints](https://dashboard.render.com/blueprints)** → **New Blueprint Instance**.
3. Connect your fork. Render reads `render.yaml` and shows you the four services it will create.
4. Fill in the one required secret when prompted:
   - **`OPENAI_API_KEY`** — from [platform.openai.com](https://platform.openai.com/api-keys)
   - (everything else is optional or auto-generated)
5. Click **Apply**. Render builds the Docker image, provisions Postgres + Redis + RabbitMQ, wires them together, and boots the app. First deploy takes ~5 minutes.
6. When it's live, open `https://<your-service>.onrender.com/health` → you should see `{"status":"ok"}`.

### What happens automatically

- `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL` are injected from the provisioned services — you never type a connection string.
- `GITHUB_WEBHOOK_SECRET` is generated for you (copy it from the app's **Environment** tab).
- On first boot the app creates all tables and enables pgvector (`DB_SYNCHRONIZE=true` + migrations).

### Cost

| Service | Plan | Cost |
|---|---|---|
| PostgreSQL | Free | $0 |
| Redis | Free | $0 |
| RabbitMQ (private service) | Starter | ~$7/mo |
| Web app (Starter) | Starter | ~$7/mo |

RabbitMQ and the web app can't run on Render's free tier (private services aren't free, and a free web service spins down — which would pause the queue consumer). Budget **~$14/mo** for a always-on deployment. To try it for free, see the Railway option below.

---

## Option B — Railway

Railway handles the multi-service + RabbitMQ setup smoothly and gives new accounts trial credit.

1. Create a new project at **[railway.app](https://railway.app)** → **Deploy from GitHub repo** → pick your fork.
2. Add the plugins from the project canvas: **PostgreSQL**, **Redis**, and a **RabbitMQ** service (Deploy → Docker Image → `rabbitmq:3-management-alpine`).
3. For the Postgres service, run once in its query console:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   (or let the app's migrations do it on boot).
4. On the **Sentifix** service → **Variables**, set:
   ```
   NODE_ENV=production
   DB_SYNCHRONIZE=true
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   RABBITMQ_URL=${{RabbitMQ.RABBITMQ_URL}}    # Railway exposes this automatically
   OPENAI_API_KEY=sk-...
   GITHUB_WEBHOOK_SECRET=<any-strong-random-string>
   ```
5. Railway assigns a public domain under **Settings → Networking → Generate Domain**. That's your webhook base URL.

---

## After deploy — connect a repo

You now have a public URL (call it `$URL`). Wire GitHub to it one of two ways:

### Fastest: GitHub App (one-click installs)

1. Create the app at **[github.com/settings/apps/new](https://github.com/settings/apps/new)**:
   - **Webhook URL:** `$URL/webhooks/github`
   - **Webhook secret:** the `GITHUB_WEBHOOK_SECRET` value from your deploy
   - **Permissions:** Issues (R/W), Pull Requests (W), Contents (W), Metadata (R)
   - **Events:** `installation`, `installation_repositories`, `issues`, `push`
2. Copy the App ID, slug, client ID/secret, and generate a private key. Set them as env vars on the app (`GITHUB_APP_*`), then redeploy.
3. Visit `$URL/setup` → **Install on GitHub** → pick your repos. Done.

### Simplest: a single repo webhook

1. Repo → **Settings → Webhooks → Add webhook**
   - **Payload URL:** `$URL/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** your `GITHUB_WEBHOOK_SECRET`
   - **Events:** Issues, Pushes
2. Index the repo once:
   ```bash
   curl -X POST $URL/index -H "Content-Type: application/json" \
     -d '{"repoFullName":"owner/repo"}'
   ```
3. Open an issue → Sentifix triages it and comments with a proposed fix.

---

## Verifying it works

```bash
curl $URL/health                       # {"status":"ok",...}
open  $URL/dashboard                    # triaged issues + eval scores
open  $URL/setup                        # connected repos (GitHub App mode)
```

Create a test issue on a connected repo. Within ~30s the app posts a triage comment. Watch the deploy logs if it doesn't — every failure now logs a readable reason.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `relation "issues" does not exist` | `DB_SYNCHRONIZE` isn't set to `true` on the web service — add it and redeploy |
| `extension "vector" is not available` | DB image lacks pgvector — on Render/Railway it's supported; run `CREATE EXTENSION vector;` manually if needed |
| Webhook returns 401 | `GITHUB_WEBHOOK_SECRET` in the app doesn't match the secret in GitHub's webhook settings |
| Triage never runs | The queue consumer is asleep — the web service must be on a plan that stays alive (Starter+), not free-tier spin-down |
| `ECONNREFUSED` to RabbitMQ on boot | Normal for a few seconds while RabbitMQ starts; the app auto-reconnects |

---

## Self-hosting with Docker Compose

For a local or VPS deployment without a managed platform, the repo's [`docker-compose.yml`](./docker-compose.yml) runs Postgres + Redis + RabbitMQ. Run the app alongside it with `NODE_ENV=production` and `DB_SYNCHRONIZE=true`. See the [README](./README.md#-quickstart) for the local quickstart.
