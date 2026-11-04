# Contributing

Thanks for helping make Media Optimiser better. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

[Open an issue](https://github.com/echoabhishek/media-optimiser/issues/new) with:

- What you did, what you expected, and what happened.
- Your OS and the app version (from the About window, or `media-optimiser --version`).
- For a failed conversion, the text from the **Copy error details** button. It contains the tool, options and FFmpeg's output, but no file contents.

If you can share a small sample file that reproduces the problem, that helps a lot. Please don't attach anything private.

## Suggesting a feature

Open an issue describing the problem you want solved, not only the solution. The app aims to stay simple for people who don't know about codecs, so new options usually belong under Advanced settings, or in a preset.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Follow the [development guide](docs/development.md) to set up and run the app.
3. Keep changes focused: one fix or feature per pull request.
4. Add or update tests for behaviour changes.
5. Make sure these pass:

   ```sh
   npm run typecheck && npm run lint && npm test
   ```

6. Use [Conventional Commits](https://www.conventionalcommits.org) for commit messages, for example `feat: add WebM output` or `fix: keep album art when converting FLAC`.
7. For UI changes, include a screenshot in light and dark themes.

CI runs the same checks on macOS, Windows and Linux.

## Adding a tool

Most new features are tools. Each tool is one file that declares its options; the app's form, the CLI flags, file filters, queue and progress all come from that declaration. See [Adding a tool](docs/development.md#adding-a-tool).

## Licence

By contributing, you agree that your contributions are released under the [MIT licence](LICENSE).
