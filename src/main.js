import path from 'path';
import fs from 'fs';
import program from 'commander';
import npm from 'npm';
import ini from 'ini';
import echo from 'node-echo';
import extend from 'extend';
import open from 'open';
import async from 'async';
import request from 'request';
import only from 'only';
import registries from '../registries.json';
import PKG from '../package.json';

const YRMRC = path.join(process.env.HOME, '.yrmrc');
const YARNRC = path.join(process.env.HOME, '.yarnrc');

program.version(PKG.version);

program
  .command('ls')
  .description('List all the registries')
  .action(onList);

program
  .command('current')
  .description('Show current registry name')
  .action(showCurrent);

program
  .command('use <registry>')
  .description('Change registry to registry')
  .action(onUse);

program
  .command('add <registry> <url> [home]')
  .description('Add one custom registry')
  .action(onAdd);

program
  .command('del <registry>')
  .description('Delete one custom registry')
  .action(onDel);

program
  .command('home <registry> [browser]')
  .description('Open the homepage of registry with optional browser')
  .action(onHome);

program
  .command('test [registry]')
  .description('Show response time for specific or all registries')
  .action(onTest);

program
  .command('help')
  .description('Print this help')
  .action(program.help);

program.parse(process.argv);

if (process.argv.length === 2) {
  program.outputHelp();
}

/*//////////////// cmd methods /////////////////*/

function onList() {
  getCurrentRegistry(function(cur) {
    let info = [''];
    let allRegistries = getAllRegistry();

    Object.keys(allRegistries).forEach(function(key) {
      let item = allRegistries[key];
      let prefix = item.registry === cur ? '* ' : '  ';
      info.push(prefix + key + line(key, 8) + item.registry);
    });

    info.push('');
    printMsg(info);
  });
}

function showCurrent() {
  getCurrentRegistry(function(cur) {
    let allRegistries = getAllRegistry();
    Object.keys(allRegistries).forEach(function(key) {
      let item = allRegistries[key];
      if (item.registry === cur) {
        printMsg([key]);
      }
    });
  });
}

function onUse(name) {
  let allRegistries = getAllRegistry();
  if (allRegistries.hasOwnProperty(name)) {
    let registry = allRegistries[name];

    fs.writeFile(YARNRC, 'registry "' + registry.registry + '"', function(err) {
      if (err) throw err;
      // console.log('It\'s saved!');

      printMsg(['', '   YARN Registry has been set to: ' + registry.registry, '']);
    });

    // 同时更改npm的源
    npm.load(function(err) {
      if (err) return exit(err);

      npm.commands.config(['set', 'registry', registry.registry], function(err, data) {
        if (err) return exit(err);
        console.log('                        ');
        let newR = npm.config.get('registry');
        printMsg(['', '   NPM Registry has been set to: ' + newR, '']);
      });
    });
  } else {
    printMsg(['', '   Not find registry: ' + name, '']);
  }
}

function onDel(name) {
  let customRegistries = getCustomRegistry();
  if (!customRegistries.hasOwnProperty(name)) return;
  getCurrentRegistry(function(cur) {
    if (cur === customRegistries[name].registry) {
      onUse('npm');
    }
    delete customRegistries[name];
    setCustomRegistry(customRegistries, function(err) {
      if (err) return exit(err);
      printMsg(['', '    delete registry ' + name + ' success', '']);
    });
  });
}

function onAdd(name, url, home) {
  let customRegistries = getCustomRegistry();
  if (customRegistries.hasOwnProperty(name)) return;
  let config = (customRegistries[name] = {});
  if (url[url.length - 1] !== '/') url += '/'; // ensure url end with /
  config.registry = url;
  if (home) {
    config.home = home;
  }
  setCustomRegistry(customRegistries, function(err) {
    if (err) return exit(err);
    printMsg(['', '    add registry ' + name + ' success', '']);
  });
}

function onHome(name, browser) {
  let allRegistries = getAllRegistry();
  let home = allRegistries[name] && allRegistries[name].home;
  if (home) {
    let args = [home];
    if (browser) args.push(browser);
    open.apply(null, args);
  }
}

function onTest(registry) {
  let allRegistries = getAllRegistry();

  let toTest;

  if (registry) {
    if (!allRegistries.hasOwnProperty(registry)) {
      return;
    }
    toTest = only(allRegistries, registry);
  } else {
    toTest = allRegistries;
  }

  async.map(
    Object.keys(toTest),
    function(name, cbk) {
      let registry = toTest[name];
      let start = +new Date();
      request(registry.registry + 'pedding', function(error) {
        cbk(null, {
          name: name,
          registry: registry.registry,
          time: +new Date() - start,
          error: !!error,
        });
      });
    },
    function(err, results) {
      getCurrentRegistry(function(cur) {
        let msg = [''];
        results.forEach(function(result) {
          let prefix = result.registry === cur ? '* ' : '  ';
          let suffix = result.error ? 'Fetch Error' : result.time + 'ms';
          msg.push(prefix + result.name + line(result.name, 8) + suffix);
        });
        msg.push('');
        printMsg(msg);
      });
    },
  );
}

/*//////////////// helper methods /////////////////*/

/*
 * get current registry
 */
export function getCurrentRegistry(cbk) {
  npm.load(function(err, conf) {
    if (err) return exit(err);
    cbk(npm.config.get('registry'));
  });
}

export function getCustomRegistry() {
  return fs.existsSync(YRMRC) ? ini.parse(fs.readFileSync(YRMRC, 'utf-8')) : {};
}

function setCustomRegistry(config, cbk) {
  echo(ini.stringify(config), '>', YRMRC, cbk);
}

export function getAllRegistry() {
  return extend({}, registries, getCustomRegistry());
}

function printErr(err) {
  console.error('an error occured: ' + err);
}

function printMsg(infos) {
  infos.forEach(function(info) {
    console.log(info);
  });
}

/*
 * print message & exit
 */
function exit(err) {
  printErr(err);
  process.exit(1);
}

function line(str, len) {
  let line = new Array(Math.max(1, len - str.length)).join('-');
  return ' ' + line + ' ';
}
