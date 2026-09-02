import { ChevronDown, Copy, FileText, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ManagedSpace } from '../../space-types';
import { publicSpaceUrl } from './spaceLinks';

interface Props {
    onPreparePost: () => void;
    space: ManagedSpace;
}

export function SpaceShareDropdown({ onPreparePost, space }: Props) {
    const { t } = useTranslation();
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const closeOnOutsideTap = (event: PointerEvent) => {
            const target = event.target instanceof Node ? event.target : null;
            if (detailsRef.current?.open && !detailsRef.current.contains(target)) detailsRef.current.removeAttribute('open');
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') detailsRef.current?.removeAttribute('open');
        };
        document.addEventListener('pointerdown', closeOnOutsideTap);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideTap);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, []);

    const preparePost = () => {
        detailsRef.current?.removeAttribute('open');
        onPreparePost();
    };
    const copyPublicLink = async () => {
        try {
            await navigator.clipboard.writeText(publicSpaceUrl(space));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setCopied(false);
        }
    };

    return <details ref={detailsRef} className="relative z-50">
        <summary aria-label={t('space_share_availability')} className="list-none cursor-pointer rounded-xl bg-ios-background p-2 text-ios-blue dark:bg-zinc-800 [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-0.5"><Share2 className="h-4 w-4" /><ChevronDown className="h-3 w-3 text-ios-gray" /></span></summary>
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <button type="button" onClick={preparePost} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-zinc-800 active:bg-ios-background dark:text-white dark:active:bg-zinc-800"><FileText className="h-4 w-4 text-ios-blue" />{t('space_prepare_post')}</button>
            <button type="button" onClick={() => void copyPublicLink()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-zinc-800 active:bg-ios-background dark:text-white dark:active:bg-zinc-800"><Copy className="h-4 w-4 shrink-0 text-ios-blue" />{copied ? t('copied') : t('space_public_availability_link')}</button>
        </div>
    </details>;
}
