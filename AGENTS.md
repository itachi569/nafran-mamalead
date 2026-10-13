# Nafran app release workflow

After any app code, UI, asset, or build configuration change, rebuild the Windows installer with `npm run package:win` before reporting the change complete. Verify that the installer in `release/` has a fresh timestamp and launches with the changed behavior. If packaging fails, report the failure and do not present the older installer as updated.

Keep API keys and `.secrets/` out of packaged files and shared deliverables.
