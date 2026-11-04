import type { ToolDefinition } from '../types';

export const toGif: ToolDefinition = {
  id: 'video.to-gif',
  name: 'Video to GIF',
  description:
    'Turn a short clip into a GIF for pull requests, docs and chats, with an optimised colour palette.',
  kind: 'video',
  operation: 'convert',
  inputExtensions: ['mov', 'mp4', 'm4v', 'mkv', 'webm', 'avi'],
  outputExtension: 'gif',
  options: [
    {
      type: 'select',
      key: 'width',
      label: 'Size',
      default: '720',
      help: 'Width in pixels. GIFs grow quickly, so smaller is usually better.',
      choices: [
        { value: '480', label: 'Small' },
        { value: '720', label: 'Medium' },
        { value: '960', label: 'Large' },
      ],
    },
    {
      type: 'select',
      key: 'fps',
      label: 'Smoothness',
      default: '15',
      choices: [
        { value: '10', label: 'Low', help: '10 fps: smallest file.' },
        { value: '15', label: 'Medium', help: '15 fps: good for UI demos.' },
        { value: '24', label: 'High', help: '24 fps: smooth, larger file.' },
      ],
    },
    {
      type: 'toggle',
      key: 'loop',
      advanced: true,
      label: 'Loop forever',
      default: true,
    },
  ],

  async run({ inputPath, outputPath, options, engines, signal, onProgress }) {
    const { ffmpeg } = engines;
    const info = await ffmpeg.probe(inputPath);
    if (!info.hasVideo) throw new Error('No video stream found in this file.');

    // One palette per clip (stats from changing pixels only), then dithered
    // mapping; only redraws changed rectangles, which keeps UI demos small.
    const width = `min(${options.width}\\,iw)`;
    const filter =
      `fps=${options.fps},scale=${width}:-1:flags=lanczos,split[a][b];` +
      `[a]palettegen=stats_mode=diff[p];` +
      `[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`;

    await ffmpeg.run(
      [
        '-i',
        inputPath,
        '-filter_complex',
        filter,
        '-loop',
        options.loop ? '0' : '-1',
        outputPath,
      ],
      { signal, durationSec: info.durationSec, onProgress },
    );
  },
};
