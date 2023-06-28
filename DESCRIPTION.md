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

    sudo npm -g install cloudron-surfer


Login using your Cloudron credentials:

    surfer login --server <appdomain> --token <apiAccessToken>


Put some files:

    surfer put [file]
