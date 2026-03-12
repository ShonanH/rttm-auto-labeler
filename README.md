# RTTM LiDAR Label Reviewer

A browser-based tool for reviewing and editing 3D bounding box predictions from a LiDAR pipeline. Load a run folder from disk, step through frames, toggle/relabel boxes in the interactive 3D viewer, save reviewed annotations, and export final `.txt` labels — all without uploading any data to a server.

---

## Prerequisites

| Tool                           | Minimum version | Notes                                                                                              |
| ------------------------------ | --------------- | -------------------------------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) | 18              | LTS recommended                                                                                    |
| npm                            | 9               | bundled with Node                                                                                  |
| A Chromium browser             | any recent      | Chrome or Edge — **Safari and Firefox do not support the File System Access API** used by this app |

---

## 1. Install dependencies

Clone or download this repository, then in the project root run:

```bash
npm install
```

---

## 2. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in **Chrome** or **Edge**.

---

## 3. Prepare your run folder

Download the runs folder from Google Drive

````

> **Instances folder name:** The app defaults to `step1_6_results`. If that folder is missing it will automatically fall back to any folder named `step1_6_results_v*` (picking the highest version) or any `instances_*` folder that contains an `instances_index.json`.

### `frame_index.json` format

Either a plain array:
```json
[
  { "frame_id": "000000", "timestamp": 1700000000.0 },
  { "frame_id": "000001", "timestamp": 1700000000.1 }
]
````

Or an object with a `frames` key:

```json
{ "frames": [{ "frame_id": "000000" }, { "frame_id": "000001" }] }
```

If the file is empty or missing `frame_id`, the app falls back to listing `*.bin` files in `frames/points/`.

### `instances_XXXXXX.json` format

```json
{
  "instances": [
    {
      "id": "0",
      "class": "Sedan",
      "kept": true,
      "score": 0.92,
      "num_points": 45,
      "box_3d": [x, y, z, length, width, height, yaw_radians]
    }
  ]
}
```

Accepted field aliases: `class` / `className` / `label`, `box_3d` / `box3d` / `box`, `num_points` / `numPoints`.

---

## 4. Open your run folder in the app

1. Click **Open Run Folder** in the top bar.
2. In the system dialog, select your `run_YYYYMMDD_HHMMSS` folder (or the parent folder if it contains a `_LATEST_RUN.json` pointer or `run_*` subdirectories — the app resolves the right one automatically).
3. Grant the browser **read and write** access when prompted (required to save reviewed annotations back to disk).

The app will:

- Read `frame_index.json` and populate the frame list on the left.
- Load the first frame's point cloud and bounding boxes automatically.
- Create two folders inside your run folder (if they don't exist): `review/instances_reviewed/` and `exports/`.

---

## 5. Review frames

| UI element                    | What it does                                      |
| ----------------------------- | ------------------------------------------------- |
| **Frame list** (left panel)   | Click any frame to load it                        |
| **Prev / Next** buttons       | Step through frames in order                      |
| **3D viewer** (centre)        | Orbit: left-drag · Zoom: scroll · Pan: right-drag |
| **Boxes panel** (right panel) | Shows all instances for the current frame         |
| **Keep checkbox**             | Uncheck to mark a box for removal                 |
| **Class dropdown**            | Relabel the vehicle class                         |

Colour legend in the 3D viewer:

| Colour | Class             |
| ------ | ----------------- |
| Blue   | Sedan             |
| Green  | SUV               |
| Amber  | Van               |
| Red    | Truck             |
| Purple | Bus               |
| Sky    | Cycle             |
| Dark   | Vehicle (generic) |

---

## 6. Save a frame

Click **Save Frame** to write the current frame's reviewed annotations to:

```
run_dir/review/instances_reviewed/instances_XXXXXX.json
```

Only boxes with **Keep** checked are written. On subsequent loads the app prefers the reviewed file over the source prediction, so your edits persist.

---

## 7. Export final labels

Once you have reviewed all the frames you need, click **Finish / Export**. The app will write one `.txt` file per reviewed frame to:

```
run_dir/exports/labels_txt_reviewed/XXXXXX.txt
```

Each line in a `.txt` file has the format:

```
<ClassName> <x> <y> <z> <length> <width> <height> <yaw>
```

Only frames that have been explicitly saved (i.e. have a file in `review/instances_reviewed/`) are exported. Frames that were never saved are skipped.

---

## Optional: extract video frames aligned to a run

If you have a video recorded alongside your LiDAR run and want to extract one image per LiDAR frame (useful for visual reference), use the included Python helper:

```bash
python extract_video_frames_to_run.py \
  --run_dir /path/to/run_YYYYMMDD_HHMMSS \
  --video   /path/to/recording.mp4
```

Frames are saved to `run_dir/frames/video/XXXXXX.jpg` by default. The script reads `frame_index.json` to determine how many frames to extract and samples them uniformly across the video duration.

**Requirements:** Python 3.10+ and `ffmpeg` / `ffprobe` installed and on your `PATH`.

Additional options:

| Flag           | Default        | Description                              |
| -------------- | -------------- | ---------------------------------------- |
| `--out_subdir` | `frames/video` | Output subdirectory under the run folder |
| `--start_sec`  | `0.0`          | Start offset into the video (seconds)    |
| `--end_sec`    | video end      | End offset into the video (seconds)      |
| `--ext`        | `jpg`          | Output image format (`jpg` or `png`)     |
| `--jpg_q`      | `3`            | JPEG quality (2–31, lower = better)      |

---

## Troubleshooting

**"A requested file or directory could not be found"**
The frame ID in `frame_index.json` does not match a `.bin` file in `frames/points/` or an `instances_*.json` file in the instances folder. Check that filenames are zero-padded to 6 digits and match exactly.

**"Could not find instances folder"**
Your instances directory is not named `step1_6_results` and no `step1_6_results_v*` or `instances_*` fallback was found. Rename the folder or update `DEFAULT_INSTANCES_DIR` in `src/lib/adapters/localRunsAdapter.ts`.

**Blank/white 3D viewer**
This is normal when no frame is loaded. Select a frame from the list on the left.

**Browser says "File System Access API not supported"**
Use Google Chrome or Microsoft Edge. Safari and Firefox do not support the API required to read/write files directly from the browser.
