# Surfer

Surfer is a Simple static file server. It comes with a commandline tool to upload files from your local folders and a webinterface
to manage files directly on the server.

# Development

```bash
git clone https://git.cloudron.io/s42/surfer.git
cd surfer
npm install
npm run build
```

To run the server, you need OIDC credentials from your OIDC provider.

```bash
export OIDC_ISSUER_ORIGIN="https://my.nebulon.space/openid"
export CLOUDRON_APP_ORIGIN="http://localhost:3000"
export OIDC_CLIENT_ID="surfer"
export OIDC_CLIENT_SECRET="secret"

node ./server.js /path/to/staticfolder /path/to/db.sqlite /path/to/favicon.png
```

# File management

The admin interface is available under the `/_admin` location or you can upload files using the commandline tool.

First, install the surfer cli tool using npm.

```bash
npm -g install @cloudron/surfer
```

Configure the CLI with your app domain and a Cloudron app password (created in the Cloudron dashboard profile):

```bash
surfer config --server <url> --username <username> --password <appPassword>
```

Put some files:

```bash
surfer put [file]
```

Replace the whole site with the contents of a directory:

```bash
surfer deploy ./dist -m "Build from commit abc"
```

