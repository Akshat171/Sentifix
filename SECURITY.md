# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| `main` branch | ✅ |
| Older releases | ❌ — upgrade to latest |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Send a description of the vulnerability to **akshat.jangid@hirequotient.com** with:

- A description of the issue and its potential impact
- Steps to reproduce or proof-of-concept
- Any suggested mitigations (optional)

You will receive an acknowledgement within **48 hours** and a status update within **7 days**.

We follow responsible disclosure — once a fix is ready we will credit you (unless you prefer anonymity) and publish a security advisory.

## Scope

In scope:
- Webhook HMAC bypass
- API key / authentication bypass
- SQL injection or data exfiltration
- Secrets leaking through logs or API responses
- SSRF in the indexing / GitHub fetching pipeline

Out of scope:
- Rate limiting bypasses in development mode (no `API_KEY` set)
- Issues in dependencies — report those to the upstream project
- Social engineering attacks

## Security-relevant design notes

- GitHub webhook payloads are validated with HMAC-SHA256 before any processing
- Slack webhook payloads use `v0:${timestamp}:${body}` signature verification with 5-minute replay protection
- Raw webhook bodies are never logged
- The `.env` file is in `.gitignore` — never commit secrets
- `GITHUB_TOKEN` and `OPENAI_API_KEY` are accessed only at runtime via `ConfigService`
