# Pink Promise — Rollback to Last Working Version

This restores the stable version before the unfinished video-thumbnail and startup-rescue changes.

## Replace
- index.html
- app.js
- google-drive.js
- pwa.js
- service-worker.js
- database.rules.json

## Keep
- firebase-config.js
- google-drive-config.js
- starter-gallery.js
- assets/
- icons/
- manifest.webmanifest
- offline.html

## Remove newer startup files
Double-click `cleanup-new-startup-files.bat`.

## Firebase
Publish `database.rules.json` in Firebase Realtime Database Rules.

## Clean local test
1. Close all Pink Promise tabs and the installed app.
2. Copy the rollback files into WANPSALM.
3. Double-click `cleanup-new-startup-files.bat`.
4. Restart Live Server.
5. Open `http://127.0.0.1:5500/index.html?rollback=1`.
6. Press Ctrl+Shift+R.

This rollback restores working video playback. The unfinished thumbnail feature is removed.
Your existing Google Drive files and Firebase gallery records are not deleted.
