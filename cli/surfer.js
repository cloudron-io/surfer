#!/usr/bin/env node

'use strict';

import { Command } from 'commander';
import actions from './actions.js';
import fs from 'fs';

const program = new Command();

program.version(JSON.parse(fs.readFileSync(import.meta.dirname + '/../package.json', 'utf8')).version);

program.command('login')
    .description('Unsupported')
    .action(actions.login);

program.command('logout')
    .description('Unsupported')
    .action(actions.logout);

program.command('config')
    .description('Configure default server')
    .alias('configure')
    .requiredOption('-s, --server <domain>', 'Surfer Server Domain')
    .requiredOption('-t, --token <access token>', 'Server Access Token')
    .action(actions.config);

program.command('put <file|dir...>')
    .option('-a --all', 'Also include hidden files and folders.', false)
    .option('-d --delete', 'Delete extraneous files from dest dirs.', false)
    .option('-s, --server <domain>', 'Surfer Server Domain (optional)')
    .option('-t, --token <access token>', 'Server Access Token (optional)')
    .description('Uploads a list of files or dirs to the destination. The last argument is destination dir')
    .action(actions.put)
    .on('--help', function() {
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ surfer put file.txt /                # puts to /file.txt');
        console.log('    $ surfer put file.txt /data            # puts to /data/file.txt');
        console.log('    $ surfer put dir /data                 # puts dir/* as /data/dir/*');
        console.log('    $ surfer put dir/* /                   # puts dir/* as /*');
        console.log('    $ surfer put dir1 dir2 file1 /         # puts as /dir1/* /dir2/* and /file');
        console.log();
    });

program.command('get [file|dir]')
    .description('Get a file or directory listing')
    .option('-s, --server <domain>', 'Surfer Server Domain (optional)')
    .option('-t, --token <access token>', 'Server Access Token (optional)')
    .action(actions.get);

program.command('del <file>')
    .option('-r --recursive', 'Recursive delete directories.', false)
    .option('-y --yes', 'Answer questions always with yes.', false)
    .option('-s, --server <domain>', 'Surfer Server Domain (optional)')
    .option('-t, --token <access token>', 'Server Access Token (optional)')
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
