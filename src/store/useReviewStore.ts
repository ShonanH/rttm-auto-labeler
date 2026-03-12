import { create } from 'zustand';
import type { FrameData, FrameMeta, Instance, ClassName } from '@/lib/types';

type State = {
	frames: FrameMeta[];
	currentFrameId: string | null;
	currentFrame: FrameData | null;

	// In-memory edits (no disk yet)
	setFrames: (frames: FrameMeta[]) => void;
	setCurrentFrame: (frame: FrameData) => void;
	setCurrentFrameId: (id: string) => void;

	toggleKept: (instanceId: string) => void;
	relabel: (instanceId: string, className: ClassName) => void;
};

export const useReviewStore = create<State>((set, get) => ({
	frames: [],
	currentFrameId: null,
	currentFrame: null,

	setFrames: (frames) => set({ frames }),
	setCurrentFrameId: (id) => set({ currentFrameId: id }),
	setCurrentFrame: (frame) => set({ currentFrame: frame, currentFrameId: frame.frameId }),

	toggleKept: (instanceId) => {
		const cf = get().currentFrame;
		if (!cf) return;
		const instances = cf.instances.map((it) => (it.id === instanceId ? { ...it, kept: !it.kept } : it));
		set({ currentFrame: { ...cf, instances } });
	},

	relabel: (instanceId, className) => {
		const cf = get().currentFrame;
		if (!cf) return;
		const instances = cf.instances.map((it) => (it.id === instanceId ? { ...it, className } : it));
		set({ currentFrame: { ...cf, instances } });
	},
}));
