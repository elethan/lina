// Domain-aligned facade for system administration server functions.
// Implementation lives in assets.api.ts (shared DB/permission helpers).
export {
    createSystemAdmin,
    updateSystemAdmin,
    createSystemWithLinkAdmin,
    decommissionSystemAdmin,
    type SystemAdminRow,
} from './assets.api'
