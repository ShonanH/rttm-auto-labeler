'use client';

import { useMemo, useState } from 'react';
import { useReviewStore } from '@/store/useReviewStore';

export function FrameList({ onSelect }: { onSelect: (frameId: string) => void }) {
	const { frames, currentFrameId } = useReviewStore();
	const [q, setQ] = useState('');

	const filtered = useMemo(() => {
		const qq = q.trim();
		if (!qq) return frames;
		return frames.filter((f) => f.frameId.includes(qq));
	}, [frames, q]);

	return (
		<div className='h-full flex flex-col'>
			<div className='p-3 border-b border-neutral-800'>
				<div className='text-sm font-medium mb-2'>Frames</div>
				<input className='w-full px-3 py-2 rounded-md bg-neutral-900 border border-neutral-800 text-sm outline-none' placeholder='Search frame id (e.g., 000123)' value={q} onChange={(e) => setQ(e.target.value)} />
				<div className='mt-2 text-xs text-neutral-400'>{filtered.length} frames</div>
			</div>

			<div className='flex-1 overflow-auto'>
				{filtered.map((f) => {
					const active = f.frameId === currentFrameId;
					return (
						<button key={f.frameId} onClick={() => onSelect(f.frameId)} className={['w-full text-left px-3 py-2 border-b border-neutral-900 hover:bg-neutral-900', active ? 'bg-neutral-900' : ''].join(' ')}>
							<div className='text-sm'>{f.frameId}</div>
							{typeof f.timestamp === 'number' && <div className='text-xs text-neutral-500'>t={f.timestamp.toFixed(2)}</div>}
						</button>
					);
				})}
			</div>
		</div>
	);
}
