// Domain-aligned facade for asset-system link administration server functions.
// Implementation lives in assets.api.ts (shared DB/permission helpers).
export {
    createAssetSystemLinkAdmin,
    updateAssetSystemLinkAdmin,
    deleteAssetSystemEntryAdmin,
    deleteAssetSystemLinkAdmin,
    type AssetSystemLinkRow,
} from './assets.api'
