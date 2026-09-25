### Overview

Surfer is a Simple static file server. It comes with a webinterface and commandline tooling to manage files.

Any `index.html` file in a directory will be served up automatically.

Additionaly, the public site can be password or user protected.

### Webinterface

 * Upload files
 * Create directories
 * Remove files and directories

### Commandline tool

First, install the surfer cli tool using npm.

    sudo npm -g install @cloudron/surfer


Configure the CLI with your app domain and a Cloudron app password (created in the Cloudron dashboard profile):

    surfer config --server <appdomain> --username <username> --password <appPassword>


Put some files:

    surfer put [file]

Replace the whole site with the contents of a directory:

    surfer deploy ./dist -m "Build from commit abc"
