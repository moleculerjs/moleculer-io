'use strict';

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const IO = require('socket.io');
const debug = require('debug')('moleculer-io');
const _ = require('lodash');
const nanomatch = require('nanomatch');

const ServiceNotFoundError = require("moleculer").Errors.ServiceNotFoundError;

var _require = require('./errors');

const BadRequestError = _require.BadRequestError;


module.exports = {
  name: 'io',
  settings: {
    // port: 3001,
    options: {}, //socket.io options
    namespaces: {
      '/': {
        // middlewares: [],
        socket: {
          // middlewares: [],
          events: {
            call: {
              // whitelist: [],
              // callOptions: {}
            }
          }
        }
      }
    }
  },
  created() {
    this.handlers = {}; //
    for (let nsp in this.settings.namespaces) {
      let item = this.settings.namespaces[nsp];
      this.logger.info('Add handler:', item);
      if (!this.handlers[nsp]) this.handlers[nsp] = {};
      let events = item.socket.events;
      for (let eventName in events) {
        this.handlers[nsp][eventName] = this.makeHandler(eventName, events[eventName].whitelist, events[eventName].callOptions);
      }
    }
  },
  methods: {
    initServer(srv, opts) {
      if ('object' == typeof srv && srv instanceof Object && !srv.listen) {
        opts = srv;
        srv = null;
      }
      opts = opts || this.settings.options;
      srv = srv || this.settings.port;
      this.io = new IO(srv, opts);
    },
    checkWhitelist(action, whitelist) {
      return whitelist.find(mask => {
        if (_.isString(mask)) {
          return nanomatch.isMatch(action, mask, { unixify: false });
        } else if (_.isRegExp(mask)) {
          return mask.test(action);
        }
      }) != null;
    },
    callAction(action, params, opts, whitelist) {
      var _this = this;

      return _asyncToGenerator(function* () {
        if (whitelist && !_this.checkWhitelist(action, whitelist)) {
          //check whitelist
          debug(`Service "${action}" not found`);
          throw new ServiceNotFoundError(action);
        }
        debug('Call action:', action, params, opts);
        return yield _this.broker.call(action, params, opts);
      })();
    },
    makeHandler: function makeHandler(eventName, whitelist, opts) {
      debug('MakeHandler', eventName);
      const svc = this;
      return (() => {
        var _ref = _asyncToGenerator(function* (action, params, respond) {
          debug(`Handle ${eventName} event:`, action, params);
          if (!_.isString(action)) {
            debug(`BadRequest:action is not string! action:`, action);
            throw new BadRequestError();
          } // validate action
          try {
            let meta = svc.getMeta(this);
            opts = _.assign({ meta }, opts);
            let res = yield svc.callAction(action, params, opts, whitelist);
            if (_.isFunction(respond)) respond(null, res);
          } catch (err) {
            debug('Call action error:', err);
            if (_.isFunction(respond)) svc.onError(err, respond);
          }
        });

        return function (_x, _x2, _x3) {
          return _ref.apply(this, arguments);
        };
      })();
    },
    getMeta(socket) {
      return {
        user: socket.client.user
      };
    },
    onError(err, respond) {
      debug('onError', err);
      const errObj = _.pick(err, ["name", "message", "code", "type", "data"]);
      return respond(errObj);
    }
  },
  started() {
    if (!this.io) {
      this.initServer();
    }
    for (let nsp in this.settings.namespaces) {
      // let nsp = item.namespace || '/'
      let item = this.settings.namespaces[nsp];
      let namespace = this.io.of(nsp);
      if (item.middlewares) {
        //Server middlewares
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = item.middlewares[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            let middleware = _step.value;

            namespace.use(middleware);
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }
      }
      namespace.on('connection', socket => {
        this.logger.info(`(nsp:'${nsp}') Client connected:`, socket.id);
        if (item.socket.middlewares) {
          //socketmiddlewares
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = this.handlers[nsp][Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              let middleware = _step2.value;

              socket.use(middleware);
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2.return) {
                _iterator2.return();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
          }
        }
        for (let eventName in item.socket.events) {
          debug('Attach event:', eventName);
          socket.on(eventName, this.handlers[nsp][eventName]);
        }
      });
    }
    // this.io.on('connection', client=>{
    //   this.logger.info('Client connected:', client.id)
    //   for(let event in this.routes){
    //     debug('Attach event:', event)
    //     client.on(event, this.routes[event]) //attach to socket
    //   }
    // })
  }
};