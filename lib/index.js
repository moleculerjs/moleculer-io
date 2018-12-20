'use strict';

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const IO = require('socket.io');
const debug = require('debug')('moleculer-io');
const _ = require('lodash');

const match = require("moleculer").Utils.match;

const ServiceNotFoundError = require("moleculer").Errors.ServiceNotFoundError;

var _require = require('./errors');

const BadRequestError = _require.BadRequestError;

const chalk = require('chalk');

module.exports = {
  name: 'io',
  settings: {
    // port: 3000,
    // io: {}, //socket.io options
    // adapter: { module: require('socket.io-redis'), options: { host: 'redis', port: 6379 }}
    namespaces: {
      '/': {
        // middlewares:[],
        // packetMiddlewares:[],
        events: {
          'call': {
            // whitelist: [],
            // callOptions:{},
            // before: async function(ctx, socket, args){
            //   debug('before hook:', args)
            // },
            // after:async function(ctx, socket, res){
            //   debug('after hook', res)
            // }
          }
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
      opts = opts || this.settings.io;
      srv = srv || this.server || this.settings.port;
      this.io = new IO(srv, opts);
      if (this.settings.adapter && this.settings.adapter.module) {
        this.io.adapter(this.settings.adapter.module(this.settings.adapter.options));
      }
      this.logger.info('Socket.io API Gateway started.');
    },
    checkIOWhitelist(action, whitelist) {
      return whitelist.find(mask => {
        if (_.isString(mask)) {
          return match(action, mask);
        } else if (_.isRegExp(mask)) {
          return mask.test(action);
        }
      }) != null;
    },
    makeIOHandler: function makeIOHandler(handlerItem) {
      let whitelist = handlerItem.whitelist;
      let opts = handlerItem.callOptions;
      const svc = this;
      debug('makeIOHandler', handlerItem);
      return (() => {
        var _ref = _asyncToGenerator(function* (action, params, respond) {
          svc.logger.info(`   => Client '${this.id}' call '${action}' action`);
          if (svc.settings.logRequestParams && svc.settings.logRequestParams in svc.logger) svc.logger[svc.settings.logRequestParams]("   Params:", params);
          if (_.isFunction(params)) {
            respond = params;
            params = null;
          }
          try {
            let res = yield svc.actions.call({ socket: this, action, params, opts, handlerItem });
            svc.logger.info(`   <= ${chalk.green.bold('Success')} ${action}`);
            if (_.isFunction(respond)) respond(null, res);
          } catch (err) {
            if (svc.settings.log4XXResponses || err && !_.inRange(err.code, 400, 500)) {
              svc.logger.error("   Request error!", err.name, ":", err.message, "\n", err.stack, "\nData:", err.data);
            }
            if (_.isFunction(respond)) svc.onIOError(err, respond);
          }
        });

        return function (_x, _x2, _x3) {
          return _ref.apply(this, arguments);
        };
      })();
    },
    getMeta(socket) {
      let meta = {
        user: socket.client.user,
        $rooms: Object.keys(socket.rooms)
      };
      debug('getMeta', meta);
      return meta;
    },
    saveUser(socket, ctx) {
      socket.client.user = ctx.meta.user;
    },
    onIOError(err, respond) {
      debug('onIOError', err);
      const errObj = _.pick(err, ["name", "message", "code", "type", "data"]);
      return respond(errObj);
    },
    joinRooms(socket, rooms) {
      debug(`socket ${socket.id} join room:`, rooms);
      return new Promise(function (resolve, reject) {
        socket.join(rooms, err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
    leaveRoom(socket, room) {
      return new Promise(function (resolve, reject) {
        socket.leave(room, err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
  },
  created() {
    this.handlers = {}; //
    let namespaces = this.settings.namespaces;
    for (let nsp in namespaces) {
      let item = namespaces[nsp];
      debug('Add route:', item);
      if (!this.handlers[nsp]) this.handlers[nsp] = {};
      let events = item.events;
      for (let event in events) {
        let handlerItem = events[event];
        if (typeof handlerItem === 'function') {
          //custom handler
          this.handlers[nsp][event] = handlerItem.bind(this);
          return;
        }
        this.handlers[nsp][event] = this.makeIOHandler(handlerItem);
      }
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

            namespace.use(middleware.bind(this));
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

              socket.use(middleware.bind(this));
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
  stopped() {
    if (this.io) {
      return new Promise((resolve, reject) => {
        this.io.close(err => {
          // if (err)
          //   return reject(err) //Ignore this error
          this.logger.info("Socket.io API Gateway stopped!");
          resolve();
        });
      });
    }
  },
  actions: {
    call: {
      visibility: "private",
      handler(ctx) {
        var _this = this;

        return _asyncToGenerator(function* () {
          var _ctx$params = ctx.params;
          let socket = _ctx$params.socket,
              action = _ctx$params.action,
              params = _ctx$params.params,
              opts = _ctx$params.opts,
              handlerItem = _ctx$params.handlerItem;

          if (!_.isString(action)) {
            debug(`BadRequest:action is not string! action:`, action);
            throw new BadRequestError();
          }
          if (handlerItem.whitelist && !_this.checkIOWhitelist(action, handlerItem.whitelist)) {
            debug(`Service "${action}" not found`);
            throw new ServiceNotFoundError({ action });
          }
          const endpoint = _this.broker.findNextActionEndpoint(action);
          if (endpoint instanceof Error) throw endpoint;
          // Check endpoint visibility
          if (endpoint.action.visibility != null && endpoint.action.visibility != "published") {
            // Action can't be published
            throw new ServiceNotFoundError({ action });
          }
          let meta = _this.getMeta(socket);
          opts = _.assign({ meta }, opts);
          debug('Call action:', action, params, opts);
          // const vName = this.version ? `v${this.version}.${this.name}` : this.name
          // const ctx = Context.create(this.broker, {name: vName + ".call"}, this.broker.nodeID, params, opts || {})
          let args = { action, params, callOptions: opts };
          if (handlerItem.before) {
            yield handlerItem.before.call(_this, ctx, socket, args);
          }
          let res = yield ctx.call(args.action, args.params, args.callOptions);
          if (handlerItem.after) {
            yield handlerItem.after.call(_this, ctx, socket, res);
          }
          _this.saveUser(socket, ctx);
          if (ctx.meta.$join) {
            yield _this.joinRooms(socket, ctx.meta.$join);
          }
          if (ctx.meta.$leave) {
            if (_.isArray(ctx.meta.$leave)) {
              yield Promise.all(ctx.meta.$leave.map(function (room) {
                return _this.leaveRoom(socket, room);
              }));
            } else {
              yield _this.leaveRoom(socket, ctx.meta.$leave);
            }
          }
          return res;
        })();
      }
    },
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
          debug('brocast: ', ctx.params);
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
          namespace.emit(ctx.params.event, ...ctx.params.args);
        })();
      }
    }
  }
};