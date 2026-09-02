import type { ManagedSpace } from '../../space-types';

export function publicSpaceUrl(space: ManagedSpace, view: 'month' | 'week' = 'month'): string {
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
    const url = new URL(`${basePath}/${encodeURIComponent(space.slug)}`, window.location.origin);
    if (view === 'week') url.searchParams.set('view', view);
    return url.toString();
}

export async function shareSpaceAvailability(space: ManagedSpace): Promise<void> {
    const url = publicSpaceUrl(space);
    if (navigator.share) {
        await navigator.share({ title: space.name, url });
        return;
    }
    await navigator.clipboard.writeText(url);
}
