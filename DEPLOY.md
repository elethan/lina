# Lina Deployment Guide

This document outlines the deployment strategy, infrastructure requirements, and user access model for the Lina application on the company's internal network.

## 1. Infrastructure Requirements (The VM Request)

Lina is a Node.js SSR application (using TanStack Start) with an embedded SQLite database. For production, it requires a dedicated Virtual Machine (VM) hosted within the company's internal network.

### VM Specifications

- **Operating System:** Ubuntu Server (Linux) is highly recommended for Node.js workloads, although Windows Server is fully supported.
- **Compute / Memory:** 2-4 vCPU Cores, 4GB-8GB RAM (lightweight, easily scalable if needed).
- **Storage:** 50GB SSD minimum (The SQLite database lives directly on the file system and will grow over time).

### Network & Security Requirements

- **Inbound Access:** Open ports `80` (HTTP) and `443` (HTTPS) to internal company traffic.
- **Outbound Access:** The server **must have outbound internet access** to communicate with Microsoft Entra ID servers (`login.microsoftonline.com`) for SSO authentication.
- **DNS Resolution:** An internal friendly URL/domain needs to be assigned to the VM's internal IP address (e.g., `lina.corp.local` or `lina.company.com`).
- **SSL Certificates:** An internally trusted SSL certificate must be provisioned for the chosen DNS name to ensure data is encrypted in transit and the browser shows a secure connection.

---

## 2. Server Software Stack

Once the VM is provisioned, the following stack must be installed and configured:

1. **Node.js**: The runtime environment required to execute the built TanStack Start application server.
2. **Process Manager (e.g., PM2)**: A daemon tool that runs the Node.js application in the background, automatically starts it on system boot, and immediately restarts it if the process crashes.
3. **Reverse Proxy (Nginx on Linux, or IIS on Windows)**: The Node application will run on a local port (e.g., `3000`). The proxy runs on ports `80/443`, intercepts incoming user traffic, handles the HTTPS SSL/TLS decryption, and silently proxies the traffic to the internal Node process.

---

## 3. Application Artifacts

When deploying a new version to the VM, you will transfer:

1. The built production bundle (the output of running `npm run build` locally).
2. The `package.json` file.
3. _Note: Ensure the production SQLite database file (e.g., `lina_prod.db`) is stored in a resilient, backed-up directory on the server and is not overwritten during deployments._

### Required Environment Variables

Set these on the VM/container runtime:

- `BETTER_AUTH_SECRET` **(required)** — session signing key (generate with `openssl rand -hex 32`)
- `DB_PATH` — path to SQLite file (defaults to `lina-local.db`; Docker uses `/app/shared-lina-db-vol/lina_prod.db`)
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT_ID`
- `MICROSOFT_GROUP_ADMIN_IDS` (comma-separated Entra Group Object IDs)
- `MICROSOFT_GROUP_ENGINEER_IDS` (comma-separated Entra Group Object IDs)
- `MICROSOFT_GROUP_SCIENTIST_IDS` (comma-separated Entra Group Object IDs)
- `MICROSOFT_GROUP_USER_IDS` (comma-separated Entra Group Object IDs)
- `BOOTSTRAP_ADMIN_EMAILS` (comma-separated)
- `BOOTSTRAP_USER_EMAILS` (comma-separated)

---

## 4. User Access Flow

How a Radiographer, Engineer, or Admin accesses the system:

1. **Intranet Navigation:** The user opens their web browser (Edge, Chrome) on their company laptop and navigates to the internal URL provided by IT (e.g., `https://lina.company.com`).
2. **Internal Routing:** Since the laptop is connected to the company Wi-Fi or VPN, the internal DNS resolves the URL and routes the traffic directly to the VM.
3. **Application Delivery:** The Nginx/IIS proxy receives the request, forwards it to the Node app, and the App serves the Login screen.
4. **Single Sign-On (SSO):** The user clicks "Log In". Because they are typically pre-authenticated to their Microsoft account on their company laptop, the Entra ID integration logs them in via SSO, bypassing the need for a manual password entry, and drops them into the Lina dashboard.

---

## 5. Database Security & Backups

SQLite is a serverless database, meaning it relies on the host Operating System for its security perimeter. To protect the `.db` file from unauthorized access or accidental deletion, the following strategies must be implemented on the VM:

### File System Isolation

1. **Dedicated Service Account:** Create a limited service user on the OS (e.g., `lina_service`).
2. **File Permissions:** The TanStack Start Node.js process must be executed exclusively by this `lina_service` account.
3. **Directory Locking:** Place the `lina_prod.db` file in an isolated directory (e.g., `/var/lib/lina/`). Configure the permissions (`chmod 600`) so that **only** the `lina_service` account has read/write access. Other users logged into the VM (like general IT staff) will receive "Permission Denied" if they attempt to view, modify, or delete the file.

### Network Isolation

SQLite does not listen on any network ports (unlike Postgres or MySQL). The database is completely invisible to the network. The only way to interact with the database remotely is by passing through the Lina web application and satisfying its MS Entra ID / Better Auth authorization checks.

### Automated Backups & Disaster Recovery

Even with strict permissions, the VM must have automated backups configured to prevent data loss from corruption or hardware failure:

1. **VM Snapshots:** IT should perform nightly snapshots of the entire Virtual Machine.
2. **Database Dumps (Cron Job):** Set up an hourly or daily scheduled task (cron job) that runs a native SQLite backup command:

   ```bash
   sqlite3 lina_prod.db ".backup 'backup_$(date +%Y%m%d).db'"
   ```

3. **Off-Server Storage:** The script should automatically copy these `.db` backup files to a separate, secure network drive or cloud storage bucket.

### Encryption at Rest (Optional)

If company policy requires data to be encrypted at rest, IT can enable Full Disk Encryption (e.g., BitLocker on Windows, LUKS on Linux) on the server instance. Because SQLite operates as standard files, the OS disk encryption seamlessly secures the database.

---

## 6. Docker Compose Deployment (Recommended)

If the IT department prefers containerized workloads, Lina should be deployed with Docker Compose. This keeps deployment configuration in a single versioned file and avoids pasting secrets directly into shell commands.

### The Docker Image

A `Dockerfile` is included in the root of the repository. It:

1. Installs build tools for `better-sqlite3`.
2. Packages the built TanStack Start application.
3. Sets production defaults (`NODE_ENV`, `PORT`, and `DB_PATH`).
4. Switches to a secure, unprivileged `node` user to run the server.

### Critical: Persistent Named Volumes for SQLite

Docker containers are **ephemeral**. If a container is replaced during updates, files inside the container are lost.

To prevent the `.db` file from being wiped, Lina uses a **Managed Docker Volume** (`docker-lina-vol`). This preserves data across container restarts and recreations.

### Deployment Steps (Docker Compose)

**Step 1. Build the Docker Image**

```bash
docker build -t lina-app:latest .
```

**Step 2. Generate the Session Secret**

```bash
openssl rand -hex 32
```

Save this output securely. It is required by `BETTER_AUTH_SECRET` in production.

**Step 3. Create the Runtime Environment File on the Host VM**

Create a host-only environment file (do not commit it to git), for example `/etc/lina/lina.env`:

```ini
BETTER_AUTH_SECRET=<paste-output-from-step-2>
VITE_APP_URL=https://lina.company.com

# Optional Microsoft Entra SSO (set all three or none)
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
VITE_ENABLE_MICROSOFT_SSO=true

# Optional Group Mapping
MICROSOFT_GROUP_ADMIN_IDS=
MICROSOFT_GROUP_ENGINEER_IDS=
MICROSOFT_GROUP_SCIENTIST_IDS=
MICROSOFT_GROUP_USER_IDS=

# Optional Bootstrap Provisioning
BOOTSTRAP_ADMIN_EMAILS=
BOOTSTRAP_USER_EMAILS=
```

**Step 4. Ensure the Database Volume Exists**

```bash
docker volume create docker-lina-vol
```

**Step 5. Copy the Seeded Database into the Volume (first deployment only)**

```bash
docker run --rm \
  -v docker-lina-vol:/vol \
  -v "$(pwd):/src" \
  alpine cp /src/lina-local.db /vol/lina_prod.db
```

**Step 6. Start the Application with Compose**

```bash
docker compose up -d
```

Useful commands:

```bash
docker compose logs -f
docker compose restart
docker compose down
```

### Updating to a New Version

```bash
docker build -t lina-app:latest .
docker compose up -d --force-recreate
```

### Database Backups with Named Volumes

Because the database lives inside a managed Docker volume, backup jobs should mount that volume into a temporary container:

```bash
# Example Cron task: archive the named volume contents daily
docker run --rm \
  -v docker-lina-vol:/db \
  -v /var/backups/lina:/backup \
  alpine tar czf /backup/db-backup-$(date +%Y%m%d).tar.gz /db
```
