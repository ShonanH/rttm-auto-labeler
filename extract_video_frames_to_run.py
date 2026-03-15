#!/usr/bin/env python3
import argparse
import json
import subprocess
from pathlib import Path


def run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed:\n{' '.join(cmd)}\n\nSTDERR:\n{p.stderr}")
    return p.stdout.strip()


def ffprobe_video_info(video_path: str) -> dict:
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


def load_lidar_timestamps(run_dir: Path) -> list[float]:
    """
    Read frames/timestamps.txt and return per-frame offsets in seconds,
    relative to the first valid (non-zero) timestamp.

    timestamps.txt format: one line per frame: "<frame_id> <timestamp_ns>"
    Frame 000000 often has timestamp=0 (invalid first PCAP packet); those are
    treated as if they share the first valid timestamp so their video offset = 0.
    """
    ts_path = run_dir / "frames" / "timestamps.txt"
    if not ts_path.exists():
        return []

    raw: list[int] = []
    for line in ts_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        raw.append(int(parts[1]) if len(parts) >= 2 else 0)

    # Find first valid (non-zero, non-negative) timestamp to use as anchor
    first_valid = next((t for t in raw if t > 0), None)
    if first_valid is None:
        return [i * 0.1 for i in range(len(raw))]

    offsets: list[float] = []
    for t in raw:
        if t <= 0:
            # Invalid timestamp — treat as coinciding with first valid frame
            offsets.append(0.0)
        else:
            offsets.append((t - first_valid) / 1e9)
    return offsets


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
    ap.add_argument("--start_sec", type=float, default=0.0,
                    help="Video timestamp (seconds) that corresponds to LiDAR frame 0")
    ap.add_argument("--ext", default="jpg", choices=["jpg", "png"], help="Image extension")
    ap.add_argument("--jpg_q", type=int, default=3, help="JPEG quality scale (2-31). Lower is better quality.")
    ap.add_argument("--lidar_fps", type=float, default=10.0,
                    help="Fallback LiDAR frame rate used only when timestamps.txt is missing (default: 10)")

    args = ap.parse_args()

    run_dir = Path(args.run_dir).expanduser().resolve()
    video = str(Path(args.video).expanduser().resolve())

    n = load_num_run_frames(run_dir)
    info = ffprobe_video_info(video)
    dur = info["duration"]

    if dur <= 0:
        raise RuntimeError("Could not determine video duration via ffprobe.")

    start = max(0.0, args.start_sec)

    # Build per-frame video timestamps from actual LiDAR timestamps
    offsets = load_lidar_timestamps(run_dir)
    if offsets:
        if len(offsets) != n:
            print(f"[WARN] timestamps.txt has {len(offsets)} entries but frame_index has {n} frames. "
                  f"Using min({len(offsets)}, {n}) frames.")
            n = min(len(offsets), n)
        times = [start + offsets[i] for i in range(n)]
        print(f"[INFO] Using actual LiDAR timestamps from timestamps.txt")
        print(f"[INFO] LiDAR recording span: {offsets[n-1]:.3f}s ({n} frames)")
    else:
        print(f"[WARN] timestamps.txt not found — falling back to assumed {args.lidar_fps}fps")
        times = [start + i / args.lidar_fps for i in range(n)]

    out_dir = run_dir / args.out_subdir
    out_dir.mkdir(parents=True, exist_ok=True)

    # Validate last frame doesn't exceed video duration
    last_t = times[-1]
    if last_t > dur:
        raise RuntimeError(
            f"Last frame timestamp {last_t:.3f}s exceeds video duration {dur:.3f}s. "
            f"Reduce --start_sec or trim the LiDAR frame range."
        )

    print(f"[INFO] video duration={dur:.3f}s fps≈{info['fps']:.3f} total_frames≈{info['total_frames']}")
    print(f"[INFO] run frames={n} extracting to {out_dir}")
    print(f"[INFO] video sampling window: {times[0]:.3f}s -> {last_t:.3f}s")

    for i, t in enumerate(times):
        frame_id = f"{i:06d}"
        out_path = out_dir / f"{frame_id}.{args.ext}"

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
