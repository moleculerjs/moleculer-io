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

module.exports = {
	name: "io",

	settings: {
		// port: 3000,
		server: true,
		io: {
			// options: {}, //socket.io options
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

	created() {
		const handlers = {};
		const namespaces = this.settings.io.namespaces;
		for (const nsp in namespaces) {
			const item = namespaces[nsp];
			this.logger.debug(`Add '${nsp}' route:`, item);
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

	started() {
		if (!this.io) {
			this.initSocketIO();
		}
		const namespaces = this.settings.io.namespaces;
		Object.keys(namespaces).forEach(nsp => {
			const item = namespaces[nsp];
			const namespace = this.io.of(nsp);
			if (item.authorization) {
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
			if (item.middlewares) {
				//Server middlewares
				for (const middleware of item.middlewares) {
					namespace.use(middleware.bind(this));
				}
			}
			const handlers = this.settings.io.handlers[nsp];
			namespace.on("connection", socket => {
				socket.$service = this;
				this.logger.info(`(nsp:'${nsp}') Client connected:`, socket.id);
				if (item.packetMiddlewares) {
					//socket middlewares
					for (const middleware of item.packetMiddlewares) {
						socket.use(middleware.bind(this));
					}
				}
				for (const eventName in handlers) {
					socket.on(eventName, handlers[eventName]);
				}
			});
		});

		this.logger.info("Socket.IO Websocket Gateway started.");
	},

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
				this.logger.debug("broadcast: ", ctx.params);
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
		 * Initialize Socket.io server
		 *
		 * @param {*} srv
		 * @param {*} opts
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
		 * @param {*} socket
		 * @returns
		 */
		socketGetMeta(socket) {
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
		 * @param {*} socket
		 * @param {*} ctx
		 */
		socketSaveMeta(socket, ctx) {
			this.socketSaveUser(socket, ctx.meta.user);
		},

		/**
		 *
		 * @param {*} socket
		 * @param {*} user
		 */
		socketSaveUser(socket, user) {
			socket.client.user = user;
		},

		/**
		 *
		 * @param {*} err
		 * @param {*} respond
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
		 * @param {*} socket
		 * @param {*} rooms
		 * @returns
		 */
		socketJoinRooms(socket, rooms) {
			this.logger.debug(`socket ${socket.id} join room:`, rooms);
			socket.join(rooms);
		},

		/**
		 *
		 * @param {*} socket
		 * @param {*} room
		 * @returns
		 */
		socketLeaveRoom(socket, room) {
			this.logger.debug(`socket ${socket.id} leave room:`, room);
			socket.leave(room);
		}
	}
};

/**
 *
 * @param {*} action
 * @param {*} whitelist
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
 * @param {*} svc
 * @param {*} handlerItem
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
 *
 * @param {*} svc
 * @param {*} handlerItem
 * @returns
 */
function makeHandler(svc, handlerItem) {
	svc.logger.debug("makeHandler:", handlerItem);
	return async function (action, params, respond) {
		svc.logger.info(`   => Client '${this.id}' call '${action}'`);
		if (svc.settings.logRequestParams && svc.settings.logRequestParams in svc.logger)
			svc.logger[svc.settings.logRequestParams]("   Params:", params);
		try {
			if (_.isFunction(params)) {
				respond = params;
				params = null;
			}
			const res = await svc.actions.call({ socket: this, action, params, handlerItem });
			svc.logger.info(`   <= ${kleur.green().bold("Success")} ${action}`);
			if (_.isFunction(respond)) respond(null, res);
		} catch (err) {
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
