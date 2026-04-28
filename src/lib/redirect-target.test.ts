import { describe, expect, it } from 'vitest'
import {
    buildRedirectTargetFromLocation,
    resolveSafeRedirectTarget,
} from './redirect-target'

describe('resolveSafeRedirectTarget', () => {
    it('keeps valid internal paths with query', () => {
        expect(resolveSafeRedirectTarget('/?assetId=1')).toBe('/?assetId=1')
    })

    it('rejects external urls', () => {
        expect(resolveSafeRedirectTarget('https://evil.example/')).toBe('/')
    })

    it('rejects protocol-relative urls', () => {
        expect(resolveSafeRedirectTarget('//evil.example/path')).toBe('/')
    })

    it('rejects login route targets to avoid loops', () => {
        expect(resolveSafeRedirectTarget('/login?redirect=/%3FassetId%3D1')).toBe('/')
    })

    it('falls back on empty values', () => {
        expect(resolveSafeRedirectTarget('')).toBe('/')
    })
})

describe('buildRedirectTargetFromLocation', () => {
    it('prefers href when available', () => {
        expect(
            buildRedirectTargetFromLocation({
                href: '/work-orders?status=Open',
                pathname: '/ignored',
            }),
        ).toBe('/work-orders?status=Open')
    })

    it('builds from pathname and search when href is missing', () => {
        expect(
            buildRedirectTargetFromLocation({
                pathname: '/',
                searchStr: '?assetId=9',
            }),
        ).toBe('/?assetId=9')
    })
})