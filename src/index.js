/*
 * moleculer-io
 * Copyright (c) 2022 MoleculerJS (https://github.com/moleculerjs/moleculer-io)
 * MIT Licensed
 */

"use strict";

const { Server: IO } = require("socket.io");
const _ = require("lodash");
const { match } = require("moleculer").Utils;
const { ServiceNotFoundError } = require("moleculer").Errors;
const { BadRequestError } = require("./errors");
const kleur = require("kleur");
const { METRIC } = require("moleculer");
const C = require("./constants");

/** @type {import('moleculer').ServiceSchema SocketIOMixin}*/
module.exports = {
	name: "io",

	settings: {
		// port: 3000,
		server: true,
		io: {
			/** @type {import('socket.io').ServerOptions} */
			// options: {}, //socket.io options
			/** @type {Record<String, HandlerItem} */
			namespaces: {
				"/": {
					// authorization: false,
					// middlewares: [],
					// packetMiddlewares:[],
					events: {
						call: {
							// whitelist: [],
							// aliases: {},
							// mappingPolicy: 'all',
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

	/** @this {import('moleculer').Service} */
	created() {
		registerMetrics(this.broker);

		const handlers = {};
		/** @type {Record<String, HandlerItem>} */
		const namespaces = this.settings.io.namespaces;
		for (const nsp in namespaces) {
			const item = namespaces[nsp];
			this.logWithLevel(this.settings.logRouteRegistration, `Add '${nsp}' route:`, item);
			if (!handlers[nsp]) handlers[nsp] = {};

			const events = item.events;
			for (const event in events) {
				const handler = events[event];
				if (typeof handler === "function") {
					//custom handler
					handlers[nsp][event] = handler;
				} else {
					handlers[nsp][event] = makeHandler(this, handler);
				}
			}
		}
		this.settings.io.handlers = handlers;
	},

	/** @this {import('moleculer').Service} */
	started() {
		if (!this.io) {
			this.initSocketIO();
		}
		/** @type {Record<String, HandlerItem>} Register default namespaces */
		const namespaces = this.settings.io.namespaces;
		Object.keys(namespaces).forEach(nsp => {
			const item = namespaces[nsp];

			if (item.createNamespace !== false) this.registerNamespace(nsp, nsp, item);
		});

		this.logger.info("Socket.IO Websocket Gateway started.");
	},

	/** @this {import('moleculer').Service} */
	stopped() {
		if (this.io) {
			return this.io.close();
		}
	},

	actions: {
		/**
		 * Invoke a Moleculer action, request received via socket.io
		 */
		call: {
			visibility: "private",
			tracing: {
				tags: {
					params: ["action", "params"]
				}
				//spanName: ctx => `${ctx.params.req.method} ${ctx.params.req.url}`
			},
			/**
			 *
			 * @param {import('moleculer').Context<CallActionParams, CallActionMeta>} ctx
			 * @returns
			 */
			async handler(ctx) {
				let { socket, action, params, handlerItem } = ctx.params;
				if (!_.isString(action)) {
					this.logger.debug(`BadRequest: action is not string! action:`, action);
					throw new BadRequestError();
				}
				// Handle aliases
				if (handlerItem.aliases) {
					const alias = handlerItem.aliases[action];
					if (alias) {
						action = alias;
					} else if (handlerItem.mappingPolicy === "restrict") {
						/* istanbul ignore next */
						throw new ServiceNotFoundError({ action });
					}
				} else if (handlerItem.mappingPolicy === "restrict") {
					/* istanbul ignore next */
					throw new ServiceNotFoundError({ action });
				}
				//Check whitelist
				if (handlerItem.whitelist && !checkWhitelist(action, handlerItem.whitelist)) {
					this.logger.debug(`Service "${action}" not in whitelist`);
					throw new ServiceNotFoundError({ action });
				}
				// get callOptions
				const opts = _.assign(
					{
						meta: this.socketGetMeta(socket)
					},
					handlerItem.callOptions
				);

				// Check endpoint visibility
				const endpoint = this.broker.findNextActionEndpoint(action, opts, ctx);
				if (endpoint instanceof Error) throw endpoint;
				if (
					endpoint.action.visibility != null &&
					endpoint.action.visibility !== "published"
				) {
					// Action can't be published
					/* istanbul ignore next */
					throw new ServiceNotFoundError({ action });
				}

				this.logger.debug("Call action:", action, params, opts);
				if (handlerItem.onBeforeCall) {
					await handlerItem.onBeforeCall.call(this, ctx, socket, action, params, opts);
				}
				let res = await ctx.call(action, params, opts);
				if (handlerItem.onAfterCall) {
					res = (await handlerItem.onAfterCall.call(this, ctx, socket, res)) || res;
				}
				this.socketSaveMeta(socket, ctx);
				if (ctx.meta.$join) {
					await this.socketJoinRooms(socket, ctx.meta.$join);
				}
				if (ctx.meta.$leave) {
					if (_.isArray(ctx.meta.$leave)) {
						await Promise.all(
							ctx.meta.$leave.map(room => this.socketLeaveRoom(socket, room))
						);
					} else {
						await this.socketLeaveRoom(socket, ctx.meta.$leave);
					}
				}
				return res;
			}
		},

		/**
		 * Broadcast an event to all connected socket.io clients
		 */
		broadcast: {
			params: {
				event: { type: "string" },
				namespace: { type: "string", optional: true },
				args: { type: "array", optional: true },
				volatile: { type: "boolean", optional: true },
				local: { type: "boolean", optional: true },
				rooms: { type: "array", items: "string", optional: true }
			},
			async handler(ctx) {
				this.logWithLevel(this.settings.logBroadcastRequest, "broadcast: ", ctx.params);
				let namespace = this.io;
				if (ctx.params.namespace) {
					namespace = namespace.of(ctx.params.namespace);
				}
				if (ctx.params.volatile) namespace = namespace.volatile;
				if (ctx.params.local) namespace = namespace.local;
				if (ctx.params.rooms) {
					for (const room of ctx.params.rooms) {
						namespace = namespace.to(room);
					}
				}
				if (ctx.params.args) {
					namespace.emit(ctx.params.event, ...ctx.params.args);
				} else {
					namespace.emit(ctx.params.event);
				}
			}
		},

		/**
		 * Get list of all connected clients.
		 */
		getClients: {
			params: {
				namespace: { type: "string", default: "/" },
				room: "string"
			},
			async handler(ctx) {
				const sids = await this.io
					.of(ctx.params.namespace)
					.in(ctx.params.room)
					.allSockets();

				return Array.from(sids);
			}
		}
	},
	methods: {
		/**
		 * Remove namespace and disconnects matching Sockets
		 * @param {String} nsp Namespace
		 */
		removeNamespace(nps) {
			/** @type {import('socket.io').Namespace} */
			const namespace = this.io._nsps.get(nps);

			if (!namespace) {
				this.logger.debug(`Namespace '${nps}' does not exist`);
				throw new Error(`Namespace '${nps}' does not exist`);
			}
			// More info: https://socket.io/docs/v4/server-api/#namespacedisconnectsocketsclose
			namespace.disconnectSockets();
			this.io._nsps.delete(nps);
		},

		/**
		 * Register a namespace
		 * @param {String} nsp Namespace
		 * @param {String} handlerName Name handler registered in created()
		 * @param {HandlerItem} item
		 */
		registerNamespace(nsp, handlerName, item) {
			const [defaultNsp, ...remainingNsps] = Array.from(this.io._nsps.keys());
			if (remainingNsps.includes(nsp)) {
				this.logger.debug(`Namespace '${nsp}' already exists`);
				throw new Error(`Namespace '${nsp}' already exists`);
			}

			/** @type {import('socket.io').Namespace} */
			const namespace = this.io.of(nsp);
			if (item && item.authorization) {
				this.logger.debug(`Add authorization to handler:`, item);
				if (!_.isFunction(this.socketAuthorize)) {
					/* istanbul ignore next */
					this.logger.warn(
						"Define 'socketAuthorize' method in the service to enable authorization."
					);
					/* istanbul ignore next */
					item.authorization = false;
				} else {
					// add authorize middleware
					namespace.use(makeAuthorizeMiddleware(this, item));
				}
			}
			if (item && item.middlewares) {
				//Server middlewares
				for (const middleware of item.middlewares) {
					namespace.use(middleware.bind(this));
				}
			}

			// Handlers generated in created()
			const handlers = this.settings.io.handlers[handlerName];
			namespace.on("connection", socket => {
				const labels = { namespace: nsp };
				this.broker.metrics.increment(C.METRIC_SOCKET_IO_SOCKETS_ACTIVE, labels);

				socket.on("disconnect", reason => {
					this.broker.metrics.decrement(C.METRIC_SOCKET_IO_SOCKETS_ACTIVE, labels);
				});

				socket.$service = this;
				this.logWithLevel(
					this.settings.logClientConnection,
					`(nsp:'${nsp}') Client connected:`,
					socket.id
				);
				if (item && item.packetMiddlewares) {
					//socket middlewares
					for (const middleware of item.packetMiddlewares) {
						socket.use(middleware.bind(this));
					}
				}
				for (const eventName in handlers) {
					socket.on(eventName, handlers[eventName]);
				}
			});
		},

		/**
		 * Initialize Socket.io server
		 *
		 * @param {import('socket.io').Server?} srv
		 * @param {Partial<import('socket.io').ServerOptions>} opts
		 */
		initSocketIO(srv, opts) {
			if ("object" == typeof srv && srv instanceof Object && !srv.listen) {
				opts = srv;
				srv = null;
			}
			opts = _.cloneDeep(opts || this.settings.io.options || {});
			srv = srv || this.server || (this.settings.server ? this.settings.port : undefined);

			if (this.settings.cors && !opts.cors) {
				// cors settings
				opts.cors = this.settings.cors;
			}
			this.io = new IO(srv, opts);
		},

		/**
		 *
		 * @param {import('socket.io').Socket} socket
		 * @returns
		 */
		socketGetMeta(socket) {
			/** @type {SocketMeta} */
			const meta = {
				$socketId: socket.id,
				user: socket.client.user,
				$rooms: Array.from(socket.rooms.keys())
			};
			this.logger.debug("getMeta", meta);
			return meta;
		},

		/**
		 *
		 * @param {import('socket.io').Socket} socket
		 * @param {import('moleculer').Context} ctx
		 */
		socketSaveMeta(socket, ctx) {
			this.socketSaveUser(socket, ctx.meta.user);
		},

		/**
		 *
		 * @param {import('socket.io').Socket} socket
		 * @param {} user
		 */
		socketSaveUser(socket, user) {
			socket.client.user = user;
		},

		/**
		 *
		 * @param {Error} err
		 * @param {Function} respond
		 * @returns
		 */
		socketOnError(err, respond) {
			const errDebug = _.pick(err, ["name", "message", "code", "type", "data", "stack"]);
			this.logger.debug("socketOnError:", errDebug);
			const errObj = _.pick(err, ["name", "message", "code", "type", "data"]);
			return respond(errObj);
		},

		/**
		 *
		 * @param {import('socket.io').Socket} socket
		 * @param {String|String[]} rooms
		 * @returns
		 */
		socketJoinRooms(socket, rooms) {
			this.logger.debug(`socket ${socket.id} join room:`, rooms);
			socket.join(rooms);
		},

		/**
		 *
		 * @param {import('socket.io').Socket} socket
		 * @param {String} room
		 * @returns
		 */
		socketLeaveRoom(socket, room) {
			this.logger.debug(`socket ${socket.id} leave room:`, room);
			socket.leave(room);
		},
		/**
		 *
		 * @param {String} level Level used to log
		 * @param {any} args Arguments
		 * @returns
		 */
		logWithLevel(level, ...args) {
			if (level && level in this.logger) {
				this.logger[level](...args);
			}
		}
	}
};

/**
 *
 * @param {String} action Action Name
 * @param {Array<String>|Array<RegExp>} whitelist White list name
 * @returns
 */
function checkWhitelist(action, whitelist) {
	return whitelist.some(mask => {
		if (_.isString(mask)) {
			return match(action, mask);
		} else if (_.isRegExp(mask)) {
			return mask.test(action);
		}
	});
}

/**
 *
 * @param {import('moleculer').Service} svc
 * @param {NamespaceEvent} handlerItem
 * @returns
 */
function makeAuthorizeMiddleware(svc, handlerItem) {
	return async function authorizeMiddleware(socket, next) {
		try {
			const res = await svc.socketAuthorize(socket, handlerItem);
			if (res) svc.socketSaveUser(socket, res);
			next();
		} catch (e) {
			return next(e);
		}
	};
}

/**
 * Default handler
 *
 * @param {import('moleculer').Service} svc
 * @param {NamespaceEvent} handlerItem
 * @returns
 */
function makeHandler(svc, handlerItem) {
	svc.logger.debug("makeHandler:", handlerItem);
	return async function (action, params, respond) {
		svc.logWithLevel(svc.settings.logRequest, `   => Client '${this.id}' call '${action}'`);
		svc.logWithLevel(svc.settings.logRequestParams, "   Params:", params);

		const labels = { namespace: this.nsp.name, rooms: Array.from(this.rooms.keys()) };
		const timeEnd = svc.broker.metrics.timer(C.METRIC_SOCKET_IO_MESSAGES_TIME, labels);
		svc.broker.metrics.increment(C.METRIC_SOCKET_IO_MESSAGES_TOTAL, labels);
		svc.broker.metrics.increment(C.METRIC_SOCKET_IO_MESSAGES_ACTIVE, labels);

		try {
			if (_.isFunction(params)) {
				respond = params;
				params = null;
			}

			const res = await svc.actions.call({ socket: this, action, params, handlerItem });

			timeEnd();
			svc.broker.metrics.decrement(C.METRIC_SOCKET_IO_MESSAGES_ACTIVE, labels);

			svc.logWithLevel(
				svc.settings.logResponse,
				`   <= ${kleur.green().bold("Success")} ${action}`
			);
			if (_.isFunction(respond)) respond(null, res);
		} catch (err) {
			timeEnd();
			svc.broker.metrics.decrement(C.METRIC_SOCKET_IO_MESSAGES_ACTIVE, labels);

			if (svc.settings.log4XXResponses || (err && !_.inRange(err.code, 400, 500))) {
				svc.logger.error(
					"   Request error!",
					err.name,
					":",
					err.message,
					"\n",
					err.stack,
					"\nData:",
					err.data
				);
			}
			if (_.isFunction(respond)) svc.socketOnError(err, respond);
		}
	};
}

/**
 *
 * @param {import('moleculer').ServiceBroker} broker
 */
function registerMetrics(broker) {
	if (!broker.isMetricsEnabled()) return;

	broker.metrics.register({
		type: METRIC.TYPE_COUNTER,
		name: C.METRIC_SOCKET_IO_MESSAGES_TOTAL,
		labelNames: ["socket.io"],
		rate: true,
		unit: "msg"
	});

	broker.metrics.register({
		type: METRIC.TYPE_GAUGE,
		name: C.METRIC_SOCKET_IO_MESSAGES_ACTIVE,
		labelNames: ["socket.io"],
		rate: true,
		unit: "msg"
	});

	broker.metrics.register({
		type: METRIC.TYPE_HISTOGRAM,
		name: C.METRIC_SOCKET_IO_MESSAGES_TIME,
		labelNames: ["socket.io"],
		quantiles: true,
		unit: "msg"
	});

	broker.metrics.register({
		type: METRIC.TYPE_GAUGE,
		name: C.METRIC_SOCKET_IO_SOCKETS_ACTIVE,
		labelNames: ["socket.io"],
		rate: true,
		unit: "socket"
	});
}

/**
 * @typedef HandlerItem
 * @property {Boolean?} authorization Flag indicating whether to use auth.
 * @property {Boolean?} createNamespace If set to 'false' won't create IO namespace. Will only create the handler(s)
 * @property {Array<Function>?} middlewares
 * @property {Array<Function>?} packetMiddlewares Socket.IO middleware. More info: https://socket.io/docs/v3/middlewares/
 * @property {Record<string,NamespaceEvent>} events
 */

/**
 * @typedef NamespaceEvent
 * @property {String?} mappingPolicy The `event` has a `mappingPolicy` property to handle events without aliases.
 * 									- `all` - enable to handle all actions with or without aliases (default)
 * 									- `restrict` - enable to handle only the actions with aliases
 * @property {Record<string, string>?} aliases You can use alias names instead of action names. Example `{ add: "math.add" }`
 * @property {Array<String>?} whitelist
 * @property {Function?} onBeforeCall The event handler has before & after call hooks. You can use it to set ctx.meta, access socket object or modify the response data
 * @property {Function?} onAfterCall The event handler has before & after call hooks. You can use it to set ctx.meta, access socket object or modify the response data
 * @property {import('moleculer').CallingOptions} callOptions
 */

/**
 * @typedef CallActionParams
 * @property {import('socket.io').Socket} socket
 * @property {String} action Action name
 * @property {Object} params Prams to be passed to the Action
 * @property {NamespaceEvent} handlerItem
 */

/**
 * @typedef CallActionMeta
 * @property {String} $join Room to join
 * @property {String|Array<String>} $leave Room(s) to leave
 * @property {User} user User info
 */

/**
 * @typedef SocketMeta
 * @property {String} $socketId
 * @property {Array<String>} $rooms
 * @property {User} user
 */

/**
 * @typedef User
 * @property {String|Number} id
 * @property {String} name
 * @property {String} description
 */
