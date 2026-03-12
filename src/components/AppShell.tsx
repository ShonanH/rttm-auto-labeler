// AppShell.tsx (only showing relevant edits)
'use client';

import { useMemo, useState } from 'react';
import { LocalRunsAdapter } from '@/lib/adapters/localRunsAdapter';
import type { RunAdapter } from '@/lib/adapters/runAdapter';
import { useReviewStore } from '@/store/useReviewStore';
import { FrameList } from './FrameList';
import { Viewer3D } from './Viewer3D';
import { Inspector } from './Inspector';

export function AppShell() {
	const adapter: RunAdapter = useMemo(() => new LocalRunsAdapter(), []);
	const { frames, currentFrameId, currentFrame, setFrames, setCurrentFrame, setCurrentFrameId } = useReviewStore();

	const [isLoading, setIsLoading] = useState(false);
	const [runOpened, setRunOpened] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	async function openRun() {
		try {
			setErr(null);
			setIsLoading(true);
			await adapter.openRunFolder();
			const list = await adapter.listFrames();
			setFrames(list);
			setRunOpened(true);

			if (list.length > 0) {
				const first = await adapter.loadFrame(list[0].frameId);
				setCurrentFrame(first);
			}
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : String(e));
			setRunOpened(false);
		} finally {
			setIsLoading(false);
		}
	}

	async function loadFrame(frameId: string) {
		setIsLoading(true);
		setCurrentFrameId(frameId);
		const frame = await adapter.loadFrame(frameId);
		setCurrentFrame(frame);
		setIsLoading(false);
	}

	async function prevNext(delta: number) {
		if (!currentFrameId) return;
		const idx = frames.findIndex((f) => f.frameId === currentFrameId);
		if (idx < 0) return;
		const nextIdx = Math.min(frames.length - 1, Math.max(0, idx + delta));
		await loadFrame(frames[nextIdx].frameId);
	}

	async function saveFrame() {
		if (!currentFrame) return;
		try {
			setErr(null);
			setIsLoading(true);
			await adapter.saveReviewedFrame(currentFrame);
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : String(e));
		} finally {
			setIsLoading(false);
		}
	}

	async function finishExport() {
		try {
			setErr(null);
			setIsLoading(true);
			const res = await adapter.exportLabelsTxt();
			// simple UI feedback
			alert(`Exported ${res.numBoxes} boxes across ${res.numFrames} frames to ${res.outDir}`);
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : String(e));
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className='h-dvh w-dvw overflow-hidden bg-neutral-950 text-neutral-100'>
			<div className='h-14 px-4 flex items-center justify-between border-b border-neutral-800'>
				<div className='flex items-center gap-3'>
					<div className='font-semibold'>RTTM Label Review</div>
					<div className='text-xs text-neutral-400'>{currentFrameId ? `Frame ${currentFrameId}` : 'No frame loaded'}</div>
					{isLoading && <div className='text-xs text-neutral-300'>Loading…</div>}
					{err && <div className='text-xs text-red-400'>Error: {err}</div>}
				</div>

				<div className='flex items-center gap-2'>
					<button className='px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm' onClick={() => void openRun()}>
						Open Run Folder
					</button>

					<button className='px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm' onClick={() => void prevNext(-1)} disabled={!runOpened || !currentFrameId}>
						Prev
					</button>
					<button className='px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm' onClick={() => void prevNext(1)} disabled={!runOpened || !currentFrameId}>
						Next
					</button>

					<button className='px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-sm disabled:opacity-50' onClick={() => void saveFrame()} disabled={!runOpened || !currentFrame || isLoading}>
						Save Frame
					</button>

					<button className='px-3 py-1.5 rounded-md bg-indigo-700 hover:bg-indigo-600 text-sm disabled:opacity-50' onClick={() => void finishExport()} disabled={!runOpened || isLoading}>
						Finish / Export
					</button>
				</div>
			</div>

			<div className='h-[calc(100dvh-3.5rem)] overflow-hidden grid grid-cols-[320px_1fr_360px]'>
				<div className='border-r border-neutral-800 h-full overflow-hidden'>
					<FrameList onSelect={(id) => void loadFrame(id)} />
				</div>
				<div className='relative h-full overflow-hidden'>
					<Viewer3D frame={currentFrame} />
					{!currentFrame && <div className='absolute inset-0 flex items-center justify-center text-neutral-400'>{runOpened ? 'Select a frame' : 'Open a run folder to begin'}</div>}
				</div>
				<div className='border-l border-neutral-800 h-full overflow-hidden'>
					<Inspector />
				</div>
			</div>
		</div>
	);
}
