# Lina Manual Workflow

This runbook defines the selected delivery model:

1. GitHub Actions builds and publishes the container image.
2. Deployment to the VM is manual.
3. No runner SSH deployment step is used.

## Selected Model

Build only from GitHub Actions, then manual deploy on server.

- Build trigger: push to main or manual workflow dispatch from a work laptop.
- Deploy trigger: operator runs docker compose pull and restart commands on the VM.

## Compose and Image Mapping

In docker-compose, `lina` is the service name and `image` is the registry image.

- `docker compose pull lina` means: pull the image configured under the `lina` service.
- If the company repo slug is `genesiscare-eu/engineering`, image should be `ghcr.io/genesiscare-eu/engineering:latest`.
- Keep the compose image name aligned with the workflow output image name.

## Build Workflow File

Path: `.github/workflows/deploy.yml`

Use this build-only workflow:

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

- `${{ github.repository }}` becomes `<org>/<repo>` for the current repository.
- In `genesiscare-eu/engineering`, the workflow publishes to `ghcr.io/genesiscare-eu/engineering`.

## 1) Initial Transfer to Company Repo

If repo access works from this machine:

```powershell
git remote add company https://github.com/genesiscare-eu/engineering.git
git push -u company corp-transfer-repo
```

Then open a PR from `corp-transfer-repo` to `main` in the company repo and merge.

If access only works from work laptop:

```powershell
git bundle create corp-transfer-repo.bundle corp-transfer-repo
```

Copy the bundle to the work laptop, then:

```powershell
git clone https://github.com/genesiscare-eu/engineering.git
cd engineering
git fetch C:\path\to\corp-transfer-repo.bundle corp-transfer-repo:corp-transfer-repo
git checkout corp-transfer-repo
git push -u origin corp-transfer-repo
```

## 2) Day-to-Day Dev Flow (Work Laptop)

```powershell
git checkout main
git pull --ff-only
git checkout -b feature/short-description
# edit files
git add -A
git commit -m "Describe change"
git push -u origin feature/short-description
```

Open PR to `main`, review, merge.

## 3) Build Trigger From Work Laptop

Option A: automatic build

- Merge PR to `main`.
- Workflow runs automatically on push to `main`.

Option B: manual build

- Open Actions in GitHub and run `Build Image` with `main` selected.
- Or use GitHub CLI:

```powershell
gh workflow run "Build Image" --ref main
```

## 4) First-Time Database Seed (one-time)

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

## 5) Manual Deploy on VM

On the VM:

```bash
cd /lina_app
echo SERVER_GHCR_READ_TOKEN | docker login ghcr.io -u SERVER_GHCR_USER --password-stdin
docker compose pull lina
docker compose up -d --no-deps lina
docker compose ps
docker compose logs --tail=100 lina
```

If compose or caddy config changed, use:

```bash
docker compose up -d
```

## 6) Tokens, Scopes, and Login Commands

Use classic PATs for GHCR package auth.

### Laptop Build Token

Purpose:

- Push image to GHCR from laptop/CLI.

Minimum scope:

- `write:packages`

Command:

```powershell
echo LAPTOP_GHCR_WRITE_TOKEN | docker login ghcr.io -u LAPTOP_GHCR_USER --password-stdin
```

### Server Pull Token

Purpose:

- Pull image on VM during manual deploy.

Minimum scope:

- `read:packages`

Command:

```bash
echo SERVER_GHCR_READ_TOKEN | docker login ghcr.io -u SERVER_GHCR_USER --password-stdin
```

Important:

- Token owner must have package access to `ghcr.io/<org>/<repo>`.
- If organization uses SSO/SAML, token must be SSO-authorized.

## 7) What to Ask IT For

1. Repo access
- Write access to `genesiscare-eu/engineering` for developers who push branches and create PRs.

2. Package access
- Confirm package read/write permissions for the relevant accounts.

3. Tokens
- One build token for laptop/build machine: classic PAT with `write:packages`.
- One server token for VM: classic PAT with `read:packages` only.
- Prefer service account for server token, not personal account.

4. VM/network
- SSH access from IT/admin source IPs to server.
- Outbound HTTPS from server to `ghcr.io` and `login.microsoftonline.com`.

5. Security policy
- Token expiry policy and rotation process.
- SSO authorization requirements for PATs.

6. Ops ownership
- Who runs manual deploy commands.
- Who handles rollback and incident response.

## 8) Quick Checklist

1. Merge PR to main.
2. Confirm build workflow completed and image tag exists.
3. On first deployment only, run the one-time DB seed steps above.
4. SSH to VM.
5. Run GHCR login with server read token.
6. Pull and restart `lina` service.
7. Validate app health and logs.
