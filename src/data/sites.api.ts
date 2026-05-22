// Domain-aligned facade for site administration server functions.
// Implementation lives in assets.api.ts (shared DB/permission helpers).
export {
    createSiteAdmin,
    updateSiteAdmin,
    deleteSiteAdmin,
    type SiteAdminRow,
} from './assets.api'
