'use client';

import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import type { FrameData, Box3D } from '@/lib/types';
import { useMemo, useEffect, useState } from 'react';
import { OrbitControls, Stats, Bounds, useBounds, Text, Billboard } from '@react-three/drei';
import { useReviewStore } from '@/store/useReviewStore';

const CLASS_COLORS: Record<string, string> = {
	Sedan: '#2563eb',
	SUV: '#16a34a',
	Van: '#f59e0b',
	Truck: '#dc2626',
	Bus: '#7c3aed',
	Cycle: '#0ea5e9',
	Vehicle: '#111827',
	Unknown: '#6b7280',
};

const DEFAULT_ROI = {
	xMin: -46.716694,
	xMax: 24.280104,
	yMin: -35.653854,
	yMax: 14.18241987,
	zMin: -2.7757624,
	zMax: 3.57883,
} as const;

function FitOnFrameChange({ frameId }: { frameId: string | null }) {
	const api = useBounds();
	useEffect(() => {
		if (!frameId) return;
		// refresh the bounds based on current children, then fit once
		api.refresh().fit();
	}, [frameId, api]);
	return null;
}

function PointsCloud({ points }: { points: Float32Array }) {
	const geom = useMemo(() => {
		const g = new THREE.BufferGeometry();
		const n = Math.floor(points.length / 4);
		const positions = new Float32Array(n * 3);
		for (let i = 0; i < n; i++) {
			positions[i * 3 + 0] = points[i * 4 + 0];
			positions[i * 3 + 1] = points[i * 4 + 1];
			positions[i * 3 + 2] = points[i * 4 + 2];
		}
		g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		return g;
	}, [points]);

	return (
		<points geometry={geom}>
			<pointsMaterial size={0.05} color='#111827' />
		</points>
	);
}

function boxCorners(box: Box3D): THREE.Vector3[] {
	// box centered at (x,y,z), dims (l,w,h), yaw about z
	const { x, y, z, l, w, h, yaw } = box;
	const hl = l / 2;
	const hw = w / 2;
	const hh = h / 2;

	const c = Math.cos(yaw);
	const s = Math.sin(yaw);

	const local = [
		[-hl, -hw, -hh],
		[-hl, +hw, -hh],
		[+hl, +hw, -hh],
		[+hl, -hw, -hh],
		[-hl, -hw, +hh],
		[-hl, +hw, +hh],
		[+hl, +hw, +hh],
		[+hl, -hw, +hh],
	];

	return local.map(([lx, ly, lz]) => {
		const rx = lx * c - ly * s;
		const ry = lx * s + ly * c;
		return new THREE.Vector3(x + rx, y + ry, z + lz);
	});
}

function WireBox({ box, visible, color, label, selected }: { box: Box3D; visible: boolean; color: string; label: string; selected: boolean }) {
	const geom = useMemo(() => {
		const corners = boxCorners(box);
		const idxPairs = [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 0], // bottom
			[4, 5],
			[5, 6],
			[6, 7],
			[7, 4], // top
			[0, 4],
			[1, 5],
			[2, 6],
			[3, 7], // verticals
		];

		const positions = new Float32Array(idxPairs.length * 2 * 3);
		let p = 0;
		for (const [a, b] of idxPairs) {
			const va = corners[a];
			const vb = corners[b];
			positions[p++] = va.x;
			positions[p++] = va.y;
			positions[p++] = va.z;
			positions[p++] = vb.x;
			positions[p++] = vb.y;
			positions[p++] = vb.z;
		}

		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		return g;
	}, [box]);

	if (!visible) return null;

	const drawColor = selected ? '#ff006e' : color;

	// Label position: slightly above top face center
	const labelPos: [number, number, number] = [box.x, box.y, box.z + box.h / 2 + 0.2];

	return (
		<group>
			<lineSegments geometry={geom} renderOrder={selected ? 100 : 0}>
				<lineBasicMaterial color={drawColor} />
			</lineSegments>

			{/* label */}
			<Billboard follow position={[box.x, box.y, box.z + box.h / 2 + 0.4]}>
				<Text
					frustumCulled={false}
					fontSize={0.8}
					color={drawColor}
					//  depthTest={false}
					material-depthTest={false}
					material-depthWrite={false}
					renderOrder={999}
					outlineWidth={0.03}
					outlineColor='#000000'
				>
					{label}
				</Text>
			</Billboard>
		</group>
	);
}

function cropPointsROI(pointsNx4: Float32Array, roi: typeof DEFAULT_ROI): Float32Array {
	const n = Math.floor(pointsNx4.length / 4);
	// First pass: count
	let keep = 0;
	for (let i = 0; i < n; i++) {
		const x = pointsNx4[i * 4 + 0];
		const y = pointsNx4[i * 4 + 1];
		const z = pointsNx4[i * 4 + 2];
		if (x >= roi.xMin && x <= roi.xMax && y >= roi.yMin && y <= roi.yMax && z >= roi.zMin && z <= roi.zMax) keep++;
	}
	const out = new Float32Array(keep * 4);
	let j = 0;
	for (let i = 0; i < n; i++) {
		const x = pointsNx4[i * 4 + 0];
		const y = pointsNx4[i * 4 + 1];
		const z = pointsNx4[i * 4 + 2];
		const inten = pointsNx4[i * 4 + 3];
		if (x >= roi.xMin && x <= roi.xMax && y >= roi.yMin && y <= roi.yMax && z >= roi.zMin && z <= roi.zMax) {
			out[j++] = x;
			out[j++] = y;
			out[j++] = z;
			out[j++] = inten;
		}
	}
	return out;
}

function PickBox({ id, box, onPick }: { id: string; box: Box3D; onPick: (id: string, ev: MouseEvent) => void }) {
	return (
		<mesh
			position={[box.x, box.y, box.z]}
			rotation={[0, 0, box.yaw]}
			onPointerDown={(ev) => {
				ev.stopPropagation();
				onPick(id, ev.nativeEvent as MouseEvent);
			}}
		>
			<boxGeometry args={[box.l, box.w, box.h]} />
			{/* invisible but pickable */}
			<meshBasicMaterial transparent opacity={0} depthWrite={false} />
		</mesh>
	);
}

export function Viewer3D({ frame }: { frame: FrameData | null }) {
	const selectedIds = useReviewStore((s) => s.selectedIds);
	const setSelectedOnly = useReviewStore((s) => s.setSelectedOnly);
	const toggleSelected = useReviewStore((s) => s.toggleSelected);
	const clearSelection = useReviewStore((s) => s.clearSelection);

	function handlePick(id: string, ev: MouseEvent) {
		const multi = ev.shiftKey || ev.ctrlKey || ev.metaKey;
		if (multi) toggleSelected(id);
		else setSelectedOnly(id);
	}

	const [roi] = useState(DEFAULT_ROI);

	const croppedPoints = useMemo(() => {
		if (!frame?.points) return null;
		return cropPointsROI(frame?.points, roi);
	}, [frame?.points, roi]);

	const croppedInstances = useMemo(() => {
		if (!frame?.instances) return [];
		return frame?.instances.filter((it) => {
			const { x, y, z } = it.box;
			return x >= roi.xMin && x <= roi.xMax && y >= roi.yMin && y <= roi.yMax && z >= roi.zMin && z <= roi.zMax;
		});
	}, [frame?.instances, roi]);

	return (
		<Canvas style={{ width: '100%', height: '100%', background: '#ffffff' }} onCreated={({ gl }) => gl.setClearColor('#ffffff', 1)} onPointerMissed={() => clearSelection()} camera={{ position: [0, -40, 20], fov: 55 }}>
			<ambientLight intensity={1.0} />
			<directionalLight position={[10, -10, 20]} intensity={0.8} />

			{/* Optional: light grid for white canvas */}
			{/* <gridHelper args={[120, 120]} /> */}

			<OrbitControls makeDefault />
			<Stats />

			<Bounds fit clip margin={1.2}>
				<FitOnFrameChange frameId={frame?.frameId ?? null} />

				{croppedPoints && <PointsCloud points={croppedPoints} />}
				{croppedInstances.map((it) => {
					const color = CLASS_COLORS[it.className] ?? '#111827';
					const label = `${it.id}: ${it.className}`;
					const selected = selectedIds.has(it.id);

					return (
						<group key={it.id}>
							<WireBox box={it.box} visible={it.kept} color={color} label={label} selected={selected} />
							{/* pick mesh should exist even if kept=false? your choice */}
							{it.kept && <PickBox id={it.id} box={it.box} onPick={handlePick} />}
						</group>
					);
				})}
			</Bounds>
		</Canvas>
	);
}
