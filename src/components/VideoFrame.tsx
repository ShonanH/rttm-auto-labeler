'use client';

import { useEffect, useState } from 'react';

export function VideoFrame({ imageUrl, title }: { imageUrl: string | null; title?: string }) {
	return (
		<div className='h-full w-full bg-white overflow-hidden flex flex-col'>
			<div className='h-10 px-3 flex items-center justify-between border-b border-neutral-200'>
				<div className='text-sm text-neutral-800'>{title ?? '2D Frame'}</div>
			</div>
			<div className='flex-1 flex items-center justify-center'>
				{imageUrl ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={imageUrl} alt='frame' className='max-h-full max-w-full object-contain' />
				) : (
					<div className='text-sm text-neutral-500'>No video frame found</div>
				)}
			</div>
		</div>
	);
}
