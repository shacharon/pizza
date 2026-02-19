import type { Vendor } from '../models/vendor';

export function trackByVendorId(_: number, v: Vendor): string {
    return v.id || `${v.name}-${v.address || ''}`;
}


