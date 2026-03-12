import type { FrameData, FrameMeta } from '@/lib/types';

export interface RunAdapter {
	openRunFolder(): Promise<void>;
	listFrames(): Promise<FrameMeta[]>;
	loadFrame(frameId: string): Promise<FrameData>;

	saveReviewedFrame(frame: FrameData): Promise<void>;
	exportLabelsTxt(): Promise<{ outDir: string; numFrames: number; numBoxes: number }>;
}
