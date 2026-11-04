# How it works

What Media Optimiser does to your files, and why. Everything runs locally: video and audio go through a bundled [FFmpeg](https://ffmpeg.org), and images through [libvips](https://www.libvips.org) (via [sharp](https://sharp.pixelplumbing.com)).

## Your files are safe

- **Originals are never overwritten.** If `clip.mp4` already exists, the result is saved as `clip (optimised).mp4`.
- **No broken files.** Results are written to a temporary `name.part.ext` file and renamed only when complete. Cancelling, a crash or quitting the app removes the partial file.
- **Moving originals to the Trash** is off by default. When it's on, an original is moved only after its result has been written successfully, and it goes to the Trash (not deleted), so you can restore it.
- **Parallel jobs never collide.** Video runs one file at a time (the encoder already uses every core), audio two at a time, and images several. Output names are reserved before work starts.

## Quality score

After each conversion the app shows how closely the result matches the original, for example **99.2% match**.
This is [SSIM](https://en.wikipedia.org/wiki/Structural_similarity) on brightness (luma), computed by FFmpeg:

- **Video:** the first 10 seconds of the result against the same part of the original (after any trim).
- **Images:** the result against a lossless render of the same rotate, resize and colour pipeline, so only compression loss counts, not the resize you asked for.

As a rough guide, 99% and above looks identical at normal viewing size, and 97–99% is close but may show softening on fine detail.

## Video: MOV to MP4

| Setting         | What it does                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H.264 (default) | libx264 at CRF 19 / 23 / 28 for High / Balanced / Smallest. Plays everywhere.                                                                                                         |
| H.265 / HEVC    | libx265 at CRF 22 / 26 / 31, tagged `hvc1` so QuickTime and Safari play it. Often smaller on long or busy video, but about 8× slower to encode.                                       |
| Content         | _Screen recording_ uses `-tune stillimage` (sharp text, still frames); _Camera footage_ uses `-tune film`.                                                                            |
| Max resolution  | Downscales only when the video is larger (Lanczos), keeping the aspect ratio.                                                                                                         |
| Size limit      | Encodes normally first. Only if the result is too big does it run a two-pass encode at the bitrate that fits (with 4% headroom). Fails clearly if that would be under about 100 kbps. |
| Max frame rate  | `-fpsmax`: caps the frame rate, never raises it.                                                                                                                                      |
| Metadata        | Location and device information are removed by default; the creation date is kept. An advanced toggle keeps everything.                                                               |
| Trim            | Start and end are applied without re-reading the skipped part, so trimming a long file is fast.                                                                                       |
| Always          | `yuv420p` for compatibility, `+faststart` so web players start before the download finishes, and only the first video track (QuickTime timecode tracks are dropped).                  |

**Presets** set several of these at once: _Standard_ (same resolution, much smaller), _Chat_ (1080p), _GitHub_ (under 10 MB), _Email_ (under 25 MB) and _Best quality_ (visually lossless).

Apple's hardware encoder (VideoToolbox) was tested and left out: on screen recordings it was about 2× slower and made files 5–9× larger than x264 at the same visual quality.

## Video: to GIF

FFmpeg generates a palette from the clip first (`palettegen`), then maps every frame onto it (`paletteuse`). This gives much cleaner colour than a fixed 256-colour palette. Size (480 / 720 / 960 px wide) and smoothness (10 / 15 / 24 fps) are the main levers on file size.

## Audio

| Tool               | How                                                                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convert            | MP3 (LAME VBR), M4A (AAC), Opus, WAV (16 or 24-bit PCM, matching the source) and FLAC. From a video, only the soundtrack is taken. Tags and album art are kept unless you turn that off.                                                                                         |
| Normalise loudness | Two-pass EBU R128 (`loudnorm`): the first pass measures, the second applies a linear gain so dynamics aren't squashed. Targets: −14 LUFS (streaming), −16 (podcasts and voice), −23 (broadcast). The file keeps its format and sample rate; videos keep their picture untouched. |
| Clean up recording | A high-pass filter at 80 Hz removes rumble and hum, FFT noise reduction (`afftdn`) lowers steady background noise, and silence is trimmed from both ends.                                                                                                                        |

## Images

- **Formats:** JPEG (mozjpeg), WebP, AVIF and PNG (lossless at _High_, palette-quantised otherwise). _Keep_ re-saves in the original format.
- **Upright and never enlarged:** photos are rotated using their EXIF orientation, and resizing only ever shrinks.
- **Transparency:** transparent images saved as JPEG get a white background.
- **Privacy:** location and camera metadata are removed by default. The colour profile is kept, so colours don't shift.
- **Never bigger:** when keeping the format at full size, if the result would be larger than the original, the original is kept.
- **HEIC (iPhone photos):** decoded with macOS's built-in `sips`, because sharp's prebuilt libvips can't read HEIC (HEVC patents). On Windows and Linux, the app says so clearly.

## Logs and error reports

If a conversion fails, the file shows a short reason and a **Copy error details** button. The copied text includes the app version, tool, options, input file and the end of FFmpeg's output. That's everything a bug report needs.
The full log is in the app's log folder (`main.log`, rotated at 1 MB).
