# Mac website downloads temporarily paused

On 21 October 2026 the owner requested a Windows-only public landing page.
The Mac buttons, compatibility/installation notes, platform badge and
Subscribe fallback instructions were removed. The header/hero and download
heading now say Download for Windows. Non-Windows Subscribe fallback does
not automatically download a Windows installer.

The Mac build workflow, packaging configuration, backend platform routes,
release tags and existing artifacts remain intact. Version 1.4.12 is saved
under tag `mac-v1.4.12`, draft release 419231303, workflow run 39556459438.
The direct platform download endpoints still work; the public page no longer
offers them. This change is a website pause, not artifact deletion.

For restoration, use `deploy/mac-release.md`. The former website markup and
sales logic are in Git history at `d7bc838` (their copy refers to 1.4.11).
Restore only the Mac sections, update the release version and preserve newer
AI privacy and Windows signing copy. Restore chip-specific buttons, notes,
the badge and OS-aware Subscribe fallback together.

The last live pre-pause website is also saved on the server at
`/home/ahmed/deploy-staging/windows-only-20261021/rollback/`.
Apple Developer ID signing and notarization remain pending. Do not describe
the existing Mac packages as Apple-verified.
