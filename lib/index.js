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
    options: {}, //socket.io options
    routes: [{
      namespace: '/', //default
      // middlewares: [],
      socket: {
        event: 'call'
        // middlewares:[],
        // whitelist: [],
        // callOptions: {}
      }
    }]
  },
  created() {
    // this.routes = {} //handlers
    // for(let item of this.settings.routes){ //attach new actions
    //   this.logger.info('Add handler:', item)
    //   this.routes[item.event] = this.makeHandler(item)
    // }
    this.handlers = {}; //
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = this.settings.routes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        let item = _step.value;

        this.logger.info('Add handler:', item);
        if (!this.handlers[item.namespace]) this.handlers[item.namespace] = {};
        this.handlers[item.namespace][item.socket.event] = this.makeHandler(item);
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
  },
  methods: {
    listen(server) {
      this.io = IO.listen(server);
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
    makeHandler: function makeHandler(item) {
      let namespace = item.namespace;
      let eventName = item.socket.event;
      let whitelist = item.socket.whitelist;
      let opts = item.socket.callOptions;
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
      throw new Error('No io object.');
    }
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = this.settings.routes[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        let item = _step2.value;

        let nsp = item.namespace || '/';
        let eventName = item.socket.event;
        let namespace = this.io.of(nsp);
        if (item.middlewares) {
          //Server middlewares
          var _iteratorNormalCompletion3 = true;
          var _didIteratorError3 = false;
          var _iteratorError3 = undefined;

          try {
            for (var _iterator3 = item.middlewares[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
              let middleware = _step3.value;

              namespace.use(middleware);
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

        namespace.on('connection', socket => {
          this.logger.info(`[${nsp}]Client connected:`, socket.id);
          if (item.socket.middlewares) {
            //socketmiddlewares
            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
              for (var _iterator4 = item.socket.middlewares[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                let middleware = _step4.value;

                socket.use(middleware);
              }
            } catch (err) {
              _didIteratorError4 = true;
              _iteratorError4 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion4 && _iterator4.return) {
                  _iterator4.return();
                }
              } finally {
                if (_didIteratorError4) {
                  throw _iteratorError4;
                }
              }
            }
          }
          debug('Attach event:', eventName);
          socket.on(eventName, this.handlers[nsp][eventName]);
        });
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

    this.io.on('connection', client => {
      this.logger.info('Client connected:', client.id);
      for (let event in this.routes) {
        debug('Attach event:', event);
        client.on(event, this.routes[event]); //attach to socket
      }
    });
  }
};