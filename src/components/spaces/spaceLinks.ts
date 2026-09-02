import type { ManagedSpace } from '../../space-types';

export function publicSpaceUrl(space: ManagedSpace, view: 'month' | 'week' = 'week'): string {
    const url = new URL(import.meta.env.BASE_URL, window.location.origin);
    url.searchParams.set('space', space.slug);
    url.searchParams.set('view', view);
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
