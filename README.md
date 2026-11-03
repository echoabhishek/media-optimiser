# Media Optimiser

A cross-platform desktop app (macOS, Windows, Linux) for converting and optimising media.
Built with Electron Forge + Vite + React + TypeScript, with ffmpeg bundled. Users don't need to install anything.

**Tools so far:** Video › MOV to MP4. Audio and image tools are planned.

## Develop

```sh
npm install      # also downloads ffmpeg for your OS (ffmpeg-static)
npm start        # run the app with hot reload
npm run typecheck && npm run lint
npm run make     # build installers for the current OS into out/make
```

Installers per OS: `.zip` (macOS), Squirrel `Setup.exe` (Windows), `.deb` / `.rpm` (Linux).
`ffmpeg-static` downloads the ffmpeg binary for the OS you build on, so **build each OS on that OS**.
`.github/workflows/build.yml` does this on GitHub Actions (run it manually, or push a `v*` tag).

## Architecture

```
src/
  shared/            Serialisable types + IPC contract, shared by every process
    types.ts         ToolManifest, OptionField (declarative option schema), JobState
    ipc.ts           Channel names + the MediaApi exposed to the renderer
  tools/             ← where features live
    types.ts         ToolDefinition = manifest + run(ctx)
    index.ts         Tool registry
    video/mov-to-mp4.ts
  main/              Electron main process (Node)
    main.ts          Window, security settings
    ipc.ts           IPC handlers (dialogs, jobs, shell)
    settings.ts      User settings → settings.json in the OS app-data folder
    jobs/JobRunner.ts  Queue, progress, cancel, temp-file → rename, unique names
    engines/         Processing back-ends handed to tools
      ffmpeg.ts      Spawn ffmpeg, parse progress, probe, abort
      index.ts       Locates the bundled binary (dev vs packaged)
  preload/preload.ts Exposes `window.mediaApi` (contextIsolation + sandbox on)
  renderer/          React UI. The sidebar and options form are generated from tool manifests
```

The renderer never touches the filesystem or ffmpeg. It sends a `JobRequest`
(`toolId`, `inputPath`, `options`) over IPC, then the main process runs the
tool and sends back `JobState` updates.

## Adding a tool

1. Create `src/tools/<kind>/<name>.ts` exporting a `ToolDefinition`:
   - `kind`: `video` | `audio` | `image` (which sidebar group it appears in)
   - `operation`: `convert` | `optimise` | `transform`
   - `inputExtensions`, `outputExtension`
   - `options`: `select` / `number` / `toggle` fields. The UI form is generated from these.
   - `run({ inputPath, outputPath, options, engines, signal, onProgress })`
2. Add it to the array in `src/tools/index.ts`.

The UI, file filters, queue, progress, cancel and output naming all work automatically.
For a new back-end (e.g. `sharp` for images), add it to `Engines` in
`src/main/engines/index.ts`, and it becomes available to every tool as `ctx.engines`.

## MOV to MP4: encoding choices

| Setting | What it does |
|---|---|
| H.264 (default) | libx264, CRF 19/23/28 for High/Balanced/Smallest. Plays everywhere. |
| H.265 / HEVC | libx265, CRF 22/26/31, tagged `hvc1` so QuickTime/Safari play it. Often smaller on long/busy video, about 8× slower to encode. |
| Screen recording | `-tune stillimage` (sharp text, still frames); Camera uses `-tune film` |
| Max resolution | Downscales only if larger (Lanczos), keeps aspect ratio |
| Audio | AAC 160k/256k, or removed. Skipped automatically if the source has none |
| Always | `yuv420p`, `+faststart` (web streaming), metadata copied, only the first video track (drops QuickTime timecode tracks) |

Outputs are written as `name.mp4.part.mp4`, then renamed when complete, so a cancelled job never leaves a broken file.
Existing files are never overwritten: if `name.mp4` exists, the output becomes `name (optimised).mp4`.

## Licensing note

The bundled ffmpeg build (from `ffmpeg-static`) includes x264/x265, which are GPL.
That's fine for personal and internal use. If you distribute the app commercially,
review the GPL obligations or swap in an LGPL ffmpeg build via `MEDIA_OPTIMISER_FFMPEG` / `engines/index.ts`.
