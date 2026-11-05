# Command line

Media Optimiser's app binary is also a command-line tool. Run it with a command and it works in the terminal without opening a window. Run it without one and the app opens.

## Set up the `media-optimiser` command

| Platform | How                                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | `sudo ln -sf "/Applications/Media Optimiser.app/Contents/MacOS/media-optimiser" /usr/local/bin/media-optimiser`                                                            |
| Linux    | The `.deb` and `.rpm` packages install `media-optimiser` for you.                                                                                                          |
| Windows  | Add the install folder (`%LOCALAPPDATA%\media_optimiser\app-<version>`) to `PATH`. Output may not show in `cmd`, because the `.exe` is a GUI app; PowerShell works better. |

From a source checkout, use `npm start -- -- <command> …` instead.

## Commands

```sh
media-optimiser list                        # list the tools
media-optimiser <type>                      # list one media type's tools, e.g. `video`
media-optimiser <type> <tool> --help        # a tool's options, basic and advanced
media-optimiser <type> <tool> <files...>    # convert files
media-optimiser --version
```

| Command           | What it does                                                                     |
| ----------------- | -------------------------------------------------------------------------------- |
| `video convert`   | Convert videos to MP4, WebM or MOV and make them much smaller                    |
| `video gif`       | Turn a short clip into a GIF with an optimised colour palette                    |
| `audio convert`   | Convert between MP3, M4A, Opus, WAV and FLAC, or extract a video's soundtrack    |
| `audio normalise` | Make audio as loud as platforms expect (EBU R128), without clipping              |
| `audio cleanup`   | Reduce noise and hum, and cut silence from the start and end of voice recordings |
| `image compress`  | Shrink and convert photos and screenshots to JPEG, WebP, AVIF or PNG             |

## Options

Every tool's flags are generated from the same settings the app shows, so the two always match. Run `media-optimiser <type> <tool> --help` for the full list. For example (preset descriptions shortened):

```console
$ media-optimiser video convert --help
Usage: media-optimiser video convert <files...> [options]
Accepts: .mov .mp4 .m4v .mkv .webm .avi

Options:
  --preset <standard|chat|github|email|best>
  --format <mp4|webm|mov>                     Format (default: MP4)
  --quality <high|balanced|small>             Quality (default: Balanced)
  --resolution <original|1440|1080|720>       Max resolution (default: Original)
  --size-limit <none|10|25|50>                Size limit (default: None)
  --start <time>                              Start at this time (seconds or m:ss)
  --end <time>                                Stop at this time (seconds or m:ss)
  --out <dir>                                 Output folder (default: next to each input file)
  --trash-originals                           Move each original to the Trash once converted
  --json                                      Print results as JSON (for scripts)

Advanced options:
  --codec <h264|h265>                         Codec (default: H.264)
  --content <screen|camera>                   Content (default: Screen recording)
  --speed <fast|medium|slow>                  Encoding speed (default: Thorough)
  --audio <standard|high|none>                Audio (default: Standard)
  --fps <original|60|30|24>                   Max frame rate (default: Original)
  --keep-metadata, --no-keep-metadata         Keep all metadata (default: false)
```

These flags work with every tool:

| Flag                | Meaning                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `--preset <id>`     | Apply a preset first; any other flags you pass override it             |
| `--out <dir>`       | Write results to this folder instead of next to each original          |
| `--trash-originals` | Move each original to the Trash once its result is written             |
| `--json`            | Print one JSON result at the end instead of progress lines             |
| `--start`, `--end`  | Trim (video tools only): seconds (`90`) or `m:ss` / `h:mm:ss` (`1:30`) |

## Examples

```sh
# Screen recordings small enough for a GitHub pull request
media-optimiser video convert ~/Desktop/*.mov --preset github

# A WebM for a website
media-optimiser video convert demo.mov --format webm

# A 30-second excerpt as a GIF
media-optimiser video gif demo.mov --start 0:12 --end 0:42

# A song at streaming loudness (Spotify, YouTube)
media-optimiser audio normalise song.wav --target -14

# Photos for a website, written to another folder
media-optimiser image compress ~/Pictures/trip/*.jpg --preset web --out ~/Desktop/web
```

Output looks like this:

```console
$ media-optimiser video convert "Team standup.mov" "Product demo.mov" --preset chat
✓ [1/2] Team standup.mov  89.3 MB → 40.5 MB (54% smaller, 99.2% match)
  /Users/you/Movies/Team standup.mp4
✓ [2/2] Product demo.mov  103 MB → 60.6 MB (40% smaller, 99.2% match)
  /Users/you/Movies/Product demo.mp4
```

## JSON output

With `--json`, progress lines are replaced by a single JSON object:

```json
{
  "ok": true,
  "files": [
    {
      "input": "/Users/you/Movies/Team standup.mov",
      "output": "/Users/you/Movies/Team standup.mp4",
      "status": "done",
      "inputBytes": 93662070,
      "outputBytes": 42466304,
      "quality": 0.992
    }
  ]
}
```

`quality` is the similarity score (0 to 1). Failed files have `"status": "error"` and an `error` message.

## Exit codes

| Code  | Meaning                                                                            |
| ----- | ---------------------------------------------------------------------------------- |
| `0`   | Every file converted                                                               |
| `1`   | At least one file failed (details are in the log file the error message points to) |
| `2`   | Usage error, such as an unknown flag or value                                      |
| `130` | Cancelled with Ctrl+C; partial files are removed                                   |
