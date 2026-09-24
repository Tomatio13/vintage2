# VINTAGE Changelog

## [0.2.1] - 2026-09-25

### Added

- **Update checks:** Check for updates from Settings or the sidebar. VINTAGE reports available versions and download progress, then offers a restart to install the update.
- **GitHub Releases update feed:** Packaged builds use GitHub Releases to find updates.

### Improved

- Corrected the application homepage, author details, and Linux package maintainer metadata.

### Upgrade notes

- VINTAGE v0.2.0 does not contain the updater client. Install v0.2.1 manually once; later releases can then be detected by the app.
- macOS builds are not code signed. They can check for a newer version, but updates must be downloaded from GitHub Releases and installed manually.

**Full Changelog:** [v0.2.0...v0.2.1](https://github.com/Tomatio13/vintage2/compare/v0.2.0...v0.2.1)

## [0.2.0] - 2026-09-24

### Added

- **Workspace Git Review:** Inspect unstaged changes and untracked files, then review file-level diffs in a read-only panel.
- **Clipboard image pasting:** Paste images from the clipboard into terminal sessions with `Ctrl+V` (`Cmd+V` on macOS). VINTAGE saves each image in a workspace-specific temporary directory and inserts its path into the terminal prompt so CLI agents can inspect it. Text pasting continues to work.

### Improved

- **Markdown previews:** Render GitHub Flavored Markdown, including tables and task lists, and display local workspace images. Switch between Preview and Source, and reload the file to see updates.

### Fixed

- **Release assets:** Installer publishing now includes files only and excludes unpacked application directories.

### Release workflow

- Manually run the installer workflow to publish a release for an existing version tag.

**Full Changelog:** [v0.1.0...v0.2.0](https://github.com/Tomatio13/vintage2/compare/v0.1.0...v0.2.0)
