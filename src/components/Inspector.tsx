'use client';

import type { ClassName } from '@/lib/types';
import { useReviewStore } from '@/store/useReviewStore';

const CLASSES: ClassName[] = ['Sedan', 'SUV', 'Van', 'Truck', 'Bus', 'Cycle', 'Vehicle'];

export function Inspector() {
	const { currentFrame, toggleKept, relabel } = useReviewStore();
	const selectedIds = useReviewStore((s) => s.selectedIds);
	const bulkDeleteSelected = useReviewStore((s) => s.bulkDeleteSelected);

	if (!currentFrame) {
		return <div className='p-4 text-neutral-400'>No frame loaded.</div>;
	}

	const instances = currentFrame.instances.filter((it) => it.kept);

	return (
		<div className='h-full flex flex-col'>
			<div className='p-3 border-b border-neutral-800'>
				<div className='text-sm font-medium'>Boxes</div>
				<div className='text-xs text-neutral-400'>{instances.length} instances</div>
				<div className='mt-2 flex items-center gap-2'>
					<button className='px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-xs disabled:opacity-50' onClick={() => bulkDeleteSelected()} disabled={selectedIds.size === 0} title='Sets kept=false for selected boxes'>
						Delete Selected ({selectedIds.size})
					</button>
				</div>
			</div>

			<div className='flex-1 overflow-auto p-3 space-y-2'>
				{instances.map((it) => (
					<div key={it.id} className='rounded-lg border border-neutral-800 bg-neutral-900 p-3'>
						<div className='flex items-start justify-between gap-2'>
							<div>
								<div className='text-sm font-medium'>{it.id}</div>
								<div className='text-xs text-neutral-400'>
									LWH: {it.box.l.toFixed(2)} / {it.box.w.toFixed(2)} / {it.box.h.toFixed(2)}
								</div>
								{typeof it.numPoints === 'number' && <div className='text-xs text-neutral-500'>pts: {it.numPoints}</div>}
							</div>

							<label className='flex items-center gap-2 text-xs'>
								<input type='checkbox' checked={it.kept} onChange={() => toggleKept(it.id)} />
								keep
							</label>
						</div>

						<div className='mt-2 flex items-center gap-2'>
							<div className='text-xs text-neutral-400 w-12'>Class</div>
							<select className='flex-1 px-2 py-1 rounded-md bg-neutral-950 border border-neutral-800 text-sm' value={it.className} onChange={(e) => relabel(it.id, e.target.value as ClassName)}>
								{CLASSES.map((c) => (
									<option key={c} value={c}>
										{c}
									</option>
								))}
							</select>
						</div>
					</div>
				))}
			</div>

			<div className='p-3 border-t border-neutral-800 text-xs text-neutral-500'>Edits are in-memory only (save/export next).</div>
		</div>
	);
}
