#!/usr/bin/env node

'use strict';

var program = require('commander'),
    actions = require('./actions');

program.version(require('../package.json').version);

// Those override the login settings if provided
program.option('-s, --server <url>', 'Server URL (optional)');
program.option('-t, --token <access token>', 'Server Access Token (optional)');

program.command('login <url>')
    .description('Login to server')
    .option('--username [username]', 'Username (optional)')
    .option('--password [password]', 'Password (optional)')
    .action(actions.login);

program.command('logout')
    .description('Logout from server')
    .action(actions.logout);

program.command('put <file|dir...>')
    .option('-a --all', 'Also include hidden files and folders.', false)
    .option('-d --delete', 'Delete extraneous files from dest dirs.', false)
    .description('Uploads a list of files or dirs to the destination. The last argument is destination dir')
    .action(actions.put)
    .on('--help', function() {
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ surfer put file.txt /                # puts to /file.txt');
        console.log('    $ surfer put file.txt /data            # puts to /data/file.txt');
        console.log('    $ surfer put dir /data                 # puts dir/* as /data/dir/*');
        console.log('    $ surfer put dir/* /                   # puts dir/* as /app/data/*');
        console.log('    $ surfer put dir1 dir2 file1 /         # puts as /dir1/* /dir2/* and /file');
        console.log();
    });

program.command('get [file|dir]')
    .description('Get a file or directory listing')
    .action(actions.get);

program.command('del <file>')
    .option('-r --recursive', 'Recursive delete directories.', false)
    .description('Delete a file or directory')
    .action(actions.del);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
} else { // https://github.com/tj/commander.js/issues/338
    // var knownCommand = program.commands.some(function (command) { return command._name === process.argv[2]; });
    // if (!knownCommand) {
    //     console.error('Unknown command: ' + process.argv[2]);
    //     process.exit(1);
    // }
}
