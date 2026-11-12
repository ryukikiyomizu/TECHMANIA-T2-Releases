# TECHMANIA T2 Updates

Public update feed for the TECHMANIA Technika 2 cabinet build.

## Client setup

Place `TECHMANIA-Updater.ps1` and `Update TECHMANIA.bat` beside `TECHMANIA.exe`.
Run `Update TECHMANIA.bat` whenever an update is available. The updater downloads
the latest GitHub Release, verifies its SHA-256 checksum, and installs it without
touching profiles, records, options, user assets, or user tracks.

The release asset names are fixed:

- `TECHMANIA-Update.zip`
- `TECHMANIA-Update.zip.sha256`

