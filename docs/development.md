# Development

## Setup

You need [Node.js](https://nodejs.org) 22 or later, and git.

```sh
npm install        # also downloads FFmpeg for your OS (ffmpeg-static) and sharp's libvips
npm start          # run the app with hot reload
npm run typecheck  # TypeScript
npm run lint       # oxlint + oxfmt format check (fix formatting with: npx oxfmt src)
npm test           # vitest: unit and integration tests
npm run make       # build installers for your OS into out/make
```

Run the command-line mode from source with `npm start -- -- <command>`, for example `npm start -- -- list`.

The tests run real FFmpeg and sharp against small generated files, so they also catch encoder and packaging regressions. They take a few seconds.

## Stack

Electron + [Electron Forge](https://www.electronforge.io) (Vite plugin), React, TypeScript.
Video and audio use a bundled FFmpeg binary from [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static); images use [`sharp`](https://sharp.pixelplumbing.com) (libvips).
Set `MEDIA_OPTIMISER_FFMPEG=/path/to/ffmpeg` to use a different FFmpeg build.

## Architecture

```
src/
  shared/              Serialisable types and the IPC contract, shared by every process
    types.ts           ToolManifest, OptionField (declarative option schema), JobState, AppSettings
    ipc.ts             Channel names and the MediaApi exposed to the renderer
    options.ts         Validates saved option values against a tool's schema
    format.ts          Sizes, durations, times, quality score formatting
  tools/               ← where features live
    types.ts           ToolDefinition = manifest + run(ctx)
    index.ts           Tool registry
    video/             convert, to-gif
    audio/             convert, normalise, cleanup
    image/             compress
  main/                Electron main process (Node)
    main.ts            Window, security settings, theme; switches to CLI mode when given a command
    cli.ts             CLI: argument parsing and help generated from tool manifests
    ipc.ts             IPC handlers (dialogs, jobs, shell, drag-out, watch folder)
    settings.ts        User settings → settings.json in the OS app-data folder
    jobs/JobRunner.ts  Queue, per-media concurrency, progress, cancel, temp file → rename, unique names
    engines/           Processing back-ends handed to tools (ffmpeg spawn/probe/SSIM, sharp loader)
    preview.ts         media:// protocol with range requests, for the trim preview
    watch.ts           Folder watcher for auto-convert
    open-files.ts      Open With / Dock / second-launch file handling
  preload/preload.ts   Exposes window.mediaApi (contextIsolation and sandbox on)
  renderer/            React UI. Media tabs, tool tabs, presets and the options form are generated from tool manifests
```

The renderer never touches the file system or FFmpeg. It sends a `JobRequest` (`toolId`, `inputPath`, `options`) over IPC; the main process runs the tool and streams `JobState` updates back.

Settings live in `settings.json` and logs in `main.log`, in the OS app-data folder (macOS: `~/Library/Application Support/Media Optimiser/` and `~/Library/Logs/Media Optimiser/`).

## Adding a tool

1. Create `src/tools/<kind>/<name>.ts` exporting a `ToolDefinition`:
   - `kind`: `video` | `audio` | `image`. Decides the media tab and accent colour.
   - `operation`: `convert` | `optimise` | `transform`.
   - `inputExtensions` and `outputExtension` (or `outputExtensionFor(input, options)`).
   - `options`: `select`, `number` and `toggle` fields. The app's form and the CLI flags are generated from these.
     Mark rarely needed fields `advanced: true`, so they go under "Advanced settings" in the app and "Advanced options" in CLI help.
     Keep the basic set to the one or two choices a non-technical user would make.
   - Optional `presets`: named bundles of option values, shown as cards in the app and as `--preset` on the CLI.
   - `run({ inputPath, outputPath, options, engines, signal, onProgress, trim })`. Write to `outputPath`, report progress from 0 to 1, and stop when `signal` aborts. Return `{ quality }` if you can measure it.
2. Add it to the array in `src/tools/index.ts`.
3. Add a test next to it (see `src/tools/*/*.test.ts`).

File filters, the queue, progress, cancel, output naming, the CLI and the UI all work automatically.
For a new processing back-end, add it to `Engines` in `src/main/engines/index.ts` so every tool gets it as `ctx.engines`.

## UI conventions

- **Simple first.** The basic settings are what most people need; everything else goes in Advanced settings.
- **Colours** are CSS variables in `src/renderer/styles.css`, with light and dark values. Each media type has its own accent (`--video`, `--audio`, `--image`), and the window takes the accent of the selected tool.
- **Theme** (light, dark or system) is set through Electron's `nativeTheme`, which drives `prefers-color-scheme` in the page and the native window frame.
- **Font:** Figtree, bundled with `@fontsource-variable/figtree` so it works offline.

## Building installers

```sh
npm run make
```

| OS      | Output                                  |
| ------- | --------------------------------------- |
| macOS   | `.zip` containing `Media Optimiser.app` |
| Windows | Squirrel `Setup.exe`                    |
| Linux   | `.deb` and `.rpm`                       |

`ffmpeg-static` and sharp download binaries for the OS you install on, so **build each OS and CPU on a matching machine** (CI uses an Intel runner for Intel Macs).

sharp is a native module, so Vite doesn't bundle it. The `packageAfterCopy` hook in `forge.config.mts` copies sharp, its JavaScript dependencies and only the target platform's `@img/*` binaries into the app, outside the asar archive.

## Releasing

1. Update `version` in `package.json` and commit.
2. Tag and push: `git tag v1.1.0 && git push origin v1.1.0`.
3. The **Build** workflow (`.github/workflows/build.yml`) builds macOS (Apple Silicon and Intel), Windows and Linux, and attaches the installers to a GitHub Release for the tag. You can also run it by hand from the Actions tab; then the installers are only uploaded as workflow artifacts.

### Code signing

Signing turns on automatically when these are set: as repository secrets in CI, or locally in a `.env` file (copy `.env.example`; it's gitignored and never packaged into the app):

| Platform                       | Secrets                                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS signing and notarisation | `APPLE_ID`, `APPLE_APP_PASSWORD` (an app-specific password), `APPLE_TEAM_ID`. A "Developer ID Application" certificate must be in the build machine's keychain. |
| Windows                        | `WINDOWS_CERT_FILE` (a `.pfx`) and `WINDOWS_CERT_PASSWORD`                                                                                                      |

Without them, Windows builds are unsigned and macOS builds get an ad-hoc signature (applied in the `postPackage` hook, so a downloaded app isn't reported as "damaged"). Both warn on first open.

## App icon

`assets/icon.{png,icns,ico}` are generated from code:

```sh
python3 scripts/make-icons.py   # needs Pillow; .icns uses macOS iconutil, .ico uses ImageMagick
```

The mark ("Shrink") is three bars getting shorter, coral, violet and green for video, audio and image. The same shapes are drawn in the app by `src/renderer/components/Logo.tsx`.
