# Lina Manual Workflow (No GitHub Actions Runners)

This guide explains how to work with the company GitHub repository and deploy manually without using GitHub Actions runners.

## Goal

Use this flow:

1. Code lives in the company GitHub repo.
2. Developers make changes from work laptops and merge to main.
3. A developer manually builds and pushes a Docker image to GHCR.
4. The server pulls the new image and restarts the app container.

No runner is required for this workflow.

## Does docker-compose stay the same?

Short answer: yes, and it is now aligned for pull-only deployments.

Current compose behavior:

- lina service uses only the GHCR image reference.
- deployments run docker compose pull lina then docker compose up -d.

This prevents accidental server-side local builds and keeps deploys predictable.

## 1) Initial transfer to company repo

Run on your current machine in this repo:

```powershell
git remote -v
git remote add company https://github.com/genesiscare-eu/engineering.git
git push -u company corp-transfer-repo
```

Then:

1. Open a PR in the company repo from corp-transfer-repo to main.
2. Get review and merge.
3. Treat company main as the source of truth going forward.

## 2) Day-to-day development from work laptop

### First-time setup on work laptop

```powershell
git clone https://github.com/genesiscare-eu/engineering.git
cd engineering
git checkout main
git pull --ff-only
```

### For each change

```powershell
git checkout -b feature/short-description
# make changes
git add -A
git commit -m "Describe the change"
git push -u origin feature/short-description
```

Then:

1. Open PR to main.
2. Merge after review.

## 3) Build and publish Docker image manually

Run this on a machine with Docker (usually your work laptop or a build VM).

### 3.1 Login to GHCR

You need a GitHub token with package write access.

```powershell
echo YOUR_GHCR_WRITE_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

### 3.2 Build and push image

From repo root:

```powershell
docker buildx build --platform linux/amd64 -t ghcr.io/genesiscare-eu/engineering:latest --push .
```

Recommended stronger tagging (optional):

```powershell
git rev-parse --short HEAD
docker buildx build --platform linux/amd64 -t ghcr.io/genesiscare-eu/engineering:latest -t ghcr.io/genesiscare-eu/engineering:COMMIT_SHA --push .
```

Why this matters:

- latest gives a simple deploy target.
- commit tag gives rollback safety.

## 4) Deploy on server (pull + restart)

SSH into server:

```bash
ssh root@<SERVER_IP>
cd /lina_app
```

Login to GHCR (read token is enough on server):

```bash
echo YOUR_GHCR_READ_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

Pull and restart only lina:

```bash
docker compose pull lina
docker compose up -d --no-deps lina
docker compose ps
docker compose logs --tail=100 lina
```

If you changed Caddyfile or docker-compose.yml too, run:

```bash
docker compose up -d
```

## 5) Optional rollback

If you pushed commit-tagged images:

1. Edit docker-compose.yml image tag from latest to the previous known-good tag.
2. Deploy again:

```bash
docker compose pull lina
docker compose up -d --no-deps lina
```

## 6) Optional hard switch away from runners

If you want zero runner usage in this repo:

1. Delete or disable .github/workflows/deploy.yml.
2. Remove deploy-related Actions secrets:
   - SERVER_HOST
   - SERVER_USER
   - SERVER_SSH_KEY
3. Remove old deploy key from server authorized_keys if it was only used by Actions.

## 7) Quick command checklist

Developer side:

```powershell
# update code
git checkout main
git pull --ff-only

# feature branch work
git checkout -b feature/my-change
# edit files
git add -A
git commit -m "My change"
git push -u origin feature/my-change

# after merge to main, build and push image
echo YOUR_GHCR_WRITE_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
docker buildx build --platform linux/amd64 -t ghcr.io/genesiscare-eu/engineering:latest --push .
```

Server side:

```bash
ssh root@<SERVER_IP>
cd /lina_app
echo YOUR_GHCR_READ_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
docker compose pull lina
docker compose up -d --no-deps lina
docker compose logs --tail=100 lina
```
