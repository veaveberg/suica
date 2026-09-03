import { Check, ChevronDown, Layers } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ManagedSpace } from '../../space-types';
import { cn } from '../../utils/cn';
import { publicAssetUrl } from '../../utils/assets';

export type CalendarSource = { kind: 'groups' } | { kind: 'space'; space: ManagedSpace };

interface Props {
    onChange: (value: string) => void;
    selected: CalendarSource;
    spaces: ManagedSpace[];
}

export function CalendarSourceDropdown({ onChange, selected, spaces }: Props) {
    const { t } = useTranslation();
    const detailsRef = useRef<HTMLDetailsElement>(null);
    useEffect(() => {
        const closeOnOutsideTap = (event: PointerEvent) => {
            if (detailsRef.current?.open && !detailsRef.current.contains(event.target as Node)) detailsRef.current.removeAttribute('open');
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
    const choose = (value: string) => {
        onChange(value);
        detailsRef.current?.removeAttribute('open');
    };

    return <details ref={detailsRef} className="relative">
        <summary className="list-none cursor-pointer rounded-xl py-1.5 active:bg-black/5 dark:active:bg-white/10 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2">
                {selected.kind === 'groups'
                    ? <><Layers className="h-5 w-5 text-ios-blue" /><span className="text-xl font-bold dark:text-white">{t('groups')}</span></>
                    : <img src={publicAssetUrl(selected.space.logoPath)} alt={selected.space.name} className="h-8 w-auto max-w-[148px] object-contain" />}
                <ChevronDown className="h-4 w-4 shrink-0 text-ios-gray" />
            </span>
        </summary>
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <button type="button" onClick={() => choose('groups')} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-gray-100 dark:hover:bg-zinc-800">
                <Layers className="h-5 w-5 text-ios-blue" />
                <span className="flex-1 font-medium dark:text-white">{t('groups')}</span>
                <Check className={cn('h-4 w-4 text-ios-blue', selected.kind !== 'groups' && 'invisible')} />
            </button>
            {spaces.map(space => <button key={space.id} type="button" onClick={() => choose(`space:${space.slug}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-gray-100 dark:hover:bg-zinc-800">
                <span className="flex h-8 w-20 shrink-0 items-center"><img src={publicAssetUrl(space.logoPath)} alt="" className="max-h-8 max-w-20 object-contain" /></span>
                <span className="flex-1 whitespace-nowrap font-medium dark:text-white">{space.name}</span>
                <Check className={cn('h-4 w-4 text-ios-blue', selected.kind !== 'space' || selected.space.id !== space.id ? 'invisible' : '')} />
            </button>)}
        </div>
    </details>;
}
