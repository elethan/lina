# Lina Corporate Deployment Guide

This document defines the corporate deployment standard for Lina.

For company laptop repo setup, PR creation/merge workflow, and troubleshooting missing Create/Merge buttons, see [make-changes-request.md](make-changes-request.md).

## 1. Deployment Strategy

Chosen model:

1. Build in GitHub Actions (build-only workflow).
2. Deploy manually on the VM (operator-driven pull and restart).
3. No GitHub Actions SSH deployment step.

## 2. Infrastructure Requirements

### VM Baseline

- OS: Ubuntu Server recommended.
- Capacity: 2-4 vCPU, 4-8 GB RAM.
- Storage: 50 GB SSD minimum.

### Network

- Inbound: 80 and 443 from approved corporate client networks.
- SSH: 22 from approved admin source IPs only.
- Outbound: HTTPS to `ghcr.io` and `login.microsoftonline.com`.

### DNS and TLS

- Internal DNS name mapped to VM IP (example: `lina.corp.local`).
- Internal CA cert (`tls internal`) or corporate-issued certificate in Caddy.

## 3. Build-Only GitHub Workflow

Use this workflow at `.github/workflows/deploy.yml`:

```yaml
name: Build Image

on:
  workflow_dispatch:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
```

Notes:

- Workflow output image path is `ghcr.io/<org>/<repo>`.
- Keep compose image value aligned with repository slug.
- If repo is `genesiscare-eu/engineering`, image path must be `ghcr.io/genesiscare-eu/engineering:latest`.

## 4. Server Runtime (Docker Compose)

Compose runs two services:

- `lina` (app container)
- `caddy` (reverse proxy)

### 4.1 Full `docker-compose.yml` with line-by-line comments

Use this layout in `/lina_app/docker-compose.yml`:

```yaml
services: # Define all runtime services managed by Docker Compose.
  lina: # Application service for Lina.
    image: ghcr.io/genesiscare-eu/engineering:latest # Image built by the GitHub build workflow.
    container_name: lina-container # Stable container name used by Caddy reverse_proxy target.
    restart: always # Keep container running across restarts and transient failures.
    volumes: # Declare container volume mounts.
      - lina_data:/app/shared-lina-db-vol # Persist SQLite DB files outside the container filesystem.
    env_file: # Load environment variables from a file.
      - ./lina.env # Runtime app config and secrets for production.

  caddy: # Reverse proxy service handling inbound HTTP/HTTPS.
    image: caddy:latest # Official Caddy image.
    container_name: caddy-container # Stable container name for ops/debugging.
    restart: always # Keep proxy online after host/container restarts.
    ports: # Expose web ports on the VM.
      - "80:80" # HTTP ingress.
      - "443:443" # HTTPS ingress.
    volumes: # Mount Caddy config and persistent state.
      - ./Caddyfile:/etc/caddy/Caddyfile 
      # - ./corp-certs:/etc/caddy/certs # Uncomment only when using company-issued certificate files.
      - caddy_data:/data # Caddy-managed certificate and state data.
      - caddy_config:/config # Caddy runtime config storage.

volumes: # Declare named volumes used above.
  lina_data: # Persistent application database volume.
    name: lina_data # Keep fixed name for seed/restore commands and cross-compose consistency.
    external: true # Volume must exist already and is not recreated by compose up.
  caddy_data: # Persistent Caddy data volume.
  caddy_config: # Persistent Caddy config volume.
```

### 4.2 `Caddyfile` behavior and certificate choices

Current runtime behavior is a single site block for `lina.corp.local` that proxies traffic to the `lina-container` app on port `3000`.

Recommended baseline `Caddyfile`:

```caddy
lina.corp.local {
    tls internal
    reverse_proxy lina-container:3000
}
```

Certificate options:

1. Option A: Internal certificate (`tls internal`)
- Caddy issues and rotates certificates from its internal CA.
- Best for internal-only environments where IT can trust the internal CA root on managed clients.
- No certificate files need to be mounted in compose.

2. Option B: Company-issued certificate files
- Use corporate PKI-managed cert and key files mounted into Caddy.
- Uncomment cert mount in compose:
  `- ./corp-certs:/etc/caddy/certs`
- Update `Caddyfile` to point to mounted certificate files:

```caddy
lina.corp.local {
    tls /etc/caddy/certs/lina.crt /etc/caddy/certs/lina.key
    reverse_proxy lina-container:3000
}
```

Deployment note:

- If `docker-compose.yml` or `Caddyfile` changes, run:
  `docker compose up -d`

Deploy commands still target the `lina` service for app-only refreshes:

- `docker compose pull lina`
- `docker compose up -d --no-deps lina`

## 5. Manual Deployment Procedure

### 5.1 Trigger build

- Automatic: push/merge to `main`.
- Manual: run `Build Image` workflow via GitHub Actions UI.

### 5.2 First-Time Database Seed (one-time)

Prepare and copy the initial database from your trusted source machine:

```bash
node prepare4export-db.js
scp lina-prod.db VM_USER@VM_HOST:/lina_app/lina-local.db
```

On the VM, import it into the persistent `lina_data` volume used by the container:

```bash
cd /lina_app
docker volume create lina_data
docker run --rm \
  -v lina_data:/vol \
  -v /lina_app/lina-local.db:/src/db:ro \
  alpine sh -c '
    cp /src/db /vol/lina_prod.db
    chown 1000:1000 /vol/lina_prod.db
    chmod 600 /vol/lina_prod.db
    chown 1000:1000 /vol
    chmod 700 /vol
  '
docker run --rm -v lina_data:/vol alpine ls -l /vol
```

Expected result: `/vol/lina_prod.db` exists with owner `1000:1000` and mode `-rw-------`.

### 5.3 Deploy on VM

```bash
cd /lina_app
echo SERVER_GHCR_READ_TOKEN | docker login ghcr.io -u SERVER_GHCR_USER --password-stdin
docker compose pull lina
docker compose up -d --no-deps lina
docker compose ps
docker compose logs --tail=100 lina
```

If compose or caddy changed:

```bash
docker compose up -d
```

## 6. Tokens and Scopes

Use classic PATs for GHCR package auth.

### Build Token (Laptop/Build Machine)

- Scope: `write:packages`
- Purpose: push images to GHCR.

Login command:

```bash
echo LAPTOP_GHCR_WRITE_TOKEN | docker login ghcr.io -u LAPTOP_GHCR_USER --password-stdin
```

### Server Token (VM Pull Only)

- Scope: `read:packages`
- Purpose: pull images from GHCR.

Login command:

```bash
echo SERVER_GHCR_READ_TOKEN | docker login ghcr.io -u SERVER_GHCR_USER --password-stdin
```

Requirements:

- Token owner must have package access to `ghcr.io/<org>/<repo>`.
- If org enforces SSO/SAML, token must be SSO-authorized.

## 7. What to Ask IT For

1. Repository access
- Write access to company repository for developers and release owners.

2. Package permissions
- Confirm package read/write grants for required users/service accounts.

3. Token issuance and policy
- Build token (`write:packages`) for laptop/build machine.
- Server token (`read:packages`) for VM pull.
- Token storage standards, expiry, and rotation process.

4. Server access
- SSH access and approved source IP policy.
- Owner for manual deployment operations.

5. Network and security controls
- Outbound allowlist for `ghcr.io` and Microsoft Entra endpoints.
- TLS certificate provisioning and renewal process.

6. Operations ownership
- Change window process.
- Rollback owner and runbook location.

## 8. Rollback

If latest is bad, pin to a known-good tag in compose and redeploy:

```bash
docker compose pull lina
docker compose up -d --no-deps lina
```

## 9. Optional: Disable Runner-Based Deploy Artifacts

If previously used:

1. Remove SSH deploy secrets from repository settings.
2. Remove old deploy keys from VM authorized keys.
3. Keep only build workflow in GitHub Actions.
