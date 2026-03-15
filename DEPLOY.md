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

## 6. Alternative: Docker Deployment

If the IT department prefers containerized workloads, Lina can be deployed as a Docker container. This simplifies the host VM requirements (only Docker is needed, not Node.js or PM2).

### The Docker Image

A `Dockerfile` is included in the root of the repository. It:

1. Installs build tools for `better-sqlite3`.
2. Packages the built TanStack Start application.
3. Automatically maps application ports and environment variables.
4. Switches to a secure, unprivileged `node` user to run the server.

### Critical: Persistent Named Volumes for SQLite

Docker containers instances are **ephemeral**; this means if the container restarts, updates, or crashes, anything written inside the container is permanently lost.

To prevent the `.db` file from being wiped, we use a **Managed Docker Volume**. Unlike a raw bind-mount to a host directory, a named volume is fully managed by the Docker engine, ensuring correct file permissions and making it easier to back up.

### Two-Layer Security in Docker

Using Docker introduces a two-layer security model for protecting the SQLite database:

1. **Inside the Container (`node` user):**
   The application runs inside the isolated container as an unprivileged, built-in `node` user (typically UID 1000). If the Node app is somehow compromised, the attacker is trapped inside the container as a limited user without root privileges to the underlying VM.

2. **On the Host VM (Docker Engine):**
   Because we use a managed Docker Volume (`docker-lina-vol`), the physical location of the data is tucked away inside Docker's internal data directory (usually `/var/lib/docker/volumes`). General IT staff traversing the host VM are less likely to stumble upon and accidentally delete or modify the active database file compared to a raw `/var/lib/` mount. Standard OS protections of the Docker daemon directory prevent unauthorized access.

### Deployment Steps (Docker)

**Step 1. Create the Named Volume**
Execute this once on the host VM before running the container:

```bash
docker volume create docker-lina-vol
```

**Step 2. Run the Container**
Start the application, attaching the volume to the container's designated data folder (`/app/shared-lina-db-vol`):

```bash
docker run -d \
  -p 3000:3000 \
  -e DB_PATH=/app/shared-lina-db-vol/lina_prod.db \
  -e NODE_ENV=production \
  -v docker-lina-vol:/app/shared-lina-db-vol \
  --name lina-container \
  --restart always \
  lina-app:latest
```

- **`-v docker-lina-vol:/app/shared-lina-db-vol`**: This is the most crucial part. It tells Docker to mount the managed named volume into the container where the DB lives.
- **`-p 3000:3000`**: Exposes the Node app to the VM. The reverse proxy (Nginx) still sits in front of this, listening on `80/443` and forwarding to `3000`.
- **`--restart always`**: Tells Docker to act like PM2, automatically starting the container if the VM reboots.

### Special Note on Database Backups with Named Volumes

Because the data lives inside a managed Docker Volume rather than a standard folder, your automated cron backups will use a temporary Docker container to perform the backup:

```bash
# Example Cron task: Mount the data volume and a host backup folder, create a tarball, then destroy the temp container
docker run --rm \
  -v docker-lina-vol:/db \
  -v /var/backups/lina:/backup \
  ubuntu tar cvf /backup/db-backup-$(date +%Y%m%d).tar /db
```
