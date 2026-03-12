#!/usr/bin/env python3
import argparse
import json
import math
import os
import subprocess
from pathlib import Path


def run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed:\n{' '.join(cmd)}\n\nSTDERR:\n{p.stderr}")
    return p.stdout.strip()


def ffprobe_video_info(video_path: str) -> dict:
    # Get duration + frame count (nb_frames may be missing for some codecs)
    # We'll compute total_frames from fps*duration if nb_frames isn't available.
    out = run([
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=avg_frame_rate,nb_frames",
        "-show_entries", "format=duration",
        "-of", "json",
        video_path
    ])
    info = json.loads(out)
    stream = info["streams"][0]
    fmt = info["format"]

    dur = float(fmt.get("duration", 0.0))
    afr = stream.get("avg_frame_rate", "0/0")
    num, den = afr.split("/")
    fps = float(num) / float(den) if float(den) != 0 else 0.0

    nb_frames = stream.get("nb_frames", None)
    if nb_frames is not None and str(nb_frames).isdigit():
        total_frames = int(nb_frames)
    else:
        total_frames = int(round(dur * fps)) if dur > 0 and fps > 0 else 0

    return {"duration": dur, "fps": fps, "total_frames": total_frames}


def load_num_run_frames(run_dir: Path) -> int:
    fi = run_dir / "frame_index.json"
    if not fi.exists():
        raise FileNotFoundError(f"Missing: {fi}")
    obj = json.loads(fi.read_text())
    if isinstance(obj, list):
        return len(obj)
    if isinstance(obj, dict) and isinstance(obj.get("frames"), list):
        return len(obj["frames"])
    raise ValueError("frame_index.json is not a list or {frames:[...]} dict")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run_dir", required=True, help="Path to run_YYYY... folder")
    ap.add_argument("--video", required=True, help="Path to .mp4/.mov file")
    ap.add_argument("--out_subdir", default="frames/video", help="Output subdir under run_dir")
    ap.add_argument("--start_sec", type=float, default=0.0, help="Start time offset into video (seconds)")
    ap.add_argument("--end_sec", type=float, default=None, help="Optional end time (seconds). Default: video end")
    ap.add_argument("--ext", default="jpg", choices=["jpg", "png"], help="Image extension")
    ap.add_argument("--jpg_q", type=int, default=3, help="JPEG quality scale (2-31). Lower is better quality.")
    args = ap.parse_args()

    run_dir = Path(args.run_dir).expanduser().resolve()
    video = str(Path(args.video).expanduser().resolve())

    n = load_num_run_frames(run_dir)
    info = ffprobe_video_info(video)
    dur = info["duration"]

    if dur <= 0:
        raise RuntimeError("Could not determine video duration via ffprobe.")

    start = max(0.0, args.start_sec)
    end = args.end_sec if args.end_sec is not None else dur
    end = min(end, dur)
    if end <= start:
        raise ValueError("end_sec must be greater than start_sec")

    out_dir = run_dir / args.out_subdir
    out_dir.mkdir(parents=True, exist_ok=True)

    # Sample N frames uniformly in [start, end)
    # Use per-frame seeks with -ss (fast enough for N~500)
    span = end - start
    times = [start + (i + 0.5) * span / n for i in range(n)]  # center-of-bin sampling

    print(f"[INFO] video duration={dur:.3f}s fps≈{info['fps']:.3f} total_frames≈{info['total_frames']}")
    print(f"[INFO] run frames={n} extracting to {out_dir}")
    print(f"[INFO] sampling window: {start:.3f}s -> {end:.3f}s")

    for i, t in enumerate(times):
        frame_id = f"{i:06d}"
        out_path = out_dir / f"{frame_id}.{args.ext}"

        # ffmpeg extract single frame at time t
        cmd = ["ffmpeg", "-y", "-ss", f"{t:.6f}", "-i", video, "-frames:v", "1"]
        if args.ext == "jpg":
            cmd += ["-q:v", str(args.jpg_q)]
        cmd += [str(out_path)]

        try:
            run(cmd)
        except Exception as e:
            raise RuntimeError(f"Failed at i={i} t={t:.6f}s -> {out_path}\n{e}")

        if (i + 1) % 50 == 0 or (i + 1) == n:
            print(f"[INFO] {i+1}/{n}")

    print("[DONE] Extraction complete.")


if __name__ == "__main__":
    main()