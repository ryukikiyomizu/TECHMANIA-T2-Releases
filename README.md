# TECHMANIA T2 Updates

Public update feed for the TECHMANIA Technika 2 cabinet build.

## TECHMANIA launcher setup

Keep `MXGG-TECHMANIA-Launcher.exe`, `TECHMANIA-Updater.ps1`, and
`Update TECHMANIA.bat` beside `TECHMANIA.exe`. The MXGG launcher is the cabinet's
permanent entrypoint: it checks the latest GitHub Release, verifies its SHA-256
checksum, updates the TECHMANIA client and T2 theme, then launches the game. If
GitHub is unavailable, the recovery screen can launch the installed build offline
or open `TECHMANIA-Launcher.log`.

Build the portable launcher from `launcher/` with:

```powershell
npm install
npm test
npm run pack
```

The generated `launcher/dist/TECHMANIA-Launcher.exe` is a staged launcher update.
The updater promotes it to `MXGG-TECHMANIA-Launcher.exe` after the running launcher
closes, so the cabinet keeps the same entrypoint. A cabinet upgrading from an
updater without this migration support completes the one-time swap on its next
launcher run; later launcher updates swap automatically during the update run.

## Recovery updater

Place `TECHMANIA-Updater.ps1` and `Update TECHMANIA.bat` beside `TECHMANIA.exe`.
Run `Update TECHMANIA.bat` whenever an update is available. The updater downloads
the latest GitHub Release, verifies its SHA-256 checksum, and installs it without
touching profiles, records, options, user assets, or user tracks.

The release asset names are fixed:

- `TECHMANIA-Update.zip`
- `TECHMANIA-Update.zip.sha256`

Payloads stay selective: T2-only releases contain only `.tmtheme` files;
client-only releases contain the client plus `Themes/Default.tmtheme`; combined
releases contain both sets.

