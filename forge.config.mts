import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const env = process.env;

// Code signing switches on only when credentials are present (see README).
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

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Media Optimiser',
    executableName: 'media-optimiser',
    appBundleId: 'com.mediaoptimiser.app',
    // Extension is picked per platform: .icns (macOS), .ico (Windows).
    icon: 'assets/icon',
    ...macSigning,
    // ffmpeg ships next to the app (not inside asar) so it can be executed.
    // ffmpeg-static downloads the binary for the platform you build on, so
    // build each OS on that OS (or in CI) - see README.
    extraResource: [
      `node_modules/ffmpeg-static/ffmpeg${process.platform === 'win32' ? '.exe' : ''}`,
      'node_modules/ffmpeg-static/ffmpeg.LICENSE',
    ],
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
      options: { bin: 'media-optimiser', icon: 'assets/icon.png' },
    }),
    new MakerDeb({
      options: { bin: 'media-optimiser', icon: 'assets/icon.png' },
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
