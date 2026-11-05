import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const env = process.env;

// Code signing switches on only when credentials are present (see docs/development.md).
const macSigning = env.APPLE_ID
  ? {
      osxSign: {},
      osxNotarize: {
        appleId: env.APPLE_ID,
        appleIdPassword: env.APPLE_APP_PASSWORD!,
        teamId: env.APPLE_TEAM_ID!,
      },
    }
  : {};
const windowsSigning = env.WINDOWS_CERT_FILE
  ? {
      certificateFile: env.WINDOWS_CERT_FILE,
      certificatePassword: env.WINDOWS_CERT_PASSWORD,
    }
  : {};

const ffmpegBinary = `node_modules/ffmpeg-static/ffmpeg${process.platform === 'win32' ? '.exe' : ''}`;

/**
 * The Vite build bundles all JS, but native modules can't be bundled. Copy
 * sharp, its JS dependencies and only the target platform's binaries.
 */
function nativePackages(platform: string, arch: string): string[] {
  const binaries = fs
    .readdirSync('node_modules/@img')
    .filter((d) => d.endsWith(`-${platform}-${arch}`))
    .map((d) => `@img/${d}`);
  return ['sharp', '@img/colour', 'detect-libc', 'semver', ...binaries];
}

/** Linux "Open With" registration. */
const mimeType = [
  'video/quicktime',
  'video/mp4',
  'video/x-matroska',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-wav',
  'audio/flac',
  'audio/ogg',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/tiff',
  'image/heic',
];

const config: ForgeConfig = {
  hooks: {
    packageAfterCopy: async (_config, buildPath, _electron, platform, arch) => {
      const packages = nativePackages(platform, arch);
      // Windows bundles libvips inside this package; others add sharp-libvips-*.
      if (!packages.includes(`@img/sharp-${platform}-${arch}`)) {
        throw new Error(
          `sharp binaries for ${platform}-${arch} are missing. Run npm install on a ${platform}-${arch} machine (see docs/development.md).`,
        );
      }
      for (const name of packages) {
        await fs.promises.cp(
          path.join('node_modules', name),
          path.join(buildPath, 'node_modules', name),
          { recursive: true },
        );
      }
    },
    // Without a certificate, re-apply an ad-hoc signature: packaging edits
    // Info.plist after Electron was signed, and macOS calls a downloaded app
    // with a broken signature "damaged" (only offering the Trash).
    postPackage: async (_config, { platform, outputPaths }) => {
      if (platform !== 'darwin' || env.APPLE_ID) return;
      for (const dir of outputPaths) {
        const app = path.join(dir, 'Media Optimiser.app');
        execFileSync('codesign', ['--force', '--deep', '--sign', '-', app]);
        execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
      }
    },
  },
  packagerConfig: {
    // Native code (sharp, libvips) must live outside the asar archive.
    asar: { unpack: '**/node_modules/{sharp,@img}/**' },
    name: 'Media Optimiser',
    executableName: 'media-optimiser',
    // Appear in Finder's "Open With" for media without becoming the default.
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'Media',
          CFBundleTypeRole: 'Viewer',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['public.movie', 'public.audio', 'public.image'],
        },
      ],
    },
    appBundleId: 'com.mediaoptimiser.app',
    // Extension is picked per platform: .icns (macOS), .ico (Windows).
    icon: 'assets/icon',
    ...macSigning,
    // ffmpeg ships next to the app (not inside asar) so it can be executed.
    // ffmpeg-static downloads the binary for the platform you build on, so
    // build each OS on that OS (or in CI) - see docs/development.md.
    extraResource: [ffmpegBinary, `${ffmpegBinary}.LICENSE`, 'assets/icon.png'],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'media_optimiser',
      setupIcon: 'assets/icon.ico',
      ...windowsSigning,
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({
      options: { bin: 'media-optimiser', icon: 'assets/icon.png', mimeType },
    }),
    new MakerDeb({
      options: { bin: 'media-optimiser', icon: 'assets/icon.png', mimeType },
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
