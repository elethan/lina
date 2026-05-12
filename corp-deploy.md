# Lina Corporate Deployment Guide

This document defines a manual, runner-free deployment model for Lina on a company-managed VM.

## 1. Infrastructure Requirements (VM Request)

Lina is a Node.js SSR application (TanStack Start) with an embedded SQLite database.
Production should run on a dedicated VM.

### VM Specifications

- Operating System: Ubuntu Server (Linux) recommended. Windows Server is possible but not preferred.
- Compute and Memory: 2-4 vCPU, 4-8 GB RAM.
- Storage: 50 GB SSD minimum.

### Network and Security Requirements

- Inbound Access: Open ports 80 and 443 from corporate client networks.
- SSH Access: Open port 22 only from trusted IT admin sources (for manual deployment and ops).
- Outbound Access: Allow HTTPS outbound to login.microsoftonline.com for Microsoft Entra SSO.
- DNS: Map an internal DNS name to the VM IP (example: lina.corp.local).
- TLS: Use an internally trusted certificate for the DNS name.

## 2. Server Software Stack

Install and maintain the following on the VM:

1. Docker Engine and Docker Compose plugin.
2. Git (for manual pull and update workflow).
3. Caddy (containerized, defined in Docker Compose).
4. No GitHub Actions runner is required for this deployment model.

## 3. Deployment Inputs

Manual deployment uses source checkout on the VM, not CI runners.

Required on the VM:

1. Repository checkout in /lina_app.
2. docker-compose.yml and Caddyfile from the repo.
3. lina.env with production secrets and URLs.
4. Persistent Docker volume lina_data for SQLite.

## 4. User Access Flow

1. User browses to the internal URL (example: https://lina.corp.local).
2. Internal DNS resolves to the Lina VM.
3. Caddy terminates TLS and forwards traffic to Lina container.
4. User signs in using Microsoft Entra SSO (or email/password fallback if enabled).

## 5. Database Security and Backups

Lina stores SQLite data in Docker named volume lina_data.

### File System Isolation (Docker)

1. Keep USER node in the app image.
2. Ensure /app/shared-lina-db-vol/lina_prod.db is owned by UID/GID 1000:1000.
3. Keep strict modes: db file 600, directory 700.
4. Treat docker group membership as privileged access.
5. Keep DB in named volume, not host bind mount.

Recommended verification:

```bash
docker run --rm -v lina_data:/vol alpine ls -ld /vol
docker run --rm -v lina_data:/vol alpine ls -l /vol
```

## 6. Docker Architecture and Configurations

Lina runs as two services:

- lina (Node.js app container)
- caddy (reverse proxy and TLS)

Traffic path:

Corporate Network -> Caddy (:80/:443) -> Lina (:3000)

### 6.1 Docker Compose (Manual Build Model)

Place this file at /lina_app/docker-compose.yml:

```yaml
services:
  lina:
    build: .
    container_name: lina-container
    restart: always
    volumes:
      - lina_data:/app/shared-lina-db-vol
    env_file:
      - ./lina.env

  caddy:
    image: caddy:latest
    container_name: caddy-container
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      # - ./corp-certs:/etc/caddy/certs   # Optional for corporate-issued certs
      - caddy_data:/data
      - caddy_config:/config

volumes:
  lina_data:
    name: lina_data
    external: true
  caddy_data:
  caddy_config:
```

### 6.2 Caddy TLS Configuration

Option A: Internal CA

```caddy
lina.corp.local {
    tls internal
    reverse_proxy lina-container:3000
}
```

Option B: Corporate certificate

```caddy
lina.corp.local {
    tls /etc/caddy/certs/lina-cert.pem /etc/caddy/certs/lina-key.pem
    reverse_proxy lina-container:3000
}
```

## 7. Manual Deployment Without Runners

### 7.1 Remove Runner-Based Automation

If you are moving fully to manual deployment:

1. Disable or delete .github/workflows/deploy.yml.
2. Remove repository Actions secrets used only for deploy:
   - SERVER_HOST
   - SERVER_USER
   - SERVER_SSH_KEY
3. Remove old deploy key from server authorized_keys if it was only for GitHub Actions.
4. Optional: disable GitHub Actions at repository level.

### 7.2 One-Time Server Setup

#### 0. SSH firewall policy

Ensure inbound SSH (22) is allowed from approved admin sources only.
Verify password auth is disabled:

```bash
ssh root@<INTERNAL_IP> "grep PasswordAuthentication /etc/ssh/sshd_config"
```

#### 1. Install Docker and Compose plugin

```bash
curl -fsSL https://get.docker.com | sh
apt-get update && apt-get install -y docker-compose-plugin
```

#### 2. Install Git

```bash
apt-get update && apt-get install -y git
```

#### 3. Create deployment directory and clone repo

```bash
mkdir -p /lina_app
git clone <REPO_URL> /lina_app
cd /lina_app
git checkout main
```

#### 4. Create production environment file

```bash
nano /lina_app/lina.env
```

Use values like:

```ini
BETTER_AUTH_SECRET=<openssl rand -hex 32 output>
VITE_APP_URL=https://lina.corp.local
BETTER_AUTH_URL=https://lina.corp.local
DB_PATH=/app/shared-lina-db-vol/lina_prod.db

# Optional Microsoft Entra SSO (set all 3 or none)
# MICROSOFT_CLIENT_ID=
# MICROSOFT_CLIENT_SECRET=
# MICROSOFT_TENANT_ID=
# VITE_ENABLE_MICROSOFT_SSO=true

# Optional role mapping and bootstrap
# MICROSOFT_GROUP_ADMIN_IDS=
# MICROSOFT_GROUP_ENGINEER_IDS=
# MICROSOFT_GROUP_SCIENTIST_IDS=
# MICROSOFT_GROUP_THERAPIST_IDS=
# BOOTSTRAP_ADMIN_EMAILS=
# BOOTSTRAP_THERAPIST_EMAILS=
```

Lock down secrets file:

```bash
chown root:root /lina_app/lina.env
chmod 600 /lina_app/lina.env
```

### 7.3 Seed Database (First Deployment Only)

From local repo:

```bash
node prepare4export-db.js
scp lina-prod.db root@<INTERNAL_IP>:/lina_app/lina-local.db
```

On VM:

```bash
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
```

### 7.4 First Start

```bash
cd /lina_app
docker compose up -d --build
docker compose ps
docker compose logs --tail=200 lina
```

### 7.5 Manual Update Procedure (No Runners)

```bash
ssh root@<INTERNAL_IP>
cd /lina_app
git pull --ff-only
docker compose build --pull lina
docker compose up -d
docker image prune -af
```

### 7.6 Backup and Restore

The app creates a nightly SQLite backup in lina_data as lina_prod_backup.db.

Restore:

```bash
docker stop lina-container

docker run --rm -v lina_data:/vol alpine sh -c '
  rm -f /vol/lina_prod.db-wal
  rm -f /vol/lina_prod.db-shm
  cp /vol/lina_prod_backup.db /vol/lina_prod.db
  chown 1000:1000 /vol/lina_prod.db
  chmod 600 /vol/lina_prod.db
'

docker start lina-container
```
