export type ClassName = 'Sedan' | 'SUV' | 'Van' | 'Truck' | 'Bus' | 'Cycle' | 'Vehicle';

export type Box3D = {
	// Center + dims + yaw (radians)
	x: number;
	y: number;
	z: number;
	l: number;
	w: number;
	h: number;
	yaw: number;
};

export type Instance = {
	id: string; // stable identity (frameId_idx in MVP)
	className: ClassName;
	box: Box3D;
	numPoints?: number;
	score?: number;
	kept: boolean; // in-memory edit state for now
};

export type FrameMeta = {
	frameId: string; // "000123"
	timestamp?: number;
};

export type FrameData = {
	frameId: string;
	// Downsampled points for rendering: Nx4 [x,y,z,i]
	points: Float32Array; // packed Nx4
	instances: Instance[];
};
