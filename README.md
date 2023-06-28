# Surfer

Surfer is a Simple static file server.
It comes with a commandline tool to upload files from your local folders and a webinterface to manage files directly on the server.

## Installation

[![Install](https://cloudron.io/img/button32.png)](https://cloudron.io/button.html?app=io.cloudron.surfer)

or using the [Cloudron command line tooling](https://docs.cloudron.io/packaging/cli/)

```bash
cloudron install --appstore-id io.cloudron.surfer
```

## Building

### Cloudron

The app package can be built using the [Cloudron command line tooling](https://docs.cloudron.io/packaging/cli/).

```bash
git clone https://git.cloudron.io/cloudron/surfer.git
cd surfer
cloudron build
cloudron install
```

## File management

The admin interface is available under the `/_admin` location or you can upload files using the commandline tool.

First, install the surfer cli tool using npm.

```bash
npm -g install cloudron-surfer
```

Login using your Cloudron credentials:

```bash
surfer login --server <url> --token <apiAccessToken>
```

Put some files:

```bash
surfer put [file]
```

## Development

```bash
git clone https://git.cloudron.io/cloudron/surfer.git
cd surfer
npm install
```

During UI development, the assets have to be built after changes. This can be done with

```bash
npm run build
```

While having the `./server.js` instance running.
