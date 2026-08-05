# Migrating Sentifix to a new AWS account

Target architecture: **clean rebuild on a right-sized EC2 instance, with Postgres moved to RDS.**
Redis and RabbitMQ stay as containers. Every piece is reversible to the current single-box setup.

```
EC2 (t3.medium/large)              RDS PostgreSQL 16 + pgvector
├── sentifix-app     (container)   ├── automated backups (7d)
├── sentifix-redis   (container)   ├── point-in-time restore
└── sentifix-rabbitmq(container) ──┘ private subnet, no public access
```

Old account: EC2 `13.207.193.62` running the full `docker-compose.prod.yml` stack.

---

## Phase 0 — Inventory + backup (old account)

```bash
aws ec2 describe-instances --profile old --query \
  'Reservations[].Instances[].{Id:InstanceId,Type:InstanceType,AZ:Placement.AvailabilityZone,IP:PublicIpAddress}'
aws ec2 describe-addresses    --profile old      # Elastic IPs
aws ec2 describe-volumes      --profile old      # size + encryption status
aws route53 list-hosted-zones --profile old
aws route53domains list-domains --profile old --region us-east-1
```

Note the **region** from the AZ — everything below must match it (the Elastic IP transfer in Phase 4 requires same-region).

On the box, grab what isn't in git:

```bash
ssh old-box
cd ~/Sentifix
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  exec -T postgres pg_dump -U sentifix -d sentifix -Fc > ~/sentifix-$(date +%F).dump
sudo tar czf ~/host-config.tgz /etc/nginx /etc/caddy /etc/letsencrypt 2>/dev/null
crontab -l > ~/crontab.bak
```

`scp` all three to your laptop, **plus `.env.prod`** — it holds `GITHUB_WEBHOOK_SECRET`,
`GITHUB_APP_PRIVATE_KEY`, `SESSION_SECRET`, `SLACK_*`, and `OPENAI_API_KEY`. Nothing else has them.

- [ ] Postgres dump pulled locally
- [ ] `.env.prod` pulled locally
- [ ] Host config (nginx/Caddy/certs) pulled locally
- [ ] Region recorded: `________________`

---

## Phase 1 — Baseline the new account

1. **Root user** — enable MFA, delete any root access keys, set alternate billing/security contacts.
2. **Budget alarm** — Billing → Budgets → ~$80/mo with an 80% email alert, **on actual spend, not credit-adjusted**, so you always see the real bill. Do this before launching anything.
3. **Credits** — Billing → Credits. Record the expiry date and the covered-services list.
4. **IAM admin user** + access key → `aws configure --profile new`.
5. **Key pair** — create fresh in the new account; don't reuse the old `.pem`.
6. **Security groups** — two of them:

| SG | Inbound | Source |
|---|---|---|
| `sentifix-app-sg` | 22 | your IP only |
| | 80, 443 | `0.0.0.0/0` (GitHub webhooks must reach it) |
| `sentifix-db-sg` | 5432 | **`sentifix-app-sg`** (source is the SG, not a CIDR) |

- [ ] MFA + budget alarm set
- [ ] Credit expiry recorded: `________________`
- [ ] Key pair + both security groups created

---

## Phase 2 — RDS PostgreSQL

```bash
aws rds create-db-subnet-group --profile new \
  --db-subnet-group-name sentifix-subnets \
  --db-subnet-group-description "Sentifix" \
  --subnet-ids subnet-aaa subnet-bbb            # two AZs required

aws rds create-db-instance --profile new \
  --db-instance-identifier sentifix-db \
  --db-instance-class db.t4g.small \
  --engine postgres --engine-version 16 \
  --allocated-storage 20 --storage-encrypted \
  --master-username sentifix \
  --master-user-password "$(openssl rand -base64 24)" \
  --db-subnet-group-name sentifix-subnets \
  --vpc-security-group-ids sg-xxxx \
  --backup-retention-period 7 \
  --no-publicly-accessible
```

Save that generated password — it goes into `DATABASE_URL`. Provisioning takes ~10 minutes.

**pgvector**: RDS PostgreSQL 16 ships the extension; the master user has `rds_superuser`, so
`CREATE EXTENSION vector;` works. The app's migrations already do this on boot, but run it manually
first if the restore complains.

Grab the endpoint:

```bash
aws rds describe-db-instances --profile new --db-instance-identifier sentifix-db \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

- [ ] RDS instance available, `--no-publicly-accessible` confirmed
- [ ] Master password stored somewhere safe
- [ ] Endpoint recorded: `________________`

---

## Phase 3 — EC2 + compose changes

Launch a **t3.medium** (2 vCPU / 4 GB) or **t3.large** (2/8) with `sentifix-app-sg`, 30 GB gp3 root.
The larger size matters: indexing bursts embed a whole repo while the agent pipeline is running.

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin postgresql-client
sudo usermod -aG docker $USER && newgrp docker
git clone https://github.com/Akshat171/Sentifix.git && cd Sentifix
scp your-laptop:.env.prod .
```

**Two edits to `docker-compose.prod.yml`** — delete the `postgres` service block and its
`postgres_data` volume, and drop `postgres` from the app's `depends_on` (leave `redis` and
`rabbitmq` conditions in place):

```yaml
    depends_on:
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
```

**One edit to `.env.prod`** — point at RDS and require TLS:

```
DATABASE_URL=postgresql://sentifix:<password>@<rds-endpoint>:5432/sentifix?sslmode=require
```

Leave `REDIS_URL` and `RABBITMQ_URL` alone — those hostnames are still compose service names on the
internal network.

- [ ] `postgres` service + volume removed from compose
- [ ] `depends_on` no longer references postgres
- [ ] `DATABASE_URL` points at RDS with `sslmode=require`

---

## Phase 4 — Restore data

```bash
psql "postgresql://sentifix:<password>@<rds-endpoint>:5432/sentifix?sslmode=require" \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"

pg_restore -d "postgresql://sentifix:<password>@<rds-endpoint>:5432/sentifix?sslmode=require" \
  --clean --if-exists --no-owner ~/sentifix-YYYY-MM-DD.dump
```

`--no-owner` matters — the dump's role names won't exist on RDS.

This carries `issues`, `runs`, `eval_results`, and `code_chunks` with their embeddings. Skipping it
means re-indexing every connected repo (OpenAI embedding spend) and losing all triage history and
eval scores.

**Redis** — cache only, nothing to migrate.
**RabbitMQ** — don't migrate the volume. Drain it before cutover instead (Phase 6).

Then start the stack:

```bash
bash scripts/deploy.prod.sh
```

- [ ] pgvector extension present
- [ ] Restore completed without errors
- [ ] `docker compose --env-file .env.prod -f docker-compose.prod.yml ps` → all healthy

---

## Phase 5 — IP and DNS

Your deploy is IP-addressed, so **transferring the Elastic IP is the highest-leverage step** —
GitHub App webhook URLs, Slack request URLs, and DNS all keep working untouched.

```bash
# OLD account — disassociate, then offer the transfer
aws ec2 disassociate-address --profile old --association-id eipassoc-xxxx
aws ec2 enable-address-transfer --profile old \
  --allocation-id eipalloc-xxxx --transfer-account-id NEW_ACCOUNT_ID

# NEW account — accept within 7 days, then attach
aws ec2 accept-address-transfer --profile new --address 13.207.193.62
aws ec2 associate-address --profile new --allocation-id eipalloc-yyyy --instance-id i-new
```

Both accounts must be in the **same region**.

**Domains** — depends on where they live:

| Situation | Action |
|---|---|
| Registered in Route53 | Console → Registered domains → Transfer to another AWS account (free, no 60-day lock reset) |
| Hosted zone in Route53, registrar elsewhere | Recreate the zone in the new account, then update nameservers at the registrar — **new zone = different NS values**, allow up to 48h |
| DNS at Cloudflare/Namecheap | Nothing in AWS; repoint the A record only if the IP changed |

Drop A-record TTLs to 60s a day before cutover regardless, as insurance.

- [ ] Elastic IP transferred and associated (or DNS plan decided)

---

## Phase 6 — Cutover

1. **Stop inbound triage** — clear the webhook URL in the GitHub App settings, or set
   `SENTIFIX_TRIGGER=command` and redeploy the old box.
2. **Drain the old queue** — let in-flight jobs finish:
   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml exec rabbitmq rabbitmqctl list_queues
   ```
   Wait for `sentifix_triage` to hit 0, then `... down` the old stack.
3. **Final dump → restore** to pick up deltas since Phase 0.
4. **Start the new stack**, attach the Elastic IP / flip DNS.
5. **Verify**:
   ```bash
   curl http://<IP>/health                                              # {"status":"ok"}
   docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f app
   ```
6. **Re-enable the webhook**, then GitHub App → Advanced → **Redeliver** a recent event; confirm 200.
7. Open a test issue on a connected repo — triage comment within ~30s. Test a Slack command too.

> ⚠️ **Never run both boxes live at once.** Two queue consumers on one GitHub App means duplicate
> triage comments and doubled OpenAI spend.

- [ ] Queue drained, old stack down
- [ ] Final restore done
- [ ] `/health` OK, webhook redelivery 200, test issue triaged, Slack OK

---

## Phase 7 — Post-cutover

Only needed if the public URL changed:

| Where | What |
|---|---|
| GitHub App | Webhook URL, OAuth callback (`$URL/auth/callback`) |
| Slack app | Request URL, interactivity URL, redirect URLs |
| `.env.prod` | `APP_BASE_URL` |

Rotate regardless — natural moment for it: `GITHUB_WEBHOOK_SECRET` (must match GitHub's side),
`SESSION_SECRET` (logs everyone out, harmless), `POSTGRES_PASSWORD` → now the RDS master password,
`RABBITMQ_PASSWORD`, and the `OPENAI_API_KEY`. GitHub App ID / private key and Slack tokens are not
AWS-bound and carry over untouched.

**New capability worth using**: snapshot RDS before each deploy.

```bash
aws rds create-db-snapshot --profile new \
  --db-instance-identifier sentifix-db \
  --db-snapshot-identifier sentifix-predeploy-$(date +%Y%m%d-%H%M)
```

---

## Phase 8 — Decommission the old account

Wait 48–72h after a clean cutover.

1. Final EBS snapshot → `aws ec2 copy-snapshot` into the new account as a cold backup.
2. Terminate the instance; delete volumes, snapshots, AMIs; release remaining EIPs.
3. Delete IAM users and access keys.
4. Confirm the final bill is $0, then close the account (recoverable for 90 days).

---

## Rollback

If the new stack misbehaves during cutover, the old box is intact until Phase 8:

1. Re-point the Elastic IP / DNS at the old instance.
2. `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d` on the old box.
3. Re-enable the webhook.

Data written to RDS after cutover is lost on rollback — dump it first if the window was long.

---

## Dropping RDS later (if credits expire)

Not a trap you can't escape:

1. `pg_dump -Fc` from RDS.
2. Restore the `postgres` service block into `docker-compose.prod.yml`.
3. `pg_restore` into the container, point `DATABASE_URL` back at `postgres:5432`.
4. Delete the RDS instance (take a final snapshot first).
