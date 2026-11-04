# Third-party notices

Media Optimiser's own code is under the [MIT licence](LICENSE). The installers also include the third-party software below, each under its own licence.

## FFmpeg

Video and audio processing uses a separate FFmpeg executable that ships inside the app and runs as its own process.

- **Licence:** the bundled build is configured with `--enable-gpl --enable-version3` and includes libx264 and libx265, so the binary as a whole is licensed under the **GNU General Public License v3**. Its licence text ships with the app as `ffmpeg.LICENSE` (in the app's resources folder).
- **Source:** binaries come from the [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static) project (release `b6.1.1`), which takes them from:
  - macOS: [evermeet.cx](https://evermeet.cx/ffmpeg/) (Intel) and [osxexperts.net](https://osxexperts.net/) (Apple Silicon)
  - Windows: [gyan.dev](https://www.gyan.dev/ffmpeg/builds/)
  - Linux: [johnvansickle.com](https://johnvansickle.com/ffmpeg/)

  FFmpeg's source code is at [ffmpeg.org](https://ffmpeg.org/download.html); each builder above publishes the configuration and sources for its builds.

- **Using a different build:** set `MEDIA_OPTIMISER_FFMPEG` to another FFmpeg binary (for example, an LGPL-only build) to use it instead.

## sharp and libvips

Image processing uses [sharp](https://github.com/lovell/sharp) (Apache License 2.0) and its prebuilt [libvips](https://github.com/libvips/libvips) binaries (`@img/sharp-*` packages; the libvips package is under the GNU Lesser General Public License v3 or later, with bundled dependencies under their own licences, listed in each `@img/sharp-libvips-*` package).

## Figtree

The interface font is [Figtree](https://github.com/erikdkennedy/figtree) by Erik Kennedy, under the [SIL Open Font License 1.1](https://openfontlicense.org), bundled through `@fontsource-variable/figtree`.

## Electron, React and other npm packages

The app is built on [Electron](https://www.electronjs.org) (MIT, which includes Chromium and Node.js under their own licences) and [React](https://react.dev) (MIT). Every other npm dependency's licence is in its folder under `node_modules`; run `npx license-checker --production --summary` to list them.
