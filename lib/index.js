'use strict';

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const IO = require('socket.io');
const _ = require('lodash');

const match = require('moleculer').Utils.match;

const ServiceNotFoundError = require("moleculer").Errors.ServiceNotFoundError;

var _require = require('./errors');

const BadRequestError = _require.BadRequestError;

const chalk = require('chalk');

module.exports = {
  name: 'io',
  settings: {
    // port: 3000,
    io: {
      // options: {}, //socket.io options
      // adapter: redis({ host: 'localhost', port: 6379 }),
      namespaces: {
        '/': {
          // middlewares: [],
          // packetMiddlewares:[],
          events: {
            call: {
              // whitelist: [],
              // callOptions:{},
              // onBeforeCall: async function(ctx, socket, args){
              //   ctx.meta.socketid = socket.id
              // },
              // onAfterCall:async function(ctx, socket, data){
              //  socket.emit('afterCall', data)
              // }
            }
          }
        }
      }
    }
  },
  created() {
    let handlers = {};
    for (let nsp in namespaces) {
      let item = namespaces[nsp];
      debug('Add route:', item);
      if (!handlers[nsp]) handlers[nsp] = {};
      let events = item.events;
      for (let event in events) {
        let handler = events[event];
        if (typeof handler === 'function') {
          //custom handler
          handlers[nsp][event] = handler;
        } else {
          handlers[nsp][event] = makeHandler(handler);
        }
      }
    }
    this.settings.io.handlers = handlers;
  },
  started() {
    if (!this.io) {
      this.initSocketIO();
    }
    let namespaces = this.settings.namespaces;
    for (let nsp in namespaces) {
      let namespace = this.io.of(nsp);
      if (namespaces[nsp].middlewares) {
        //Server middlewares
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = namespaces[nsp].middlewares[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
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
      let handlers = this.settings.io.handlers[key];
      namespace.on('connection', socket => {
        socket.$service = this;
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
              handlerItem = _ctx$params.handlerItem;

          if (!_.isString(action)) {
            debug(`BadRequest:action is not string! action:`, action);
            throw new BadRequestError();
          }
          //Check whitelist
          if (handlerItem.whitelist && !_this.checkIOWhitelist(action, handlerItem.whitelist)) {
            debug(`Service "${action}" not found`);
            throw new ServiceNotFoundError({ action });
          }
          // Check endpoint visibility
          const endpoint = svc.broker.findNextActionEndpoint(action);
          if (endpoint instanceof Error) throw endpoint;
          if (endpoint.action.visibility != null && endpoint.action.visibility != "published") {
            // Action can't be published
            throw new ServiceNotFoundError({ action });
          }
          // get callOptions
          let opts = _.assign({
            meta: _this.getMeta(socket)
          }, handlerItem.callOptions);
          _this.logger.debug('Call action:', action, params, opts);
          if (handlerItem.onBeforeCall) {
            yield handlerItem.onBeforeCall.call(_this, ctx, socket, action, params, opts);
          }
          let res = yield ctx.call(action, params, opts);
          if (handlerItem.onAfterCall) {
            res = (yield handlerItem.onAfterCall.call(_this, ctx, socket, res)) || res;
          }
          _this.socketSaveMeta(socket, ctx);
          if (ctx.meta.$join) {
            yield _this.socketJoinRooms(socket, ctx.meta.$join);
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
    }
  },
  methods: {
    initSocketIO(srv, opts) {
      if ('object' == typeof srv && srv instanceof Object && !srv.listen) {
        opts = srv;
        srv = null;
      }
      opts = opts || this.settings.io;
      srv = srv || this.server || this.settings.port;
      this.io = new IO(srv, opts);
      if (this.settings.adapter) {
        this.io.adapter(this.settings.adapter);
      }
      this.logger.info('Socket.io API Gateway started.');
    },
    socketGetMeta() {
      let meta = {
        user: socket.client.user,
        $rooms: Object.keys(socket.rooms)
      };
      debug('getMeta', meta);
      return meta;
    },
    socketSaveMeta(socket, ctx) {
      socket.client.user = ctx.meta.user;
    },
    socketOnError(err, respond) {
      debug('onIOError', err);
      const errObj = _.pick(err, ["name", "message", "code", "type", "data"]);
      return respond(errObj);
    },
    socketJoinRooms(socket, rooms) {
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
    socketLeaveRoom(socket, room) {
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
  }
};

function checkWhitelist(action, whitelist) {
  return whitelist.find(mask => {
    if (_.isString(mask)) {
      return match(action, mask);
    } else if (_.isRegExp(mask)) {
      return mask.test(action);
    }
  }) != null;
}

function makeHandler(svc, handlerItem) {
  svc.logger.debug('makeHandler:', handlerItem);
  return (() => {
    var _ref = _asyncToGenerator(function* (action, params, respond) {
      svc.logger.info(`   => Client '${this.id}' call '${action}'`);
      if (svc.settings.logRequestParams && svc.settings.logRequestParams in svc.logger) svc.logger[svc.settings.logRequestParams]("   Params:", params);
      try {
        if (_.isFunction(params)) {
          respond = params;
          params = null;
        }
        let res = yield svc.actions.call({ socket: this, action, params, opts, handlerItem });
        svc.logger.info(`   <= ${chalk.green.bold('Success')} ${action}`);
        if (_.isFunction(respond)) respond(null, res);
      } catch (err) {
        if (svc.settings.log4XXResponses || err && !_.inRange(err.code, 400, 500)) {
          svc.logger.error("   Request error!", err.name, ":", err.message, "\n", err.stack, "\nData:", err.data);
        }
        if (_.isFunction(respond)) svc.socketOnError(err, respond);
      }
    });

    return function (_x, _x2, _x3) {
      return _ref.apply(this, arguments);
    };
  })();
}