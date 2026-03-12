import type { FrameData, FrameMeta, Instance, ClassName } from '@/lib/types';
import type { RunAdapter } from './runAdapter';

function pad6(n: number) {
	return String(n).padStart(6, '0');
}

function rand(min: number, max: number) {
	return min + Math.random() * (max - min);
}

function makePoints(n = 60000): Float32Array {
	const arr = new Float32Array(n * 4);
	for (let i = 0; i < n; i++) {
		// simple ground-ish cloud with a few blobs
		const x = rand(-30, 55);
		const y = rand(-35, 35);
		const z = rand(-1.5, 2.5) * (Math.random() < 0.8 ? 0.2 : 1.0);
		const intensity = rand(0, 1);
		const o = i * 4;
		arr[o + 0] = x;
		arr[o + 1] = y;
		arr[o + 2] = z;
		arr[o + 3] = intensity;
	}
	return arr;
}

function makeInstances(frameId: string, k = 10): Instance[] {
	const classes: ClassName[] = ['Sedan', 'SUV', 'Van', 'Truck', 'Bus', 'Cycle', 'Vehicle'];
	const out: Instance[] = [];
	for (let i = 0; i < k; i++) {
		const className = classes[Math.floor(Math.random() * classes.length)];
		out.push({
			id: `${frameId}_${i}`,
			className,
			kept: true,
			numPoints: Math.floor(rand(40, 900)),
			score: 1.0,
			box: {
				x: rand(-10, 45),
				y: rand(-20, 20),
				z: rand(0.2, 1.2),
				l: rand(1.5, 6.2),
				w: rand(0.8, 2.6),
				h: rand(1.0, 2.6),
				yaw: rand(-Math.PI, Math.PI),
			},
		});
	}
	return out;
}

export class MockRunAdapter implements RunAdapter {
	private frames: FrameMeta[];

	constructor(numFrames = 80) {
		this.frames = Array.from({ length: numFrames }).map((_, i) => ({
			frameId: pad6(i),
			timestamp: 1700000000 + i * 0.1,
		}));
	}

	async openRunFolder(): Promise<void> {
		// placeholder: later use showDirectoryPicker()
		return;
	}

	async listFrames(): Promise<FrameMeta[]> {
		return this.frames;
	}

	async loadFrame(frameId: string): Promise<FrameData> {
		return {
			frameId,
			points: makePoints(70000),
			instances: makeInstances(frameId, Math.floor(rand(7, 15))),
		};
	}
}
