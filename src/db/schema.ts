import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// --- A. HELPER COLUMNS (Sync & Soft Delete) ---
const commonCols = {
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .$onUpdate(() => new Date()), // Auto-update timestamp
  deletedAt: integer('deleted_at', { mode: 'timestamp' }), // Soft Delete support
};

// --- B. AUTHENTICATION TABLES (Better-Auth + Entra ID) ---
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  // NEW: Strongly typed roles
  role: text('role', { enum: ['admin', 'engineer', 'scientist', 'user'] })
    .default('user')
    .notNull(),
});
// --- 2. THE NEW PERMISSIONS TABLE ---
// This allows you to map specific actions to specific roles
export const rolePermissions = sqliteTable('role_permissions', {
  /* A role can only have a specific action on a specific resource once
  By creating the role_permissions table, you can seed your database with rules like this:
  Role: engineer | Resource: work_orders | Action: create
  Role: user | Resource: assets | Action: read
  Role: scientist | Resource: pm_tasks | Action: update
  When a user tries to do something in the app, your server function will check: "Does the user's role have the corresponding record in role_permissions?"*/

  role: text('role', { enum: ['admin', 'engineer', 'scientist', 'user'] }).notNull(),
  resource: text('resource').notNull(), // e.g., 'assets', 'work_orders', 'pm_tasks'
  action: text('action').notNull(),     // e.g., 'create', 'read', 'update', 'delete'
}, (t) => ({
  pk: primaryKey({ columns: [t.role, t.resource, t.action] }),
}));

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(), // 'credential' or 'microsoft'
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

// --- C. SYNC ARCHITECTURE ---
export const syncState = sqliteTable('sync_state', {
  tableName: text('table_name').primaryKey(),
  lastModified: integer('last_modified', { mode: 'timestamp' }).notNull(),
});

// --- D. CORE DOMAIN: LOOKUPS ---
export const sites = sqliteTable('sites', {
  id: integer('site_id').primaryKey({ autoIncrement: true }),
  name: text('site_name').notNull().unique(), // [cite: 15]
  ...commonCols,
});

export const systems = sqliteTable('systems', {
  id: integer('system_id').primaryKey({ autoIncrement: true }),
  name: text('system_name').notNull().unique(), // [cite: 18]
  ...commonCols,
});

export const engineers = sqliteTable('engineers', {
  id: integer('engineer_id').primaryKey({ autoIncrement: true }),
  firstName: text('first_name').notNull(), // [cite: 17]
  lastName: text('last_name').notNull(),
  userId: text('user_id').references(() => user.id), // Link to Auth User
  ...commonCols,
});

// --- E. CORE DOMAIN: ASSETS ---
export const assetInfo = sqliteTable('asset_info', {
  id: integer('info_id').primaryKey({ autoIncrement: true }),
  magnetronDate: integer('magnetron_date', { mode: 'timestamp' }), // [cite: 19]
  thyratronDate: integer('thyratron_date', { mode: 'timestamp' }),
  htHours: real('ht_hours'),
  daysSinceBreakdown: integer('days_since_breakdown').default(0),
  ...commonCols,
});

export const assets = sqliteTable('assets', {
  id: integer('asset_id').primaryKey({ autoIncrement: true }),
  serialNumber: text('serial_number').notNull().unique(), // [cite: 20]
  modelName: text('model_name'),
  warrantyYears: integer('warranty_years'),
  catDate: integer('cat_date', { mode: 'timestamp' }), // Customer Acceptance [cite: 7]
  installationDate: integer('installation_date', { mode: 'timestamp' }),
  status: text('status').notNull().default('Operational'),

  siteId: integer('site_id').references(() => sites.id),
  infoId: integer('info_id').references(() => assetInfo.id),
  ...commonCols,
});

// Many-to-Many: Assets <-> Systems [cite: 21]
export const assetSystems = sqliteTable('asset_systems', {
  assetId: integer('asset_id').references(() => assets.id),
  systemId: integer('system_id').references(() => systems.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.assetId, t.systemId] }),
}));

// --- F. PREVENTIVE MAINTENANCE (PM) ---
export const pmTasks = sqliteTable('pm_tasks', {
  id: integer('task_id').primaryKey({ autoIncrement: true }),
  systemId: integer('system_id').references(() => systems.id),
  instruction: text('instruction').notNull(),
  docSection: text('doc_section'), // Manual Reference [cite: 11]
  intervalMonths: integer('interval_months').notNull(),
  ...commonCols,
});

export const assetPm = sqliteTable('asset_pm', {
  id: integer('pm_instance_id').primaryKey({ autoIncrement: true }),
  assetId: integer('asset_id').references(() => assets.id),
  engineerId: integer('engineer_id').references(() => engineers.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  ...commonCols,
});

export const assetPmResults = sqliteTable('asset_pm_results', {
  id: integer('result_id').primaryKey({ autoIncrement: true }),
  pmInstanceId: integer('pm_instance_id').references(() => assetPm.id),
  taskId: integer('task_id').references(() => pmTasks.id),
  status: text('status').notNull(), // 'Pass', 'Fail', 'N/A' [cite: 24]
  findings: text('findings'),
  ...commonCols,
});

// --- G. CORRECTIVE MAINTENANCE ---
export const userRequests = sqliteTable('user_requests', {
  id: integer('request_id').primaryKey({ autoIncrement: true }),
  assetId: integer('asset_id').references(() => assets.id),
  systemId: integer('system_id').references(() => systems.id),
  reportedBy: text('reported_by').notNull(), // Clinical staff name [cite: 25]
  commentText: text('comment_text').notNull(),
  status: text('status').notNull().default('Open'),
  engineerId: integer('engineer_id').references(() => engineers.id), // Null implies "not assigned"
  ...commonCols,
});

export const workOrders = sqliteTable('work_orders', {
  id: integer('wo_id').primaryKey({ autoIncrement: true }),
  assetId: integer('asset_id').references(() => assets.id),
  description: text('description_of_fault').notNull(), // [cite: 26]
  startAt: integer('start_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  endAt: integer('end_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('Open'),
  ...commonCols,
});

// Link Requests to Work Orders [cite: 27]
export const workOrderRequests = sqliteTable('work_order_requests', {
  woId: integer('wo_id').references(() => workOrders.id),
  requestId: integer('request_id').references(() => userRequests.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.woId, t.requestId] }),
}));