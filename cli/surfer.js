#!/usr/bin/env node

'use strict';

var program = require('commander'),
    actions = require('./actions');

// Allow self signed certs!
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

program.version('0.1.0');

program.command('login <url>')
    .description('Login to server')
    .action(actions.login);

program.command('put <file> [files...]')
    .option('-d --destination <folder>', 'Destination folder. This is prepended to the relative <file> path')
    .description('Put a file')
    .action(actions.put);

program.command('get')
    .description('Get a file or directory')
    .action(actions.get);

program.command('del')
    .description('Delete a file')
    .action(actions.del);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
} else { // https://github.com/tj/commander.js/issues/338
    var knownCommand = program.commands.some(function (command) { return command._name === process.argv[2]; });
    if (!knownCommand) {
        console.error('Unknown command: ' + process.argv[2]);
        process.exit(1);
    }
}
