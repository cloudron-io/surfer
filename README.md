# Surfer

Surfer is a Simple static file server.
It comes with a commandline tool to upload files from your local folders and a webinterface to manage files directly on the server.

## Installation

[![Install](https://cloudron.io/img/button32.png)](https://cloudron.io/button.html?app=io.cloudron.surfer)

or using the [Cloudron command line tooling](https://cloudron.io/references/cli.html)

```
cloudron install --appstore-id io.cloudron.surfer
```

## Building

### Cloudron
The app package can be built using the [Cloudron command line tooling](https://cloudron.io/references/cli.html).

```
git clone https://git.cloudron.io/cloudron/surfer.git
cd surfer
cloudron build
cloudron install
```

### Standalone
Surfer can also be run standlone on any server:
```
git clone https://git.cloudron.io/cloudron/surfer.git
cd surfer
npm install
./server.js <public folder>
```
Use the `admin` tool to manage local users.

## File management

The admin interface is available under the `/_admin` location or you can upload files using the commandline tool.

First, install the surfer cli tool using npm.
```
npm -g install cloudron-surfer
```

Login using your Cloudron credentials:
```
surfer login <this app's url>
```

Put some files:
```
surfer put [file]
```

## Testing

The e2e tests are located in the `test/` folder and require [nodejs](http://nodejs.org/). They are creating a fresh build, install the app on your Cloudron, perform tests, backup, restore and test if the files are still ok.

```
cd surfer

npm install
USERNAME=<cloudron username> PASSWORD=<cloudron password> mocha --bail test/test.js
```
