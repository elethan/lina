# Security Overview - Lina CMMS

This document provides a high-level overview of the security architecture for the Lina application. It is designed to assist the IT and Security departments in evaluating the application for internal deployment.

## 1. Identity & Authentication

Lina relies entirely on the company's existing identity provider rather than managing its own credentials for end users.

- **SSO Integration:** Authentication supports Microsoft Entra ID (formerly Azure AD) using the `better-auth` library.
- **Local Credentials:** Email/password is currently enabled for development and controlled internal use. For production, enforce Entra SSO policy and disable local credentials if required by IT.
- **Session Management:** Sessions are established via secure, HttpOnly cookies generated after successful Entra ID verification.
- **Role Provisioning:** Entra users are role-mapped from group claims to app roles (`admin`, `engineer`, `scientist`, `user`) via configured environment group IDs, including a required `MICROSOFT_GROUP_USER_IDS` value for standard request-only users.
- **Bootstrap Allowlists:** `BOOTSTRAP_ADMIN_EMAILS` and `BOOTSTRAP_USER_EMAILS` are mandatory and used as explicit fallback allowlists for controlled account provisioning.

## 2. Authorization & Access Control (RBAC)

Access to the application is strictly regulated by Role-Based Access Control (RBAC).

- **Roles:** Users are assigned one of four database-enforced roles (`admin`, `engineer`, `scientist`, `user`).
- **Route Protection:** Unauthenticated users are hard-redirected away from all application routes. Server-level checks prevent unauthorized roles from loading restricted pages (e.g., a `user` physically cannot load the Work Orders page).
- **API Protection:** Backend server functions (`createServerFn`) validate the active session and the user's role before executing restricted database mutations (defense in depth beyond page guards).

## 3. Database Architecture & Security

Lina does not use a traditional database server (like SQL Server or PostgreSQL). It uses an embedded **SQLite** database.

- **No Network Footprint:** SQLite does not listen on any network ports. There is no IP address or port to port-scan, bruteforce, or attack.
- **File-System Isolation:** The database is a single file (`lina_prod.db`). Security boundaries rely entirely on host Operating System permissions.
- **VM / Docker Protection:** Using the recommended Docker deployment, the application runs as a restricted `node` user (UID 1000). The host IT team must provision a service account on the VM with corresponding permissions (`chmod 600`) to strictly lock down the physical folder housing the `.db` file.

## 4. Network Security & Application Edge

The application is expressly designed to be an internal, Intranet-only tool.

- **Internal Routing:** IT should host the Virtual Machine on a private subnet, inaccessible from the public internet.
- **Reverse Proxy:** Incoming traffic should be intercepted by a reverse proxy (Nginx or IIS). The raw Node.js process (`port 3000`) should never be exposed directly to the network.
- **Encryption in Transit (HTTPS):** All data must be encrypted between the client browser and the reverse proxy. IT must provide and maintain a corporate, trusted SSL/TLS certificate for the internal domain (e.g., `lina.company.com`).

## 5. Data Privacy & Classification

Lina is an asset and maintenance management system, not a patient care system.

- **No Protected Health Information (PHI):** The application handles zero patient data. No names, physiological data, or treatment schedules are ingested or stored.
- **Data Scope:** The only collected data is hardware metadata (Linac machine records, configurations) and basic employee references (names and work emails needed for SSO and attribution of work orders).
- **Data Residency:** All data remains completely on-premise within the boundaries of the SQLite file on the internal VM.

## 6. Backup & Disaster Recovery

Given the stateful nature of SQLite, backups form a critical pillar of the security and recovery posture.

- **Automated Dumps:** A cron job on the host machine will automatically create scheduled `.db` snapshots (e.g., nightly).
- **External Storage:** Backups must be copied to offline (external) storage managed by IT, ensuring that local VM corruption does not compromise backup integrity.
- **Point-in-Time Recovery:** In extreme ransomware or deletion scenarios, restoration is as simple as replacing the current `lina_prod.db` file with the most recent backup copy.

## 7. Dependency Vulnerability Management

Being a modern Node.js application, the project relies on open-source packages (NPM).

- **Automated Scanning:** The codebase utilizes `npm audit` to detect critical vulnerabilities in third-party packages. These updates will be applied periodically.
- **Lockfiles:** A strict `package-lock.json` ensures that builds are reproducible and immune to unapproved upstream "supply chain" updates.
- **Container Scanning:** If using the Docker deployment, the resulting Docker image can be smoothly scanned by IT using standard corporate tools (e.g., Trivy, Azure Defender) before registry publication.

## 8. Structured Logging & Audit Trails

To support enterprise compliance and security information and event management (SIEM) integration, the application adheres to consistent, cloud-native observability standards.

- **Standardized JSON Output:** The application ensures that all critical system events and errors are formatted as concise JSON traces outputted locally to standard streams (`stdout` and `stderr`).
- **Authentication Auditing:** Utilizing server lifecycle hooks, successful authentication events and newly provisioned accounts immediately emit structured `USER_LOGIN` and `USER_CREATED` logs natively tagged with the acting `userId`, verifying the source of data modification.
- **Frictionless Ingestion:** Because the containerized application exposes logs exclusively via standard streams, IT can seamlessly attach node-level log shipping agents (Datadog, Splunk, ELK, or CloudWatch) without provisioning sidecar containers or complex shipping scripts.

## 9. API Error Handling & Data Leak Prevention

Lina prevents information spillage (stack-traces, SQL connection details, or runtime schema layouts) across the network boundary through global interception.

- **Centralized Middleware Interception:** Every backend data modification or retrieval function exposes traffic through a unified error-catching middleware wrapper (`authServerFn`).
- **Sterilized Client Handlers:** If a catastrophic connection or memory crash occurs during a database procedure, the middleware traps the raw error stack securely on the Node process. The error is then logged directly into the `stderr` JSON stream (as an `API_UNHANDLED_EXCEPTION`), while strictly returning a deliberately vague and non-actionable "unexpected server error" to the client.

## 10. Known Gaps & Action Items (For IT Collaboration)

To reach a production-ready security posture, we need IT's assistance in implementing the following missing pieces:

- [ ] **VM Provisioning:** Provide a secure, patched Linux or Windows Server VM on the internal network.
- [ ] **Entra ID App Registration:** IT needs to register "Lina" as an Enterprise Application in the Azure Portal to generate the `Client ID` and `Client Secret` required for SSO integration.
- [ ] **SSL Certificates:** Provision a valid internal certificate and configure the reverse proxy (Nginx/IIS) to enforce HTTPS traffic.
- [ ] **Automated Backups:** Implement a daily, automated snapshot/backup strategy at the VM level to ensure the SQLite file can be restored in disaster scenarios.
- [ ] **Encryption at Rest:** Ensure the host VM has Full Disk Encryption (e.g., LUKS or BitLocker) enabled in accordance with company policy.
