# Nafran / MamaLead source

This repository contains the Electron desktop app at the root, the license/payment service in `billing-server/`, the owner dashboard in `admin-dashboard/`, the landing website in `website/`, and server service/backup source in `deploy/`.

Deployment credentials, customer data, local databases, SSH keys, and generated installers are deliberately excluded. Configure server environment variables from the relevant `.env.example` files. The existing Vercel configuration files are historical source; the current intended billing deployment is self-hosted. `deploy/DEPLOYMENT-STATUS.md` is a dated record, not a live health report.

For desktop setup, build, tests, and packaging, see `README.md` and `package.json`. For the owner dashboard and billing service, see their respective source directories.
