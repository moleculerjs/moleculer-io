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
    // port: 3000,
    // options: {}, //socket.io options
    namespaces: {
      '/': {
        // middlewares:[],
        // packetMiddlewares:[],
        events: {
          'call': {
            // type: 'call',
            // whitelist: [],
            // callOptions:{}
          }
        }
      }
    }
  },
  created() {
    this.handlers = {}; //
    let namespaces = this.settings.namespaces;
    for (let nsp in namespaces) {
      let item = namespaces[nsp];
      this.logger.info('Add route:', item);
      if (!this.handlers[nsp]) this.handlers[nsp] = {};
      let events = item.events;
      for (let event in events) {
        let handlerItem = events[event];
        if (typeof handlerItem === 'function') {
          //custom handler
          this.handlers[nsp][event] = handlerItem;
          return;
        }
        switch (handlerItem.type || 'call') {
          case 'call':
            this.handlers[nsp][event] = this.makeHandler(handlerItem);
            break;
          case 'login':
            this.handlers[nsp][event] = this.makeLoginHandler(handlerItem);
            break;
          default:
            throw new Error(`Unknow handler type: ${handlerItem.type}`);
        }
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
    makeHandler: function makeHandler(handlerItem) {
      let eventName = handlerItem.event;
      let whitelist = handlerItem.whitelist;
      let opts = handlerItem.callOptions;
      const svc = this;
      debug('MakeHandler', eventName);
      return (() => {
        var _ref = _asyncToGenerator(function* (action, params, respond) {
          debug(`Handle ${eventName} event:`, action);
          if (!_.isString(action)) {
            debug(`BadRequest:action is not string! action:`, action);
            throw new BadRequestError();
          }
          if (_.isFunction(params)) {
            respond = params;
            params = null;
          }
          try {
            let meta = svc.getMeta(this);
            let res = yield svc.callAction(action, params, _.assign({ meta }, opts), whitelist);
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
    makeLoginHandler: function makeLoginHandler(handlerItem) {
      let handler = this.makeHandler(handlerItem);
      return (() => {
        var _ref2 = _asyncToGenerator(function* (action, params, respond) {
          let socket = this;
          handler.call(socket, action, params, function (err, res) {
            if (err) return respond(err);
            socket.client.user = res;
            respond(err, res);
          });
        });

        return function (_x4, _x5, _x6) {
          return _ref2.apply(this, arguments);
        };
      })();
    },
    getMeta(socket) {
      debug('getMeta', socket.client.user);
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
    let namespaces = this.settings.namespaces;
    for (let nsp in namespaces) {
      let item = namespaces[nsp];
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
      let handlers = this.handlers[nsp];
      namespace.on('connection', socket => {
        this.logger.info(`(nsp:'${nsp}') Client connected:`, socket.id);
        if (item.packetMiddlewares) {
          //socketmiddlewares
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = item.packetMiddlewares[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
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
        for (let eventName in handlers) {
          debug('Attach event:', eventName);
          socket.on(eventName, handlers[eventName]);
        }
      });
    }
  },
  actions: {
    broadcast: {
      params: {
        event: { type: 'string' },
        namespace: { type: 'string', optional: true },
        args: { type: 'array', optional: true },
        volatile: { type: 'boolean', optional: true },
        local: { type: 'boolean', optional: true },
        rooms: { type: 'array', items: 'string', optional: true }
      },
      handler(ctx) {
        var _this2 = this;

        return _asyncToGenerator(function* () {
          let namespace = _this2.io;
          if (ctx.params.namespace) {
            namespace = namespace.of(ctx.params.namespace);
          }
          if (ctx.params.volate) namespace = namespace.volate;
          if (ctx.params.local) namespace = namespace.local;
          if (ctx.params.rooms) {
            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
              for (var _iterator3 = ctx.params.rooms[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                let room = _step3.value;

                namespace = namespace.to(room);
              }
            } catch (err) {
              _didIteratorError3 = true;
              _iteratorError3 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion3 && _iterator3.return) {
                  _iterator3.return();
                }
              } finally {
                if (_didIteratorError3) {
                  throw _iteratorError3;
                }
              }
            }
          }
          namespace.emit(event, ...ctx.params.args);
        })();
      }
    }
  }
};