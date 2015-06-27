#!/usr/bin/env node

'use strict';

var program = require('commander'),
    actions = require('./src/actions');

// Allow self signed certs!
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

program.version('0.1.0');

program.command('put')
    .description('Put a file')
    .action(actions.put);

program.command('get')
    .description('Get a file or directory')
    .action(actions.get);

program.command('del')
    .description('Delete a file')
    .action(actions.del);

program.parse(process.argv);
