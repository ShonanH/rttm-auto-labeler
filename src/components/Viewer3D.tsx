'use client';

import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import type { FrameData, Box3D } from '@/lib/types';
import { useMemo, useEffect } from 'react';
import { OrbitControls, Stats, Bounds, useBounds, Text, Billboard } from '@react-three/drei';

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

function WireBox({ box, visible, color, label }: { box: Box3D; visible: boolean; color: string; label: string }) {
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

	// Label position: slightly above top face center
	const labelPos: [number, number, number] = [box.x, box.y, box.z + box.h / 2 + 0.2];

	return (
		<group>
			<lineSegments geometry={geom}>
				<lineBasicMaterial color={color} linewidth={1} />
			</lineSegments>
			<Billboard follow position={[box.x, box.y, box.z + box.h / 2 + 0.4]}>
				<Text frustumCulled={false} fontSize={0.8} color={color} anchorX='center' anchorY='middle' material-depthTest={false} material-depthWrite={false} renderOrder={999} outlineWidth={0.03} outlineColor='#ffffff'>
					{label}
				</Text>
			</Billboard>
		</group>
	);
}

export function Viewer3D({ frame }: { frame: FrameData | null }) {
	return (
		<Canvas style={{ width: '100%', height: '100%', background: '#ffffff' }} onCreated={({ gl }) => gl.setClearColor('#ffffff', 1)} camera={{ position: [0, -40, 20], fov: 55 }}>
			<ambientLight intensity={1.0} />
			<directionalLight position={[10, -10, 20]} intensity={0.8} />

			{/* Optional: light grid for white canvas */}
			{/* <gridHelper args={[120, 120]} /> */}

			<OrbitControls makeDefault />
			<Stats />

			<Bounds fit clip margin={1.2}>
				<FitOnFrameChange frameId={frame?.frameId ?? null} />

				{frame?.points && <PointsCloud points={frame.points} />}
				{frame?.instances?.map((it) => (
					<WireBox key={it.id} box={it.box} visible={it.kept} color={CLASS_COLORS[it.className] ?? '#111827'} label={`${it.id}: ${it.className}`} />
				))}
			</Bounds>
		</Canvas>
	);
}
