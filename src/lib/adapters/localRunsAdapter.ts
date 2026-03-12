import type { RunAdapter } from './runAdapter';
import type { FrameData, FrameMeta, Instance, ClassName } from '@/lib/types';

type AnyJson = Record<string, unknown>;

type RawInstance = {
	id?: string | number;
	kept?: boolean;
	class?: string;
	className?: string;
	label?: string;
	num_points?: number;
	numPoints?: number;
	score?: number;
	box_3d?: number[];
	box3d?: number[];
	box?: number[];
};

type RawFrameMeta = {
	frame_id?: string | number;
	frameId?: string | number;
	id?: string | number;
	timestamp?: number;
	time?: number;
	t?: number;
};

// entries/keys/values are defined in the WICG spec but absent from lib.dom.d.ts
declare global {
	interface FileSystemDirectoryHandle {
		entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
		keys(): AsyncIterableIterator<string>;
		values(): AsyncIterableIterator<FileSystemHandle>;
	}
}

const DEFAULT_INSTANCES_DIR = 'step1_6_results';

// ---------- helpers ----------
function isClassName(x: string): x is ClassName {
	return ['Sedan', 'SUV', 'Van', 'Truck', 'Bus', 'Cycle', 'Vehicle'].includes(x);
}

function toClassName(x: string): ClassName {
	if (typeof x === 'string' && isClassName(x)) return x;
	// fallbacks
	if (typeof x === 'string') {
		const t = x.toLowerCase();
		if (t === 'cyclist' || t === 'bicycle' || t === 'bike') return 'Cycle';
		if (t === 'car') return 'Vehicle';
	}
	return 'Vehicle';
}

function pad6FromMaybe(frameId: string | number): string {
	const s = String(frameId);
	if (/^\d+$/.test(s)) return s.padStart(6, '0');
	// already like "000123"
	return s;
}

async function readJsonFile(handle: FileSystemFileHandle): Promise<AnyJson> {
	const f = await handle.getFile();
	const txt = await f.text();
	return JSON.parse(txt);
}

async function tryGetFile(dir: FileSystemDirectoryHandle, name: string): Promise<FileSystemFileHandle | null> {
	try {
		return await dir.getFileHandle(name);
	} catch {
		return null;
	}
}

async function tryGetDir(dir: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle | null> {
	try {
		return await dir.getDirectoryHandle(name);
	} catch {
		return null;
	}
}

async function ensureDir(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
	return await parent.getDirectoryHandle(name, { create: true });
}

async function writeTextFile(dir: FileSystemDirectoryHandle, filename: string, text: string): Promise<void> {
	const fh = await dir.getFileHandle(filename, { create: true });
	const w = await fh.createWritable();
	await w.write(text);
	await w.close();
}

async function writeJsonFile(dir: FileSystemDirectoryHandle, filename: string, obj: AnyJson): Promise<void> {
	const text = JSON.stringify(obj, null, 2);
	await writeTextFile(dir, filename, text);
}

function downsamplePointsPacked(pointsNx4: Float32Array, targetN: number): Float32Array {
	const n = Math.floor(pointsNx4.length / 4);
	if (n <= targetN) return pointsNx4;

	// simple random sampling without replacement via stride-ish hash
	const out = new Float32Array(targetN * 4);
	for (let i = 0; i < targetN; i++) {
		const j = Math.floor(Math.random() * n);
		out[i * 4 + 0] = pointsNx4[j * 4 + 0];
		out[i * 4 + 1] = pointsNx4[j * 4 + 1];
		out[i * 4 + 2] = pointsNx4[j * 4 + 2];
		out[i * 4 + 3] = pointsNx4[j * 4 + 3];
	}
	return out;
}

// parse .bin => Float32Array Nx4
async function readBinPoints(fileHandle: FileSystemFileHandle): Promise<Float32Array> {
	const file = await fileHandle.getFile();
	const buf = await file.arrayBuffer();
	return new Float32Array(buf);
}

// instances json => UI instances
function parseInstancesJson(frameId: string, obj: AnyJson): Instance[] {
	const arr: RawInstance[] = Array.isArray(obj.instances) ? (obj.instances as RawInstance[]) : [];
	return arr.map((inst, idx) => {
		const b = inst.box_3d ?? inst.box3d ?? inst.box ?? null;
		const boxArr: number[] = Array.isArray(b) ? b : [];
		const [x, y, z, l, w, h, yaw] = boxArr;

		return {
			id: String(inst.id ?? `${frameId}_${idx}`),
			kept: inst.kept ?? true,
			className: toClassName(inst.class ?? inst.className ?? inst.label ?? ''),
			numPoints: typeof inst.num_points === 'number' ? inst.num_points : inst.numPoints,
			score: typeof inst.score === 'number' ? inst.score : undefined,
			box: {
				x: Number(x ?? 0),
				y: Number(y ?? 0),
				z: Number(z ?? 0),
				l: Number(l ?? 1),
				w: Number(w ?? 1),
				h: Number(h ?? 1),
				yaw: Number(yaw ?? 0),
			},
		};
	});
}

// ---------- adapter ----------
export class LocalRunsAdapter implements RunAdapter {
	private runDir: FileSystemDirectoryHandle | null = null;

	private framesDir: FileSystemDirectoryHandle | null = null;
	private pointsDir: FileSystemDirectoryHandle | null = null;

	private frameIndexFile: FileSystemFileHandle | null = null;

	private instancesDirName = DEFAULT_INSTANCES_DIR;
	private instancesDir: FileSystemDirectoryHandle | null = null;

	// tuneables
	private pointSampleN = 60000;

	private reviewedDir: FileSystemDirectoryHandle | null = null;
	private reviewedDirName = 'instances_reviewed';
	private exportDirName = 'labels_txt_reviewed';

	async openRunFolder(): Promise<void> {
		const picked = await (window as unknown as { showDirectoryPicker(): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
		// User may pick:
		//  A) the run folder itself: contains frame_index.json
		//  B) the parent folder that contains _LATEST_RUN.json + run_*
		const runDir = await this.resolveRunDirectory(picked);

		// validate expected structure
		const frameIndex = await tryGetFile(runDir, 'frame_index.json');
		if (!frameIndex) throw new Error('Selected folder is missing frame_index.json');

		const frames = await tryGetDir(runDir, 'frames');
		if (!frames) throw new Error('Selected run folder is missing /frames');

		const pointsParent = await tryGetDir(frames, 'points');
		if (!pointsParent) throw new Error('Selected run folder is missing /frames/points');

		// instances dir
		const instancesDir = await tryGetDir(runDir, this.instancesDirName);
		if (!instancesDir) {
			// If default not found, try to auto-pick the newest-looking instances_classified_pts_clamped_v*
			const auto = await this.findBestInstancesDir(runDir);
			if (!auto) {
				throw new Error(`Could not find instances folder (${this.instancesDirName}) and no fallback instances_* found`);
			}
			this.instancesDirName = auto;
		}

		this.runDir = runDir;
		this.framesDir = frames;
		this.pointsDir = pointsParent;
		this.frameIndexFile = frameIndex;
		this.instancesDir = (await tryGetDir(runDir, this.instancesDirName))!; // now exists

		// review/instances_reviewed (create if missing)
		const reviewDir = await ensureDir(runDir, 'review');
		this.reviewedDir = await ensureDir(reviewDir, this.reviewedDirName);

		// exports/labels_txt_reviewed (create lazily on export, but ensure exports exists)
		await ensureDir(runDir, 'exports');
	}

	async listFrames(): Promise<FrameMeta[]> {
		if (!this.frameIndexFile) throw new Error('Run not opened');

		const obj = await readJsonFile(this.frameIndexFile);

		// Your frame_index.json historically has been a list; sometimes it’s an object with "frames"
		const root: unknown = obj;
		const items: RawFrameMeta[] = Array.isArray(root) ? (root as RawFrameMeta[]) : Array.isArray(obj.frames) ? (obj.frames as RawFrameMeta[]) : [];

		const frames: FrameMeta[] = items.map((it, idx) => {
			const fidRaw = it.frame_id ?? it.frameId ?? it.id ?? idx;
			const frameId = pad6FromMaybe(fidRaw);
			const ts = it.timestamp ?? it.time ?? it.t ?? undefined;
			return { frameId, timestamp: typeof ts === 'number' ? ts : undefined };
		});

		// If frame_index.json is empty or unknown structure, fallback to listing points/*.bin
		if (frames.length === 0 && this.pointsDir) {
			const out: FrameMeta[] = [];
			for await (const [name, handle] of this.pointsDir.entries()) {
				if (handle.kind === 'file' && name.endsWith('.bin')) {
					out.push({ frameId: name.replace('.bin', '') });
				}
			}
			out.sort((a, b) => a.frameId.localeCompare(b.frameId));
			return out;
		}

		return frames;
	}

	async loadFrame(frameId: string): Promise<FrameData> {
		if (!this.pointsDir || !this.instancesDir) throw new Error('Run not opened');

		// points
		const binHandle = await this.pointsDir.getFileHandle(`${frameId}.bin`);
		const pointsAll = await readBinPoints(binHandle);

		// instances: prefer reviewed if present, else source instancesDir
		let instObj: AnyJson | null = null;

		// try reviewed
		if (this.reviewedDir) {
			const reviewedHandle = await tryGetFile(this.reviewedDir, `instances_${frameId}.json`);
			if (reviewedHandle) instObj = await readJsonFile(reviewedHandle);
		}

		// fallback to source
		if (!instObj) {
			const instHandle = await this.instancesDir.getFileHandle(`instances_${frameId}.json`);
			instObj = await readJsonFile(instHandle);
		}

		const instances = parseInstancesJson(frameId, instObj);

		// downsample for web perf
		const points = downsamplePointsPacked(pointsAll, this.pointSampleN);

		return { frameId, points, instances };
	}

	async saveReviewedFrame(frame: FrameData): Promise<void> {
		if (!this.runDir || !this.reviewedDir) throw new Error('Run not opened');

		// Only keep boxes marked kept=true
		const kept = frame.instances.filter((x) => x.kept);

		// Write in your existing per-frame schema
		const out = {
			frame_id: frame.frameId,
			source_instances_dir: this.instancesDirName,
			saved_at: new Date().toISOString(),
			instances: kept.map((it) => ({
				id: it.id,
				class: it.className,
				kept: true,
				num_points: it.numPoints ?? null,
				score: it.score ?? null,
				box_3d: [it.box.x, it.box.y, it.box.z, it.box.l, it.box.w, it.box.h, it.box.yaw],
			})),
		};

		await writeJsonFile(this.reviewedDir, `instances_${frame.frameId}.json`, out);
	}

	async exportLabelsTxt(): Promise<{ outDir: string; numFrames: number; numBoxes: number }> {
		if (!this.runDir) throw new Error('Run not opened');

		const frames = await this.listFrames();
		const exportsDir = await ensureDir(this.runDir, 'exports');
		const outDir = await ensureDir(exportsDir, this.exportDirName);

		let numBoxes = 0;
		let numFrames = 0;

		for (const fm of frames) {
			const frameId = fm.frameId;

			// load reviewed if exists; otherwise skip (or export source—your choice)
			let instObj: AnyJson | null = null;

			if (this.reviewedDir) {
				const reviewedHandle = await tryGetFile(this.reviewedDir, `instances_${frameId}.json`);
				if (reviewedHandle) instObj = await readJsonFile(reviewedHandle);
			}

			// If you want export ONLY reviewed frames:
			if (!instObj) continue;

			const instances = parseInstancesJson(frameId, instObj).filter((x) => x.kept);

			// Write .txt lines: <class> <x> <y> <z> <l> <w> <h> <yaw>
			const lines = instances.map((it) => {
				const b = it.box;
				const vals = [b.x, b.y, b.z, b.l, b.w, b.h, b.yaw].map((v) => Number(v).toFixed(6));
				return `${it.className} ${vals.join(' ')}`;
			});

			await writeTextFile(outDir, `${frameId}.txt`, lines.join('\n') + (lines.length ? '\n' : ''));

			numBoxes += instances.length;
			numFrames += 1;
		}

		return { outDir: `exports/${this.exportDirName}`, numFrames, numBoxes };
	}

	// ---------- internal resolution ----------
	private async resolveRunDirectory(picked: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
		// If picked folder already looks like a run folder, use it
		const frameIndex = await tryGetFile(picked, 'frame_index.json');
		if (frameIndex) return picked;

		// Otherwise, if it has _LATEST_RUN.json, use that pointer
		const latest = await tryGetFile(picked, '_LATEST_RUN.json');
		if (latest) {
			const obj = await readJsonFile(latest);
			// common patterns: { "run_id": "run_..." } or { "latest": "run_..." } or { "path": "run_..." }
			const runName = obj.run_id ?? obj.latest ?? obj.latest_run ?? obj.path ?? obj.run ?? obj.name ?? null;

			if (typeof runName === 'string') {
				const maybe = await tryGetDir(picked, runName);
				if (maybe) return maybe;
			}
		}

		// If no pointer, try to pick the first run_* dir
		for await (const [name, handle] of picked.entries()) {
			if (handle.kind === 'directory' && name.startsWith('run_')) {
				return handle as FileSystemDirectoryHandle;
			}
		}

		throw new Error('Please select a run folder (contains frame_index.json) or the parent folder containing _LATEST_RUN.json / run_*');
	}

	private async findBestInstancesDir(runDir: FileSystemDirectoryHandle): Promise<string | null> {
		// Prefer step1_6_results then highest v*
		let best: { name: string; v: number } | null = null;

		for await (const [name, handle] of runDir.entries()) {
			if (handle.kind !== 'directory') continue;
			if (!name.startsWith('step1_6_results')) continue;
			const m = name.match(/_v(\d+)$/);
			const v = m ? Number(m[1]) : 0;
			if (!best || v > best.v) best = { name, v };
		}

		if (best) return best.name;

		// fallback: any instances_* directory that contains instances_index.json
		for await (const [name, handle] of runDir.entries()) {
			if (handle.kind !== 'directory') continue;
			if (!name.startsWith('instances_')) continue;
			const d = handle as FileSystemDirectoryHandle;
			const idx = await tryGetFile(d, 'instances_index.json');
			if (idx) return name;
		}

		return null;
	}
}
