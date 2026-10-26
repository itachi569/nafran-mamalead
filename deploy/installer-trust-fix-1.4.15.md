# MamaLead installer publisher: administrator fix

26 October 2026. Source deployment has succeeded at commit
`1e7764c7f8e6da52e248a3f3e3b339b626eca60f`. No further source approval is needed.

The signed 1.4.15 installer, blockmap, latest.yml and SHA256SUMS are staged at
`/home/ahmed/deploy-staging/1.4.15/signed/`.

The new root-owned publisher fails because its default Linux CA bundle does not
trust Microsoft Identity Verification Root Certificate Authority 2020.
Windows Authenticode verification reports **Valid, Nafran LTD**. A diagnostic
`osslsigncode verify` with Microsoft's official root explicitly supplied reports
**Signature CRL verification: ok; Signature verification: ok; Succeeded**.
The public download and update feed still select 1.4.14.

## Administrator action

Configure `/usr/local/libexec/mamalead-installer-publish` to use a root-owned,
dedicated certificate file for its Authenticode and timestamp verification.
Keep signature checks enabled. This avoids changing the system-wide TLS store.

Official source: https://www.microsoft.com/pkiops/docs/repository.htm

Run the following as the server administrator:

```bash
set -euo pipefail
trustdir=/etc/mamalead-publish
sudo install -d -o root -g root -m 755 "$trustdir"
certtmp=$(mktemp)
trap 'rm -f "$certtmp"' EXIT
curl -fsSL --proto '=https' 'https://www.microsoft.com/pkiops/certs/Microsoft%20Identity%20Verification%20Root%20Certificate%20Authority%202020.crt' -o "$certtmp"
printf '%s  %s\n' '5367f20c7ade0e2bca790915056d086b720c33c1fa2a2661acf787e3292e1270' "$certtmp" | sha256sum -c -
sudo openssl x509 -inform DER -in "$certtmp" -out "$trustdir/microsoft-identity-root-2020.pem"
sudo chown root:root "$trustdir/microsoft-identity-root-2020.pem"
sudo chmod 644 "$trustdir/microsoft-identity-root-2020.pem"
```

Back up the publisher, then change only its verification invocation from:

```bash
osslsigncode verify -in "$installer"
```

to:

```bash
osslsigncode verify -CAfile /etc/mamalead-publish/microsoft-identity-root-2020.pem -TSA-CAfile /etc/mamalead-publish/microsoft-identity-root-2020.pem -in "$installer"
```

Retain all existing hash, version, publisher, rollback and health checks. After
the administrator completes this configuration, Ahmed can run:

```bash
mamalead-installer-publish 1.4.15
```

Installer SHA-256:
`210b07a498ff41e6838616b6ab06db4047730e98ce05b4a002658c4e1a7595be`

Diagnostic evidence:
`/home/ahmed/deploy-staging/1.4.15/verification/official-root-check.log`.

This document is a prepared administrator procedure; the root-owned publisher
has not been changed by the Ahmed session.
