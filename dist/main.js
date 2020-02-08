'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getCurrentRegistry = getCurrentRegistry;
exports.getCustomRegistry = getCustomRegistry;
exports.getAllRegistry = getAllRegistry;

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _commander = require('commander');

var _commander2 = _interopRequireDefault(_commander);

var _npm = require('npm');

var _npm2 = _interopRequireDefault(_npm);

var _ini = require('ini');

var _ini2 = _interopRequireDefault(_ini);

var _nodeEcho = require('node-echo');

var _nodeEcho2 = _interopRequireDefault(_nodeEcho);

var _extend = require('extend');

var _extend2 = _interopRequireDefault(_extend);

var _open = require('open');

var _open2 = _interopRequireDefault(_open);

var _async = require('async');

var _async2 = _interopRequireDefault(_async);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _only = require('only');

var _only2 = _interopRequireDefault(_only);

var _registries = require('./registries.json');

var _registries2 = _interopRequireDefault(_registries);

var _package = require('../package.json');

var _package2 = _interopRequireDefault(_package);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const YRMRC = _path2.default.join(process.env.HOME, '.yrmrc');
const YARNRC = _path2.default.join(process.env.HOME, '.yarnrc');

_commander2.default.version(_package2.default.version);

_commander2.default.command('ls').description('List all the registries').action(onList);

_commander2.default.command('current').description('Show current registry name').action(showCurrent);

_commander2.default.command('use <registry>').description('Change registry to registry').action(onUse);

_commander2.default.command('add <registry> <url> [home]').description('Add one custom registry').action(onAdd);

_commander2.default.command('del <registry>').description('Delete one custom registry').action(onDel);

_commander2.default.command('home <registry> [browser]').description('Open the homepage of registry with optional browser').action(onHome);

_commander2.default.command('test [registry]').description('Show response time for specific or all registries').action(onTest);

_commander2.default.command('help').description('Print this help').action(_commander2.default.help);

_commander2.default.parse(process.argv);

if (process.argv.length === 2) {
  _commander2.default.outputHelp();
}

/*//////////////// cmd methods /////////////////*/

function onList() {
  getCurrentRegistry(function (cur) {
    let info = [''];
    let allRegistries = getAllRegistry();

    Object.keys(allRegistries).forEach(function (key) {
      let item = allRegistries[key];
      let prefix = item.registry === cur ? '* ' : '  ';
      info.push(prefix + key + line(key, 8) + item.registry);
    });

    info.push('');
    printMsg(info);
  });
}

function showCurrent() {
  getCurrentRegistry(function (cur) {
    let allRegistries = getAllRegistry();
    Object.keys(allRegistries).forEach(function (key) {
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

    _fs2.default.writeFile(YARNRC, 'registry "' + registry.registry + '"', function (err) {
      if (err) throw err;
      // console.log('It\'s saved!');

      printMsg(['', '   YARN Registry has been set to: ' + registry.registry, '']);
    });

    // 同时更改npm的源
    _npm2.default.load(function (err) {
      if (err) return exit(err);

      _npm2.default.commands.config(['set', 'registry', registry.registry], function (err, data) {
        if (err) return exit(err);
        console.log('                        ');
        let newR = _npm2.default.config.get('registry');
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
  getCurrentRegistry(function (cur) {
    if (cur === customRegistries[name].registry) {
      onUse('npm');
    }
    delete customRegistries[name];
    setCustomRegistry(customRegistries, function (err) {
      if (err) return exit(err);
      printMsg(['', '    delete registry ' + name + ' success', '']);
    });
  });
}

function onAdd(name, url, home) {
  let customRegistries = getCustomRegistry();
  if (customRegistries.hasOwnProperty(name)) return;
  let config = customRegistries[name] = {};
  if (url[url.length - 1] !== '/') url += '/'; // ensure url end with /
  config.registry = url;
  if (home) {
    config.home = home;
  }
  setCustomRegistry(customRegistries, function (err) {
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
    _open2.default.apply(null, args);
  }
}

function onTest(registry) {
  let allRegistries = getAllRegistry();

  let toTest;

  if (registry) {
    if (!allRegistries.hasOwnProperty(registry)) {
      return;
    }
    toTest = (0, _only2.default)(allRegistries, registry);
  } else {
    toTest = allRegistries;
  }

  _async2.default.map(Object.keys(toTest), function (name, cbk) {
    let registry = toTest[name];
    let start = +new Date();
    (0, _request2.default)(registry.registry + 'pedding', function (error) {
      cbk(null, {
        name: name,
        registry: registry.registry,
        time: +new Date() - start,
        error: !!error
      });
    });
  }, function (err, results) {
    getCurrentRegistry(function (cur) {
      let msg = [''];
      results.forEach(function (result) {
        let prefix = result.registry === cur ? '* ' : '  ';
        let suffix = result.error ? 'Fetch Error' : result.time + 'ms';
        msg.push(prefix + result.name + line(result.name, 8) + suffix);
      });
      msg.push('');
      printMsg(msg);
    });
  });
}

/*//////////////// helper methods /////////////////*/

/*
 * get current registry
 */
function getCurrentRegistry(cbk) {
  _npm2.default.load(function (err, conf) {
    if (err) return exit(err);
    cbk(_npm2.default.config.get('registry'));
  });
}

function getCustomRegistry() {
  return _fs2.default.existsSync(YRMRC) ? _ini2.default.parse(_fs2.default.readFileSync(YRMRC, 'utf-8')) : {};
}

function setCustomRegistry(config, cbk) {
  (0, _nodeEcho2.default)(_ini2.default.stringify(config), '>', YRMRC, cbk);
}

function getAllRegistry() {
  return (0, _extend2.default)({}, _registries2.default, getCustomRegistry());
}

function printErr(err) {
  console.error('an error occured: ' + err);
}

function printMsg(infos) {
  infos.forEach(function (info) {
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