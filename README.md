# Surfer

Surfer is a Simple static file server. It comes with a commandline tool to upload files from your local folders and a webinterface
to manage files directly on the server.

# Development

```bash
git clone https://git.cloudron.io/apps/surfer.git
cd surfer
npm install
npm run build
```

To run the server, you need OIDC credentials from your OIDC provider.

```bash
export OIDC_ISSUER="https://my.nebulon.space"
export APP_ORIGIN="http://localhost:3000"
export OIDC_CLIENT_ID="surfer"
export OIDC_CLIENT_SECRET="secret"
export OIDC_CALLBACK_PATH="/api/oidc/callback'
export OIDC_LOGOUT_PATH="/api/oidc/logout"

node ./server.js /path/to/staticfolder /path/to/config.json /path/to/favicon.png
```

# File management

The admin interface is available under the `/_admin` location or you can upload files using the commandline tool.

First, install the surfer cli tool using npm.

```bash
npm -g install cloudron-surfer
```

Configure cli using your app domain and an API token created via the surfer admin user interface:

```bash
surfer config --server <url> --token <apiAccessToken>
```

Put some files:

```bash
surfer put [file]
```

