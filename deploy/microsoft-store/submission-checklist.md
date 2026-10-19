# MamaLead Microsoft Store submission checklist

## Prepared locally

- [x] Store-compatible AppX target for Windows x64
- [x] Store-specific update behavior: Microsoft Store manages updates
- [x] Store package identity supplied only from Partner Center environment values
- [x] `runFullTrust` declared for the Electron desktop app
- [x] Package logos and Store listing logo prepared
- [x] Five desktop screenshots prepared
- [x] English listing text and certification notes drafted
- [x] Standalone privacy policy prepared at `website/privacy.html`
- [x] Normal Windows installer rebuild remains part of the release gate

## Required from Partner Center

- [ ] Finish the free Microsoft Store developer account onboarding
- [ ] Reserve the product name `MamaLead`
- [ ] Copy the exact **Package/Identity/Name** value
- [ ] Copy the exact **Package/Identity/Publisher** value
- [ ] Copy the exact **Publisher display name**
- [ ] Create the final package with those three values
- [ ] Run Microsoft certification preflight / Windows App Certification Kit
- [ ] Set availability and price to **Free** (paid features are purchased inside the app)
- [ ] Choose the Business category that best matches sales and marketing tools
- [ ] Complete the IARC age rating questionnaire
- [ ] Declare that the app allows purchases without Microsoft Store commerce
- [ ] Upload the final package, listing text, five screenshots and 300 × 300 logo
- [ ] Add privacy URL `https://mamalead.com/privacy.html`
- [ ] Add support URL `https://mamalead.com/`

## Before certification submission

- [ ] Deploy `website/privacy.html` to the public website and verify HTTPS
- [ ] Switch Stripe from test mode to live mode and complete an end-to-end purchase test
- [ ] Confirm the public license API is reachable from a clean Windows account
- [ ] Provide a certification-test account or clear trial instructions
- [ ] Resolve the third-party terms issue for Google Maps data collection before declaring compliance
- [ ] Review every price and limit shown in the app and listing
- [ ] Confirm no API keys or `.secrets` files are present in the package

## Final build command

Replace the values below with the exact Partner Center identity fields:

```powershell
$env:MAMALEAD_STORE_IDENTITY_NAME = '<Package/Identity/Name>'
$env:MAMALEAD_STORE_PUBLISHER = '<Package/Identity/Publisher>'
$env:MAMALEAD_STORE_PUBLISHER_DISPLAY_NAME = '<Publisher display name>'
npm run package:store
```

The resulting `.appx` is expected to be unsigned locally. Microsoft signs the accepted Store package.

## Current certification risk

MamaLead's Maps module collects and stores Google Maps business listing data. Google Maps Platform terms prohibit scraping and exporting Maps content, including saving business names and addresses. Microsoft Store policy requires explicit permission under a third-party service's terms when an app accesses or displays that service's content. Do not certify that this requirement is satisfied until you have written permission or the Store edition uses a permitted data source/workflow.
