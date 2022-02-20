/* eslint-disable no-console */

const { ServiceBroker } = require("moleculer");
const redisAdapter = require("socket.io-redis");
const SocketIOService = require("../../");
const express = require("express");
const fs = require("fs");
const path = require("path");
const Duplex = require("stream").Duplex;
const app = express();
app.use(express.static(path.join(__dirname, "public")));
const server = require("http").Server(app);

const broker = new ServiceBroker({
	logger: true,
	logLevel: {
		TRANSIT: "info",
		IO: "debug",
		"**": "info"
	},

	metrics: {
		enabled: true,
		reporter: {
			type: "Console",
			options: {
				includes: ["moleculer.io.**"]
			}
		}
	}
});

broker.createService({
	name: "say",
	actions: {
		hello: {
			params: {
				name: { type: "string", min: 2 }
			},
			handler(ctx) {
				return `${ctx.params.name} hello`;
			}
		}
	}
});

broker.createService({
	name: "math",
	actions: {
		add: {
			visibility: "published",
			handler(ctx) {
				return Number(ctx.params.a) + Number(ctx.params.b);
			}
		},
		sub(ctx) {
			return Number(ctx.params.a) - Number(ctx.params.b);
		}
	}
});

broker.createService({
	name: "accounts",
	actions: {
		login(ctx) {
			if (ctx.params.user == "tiaod" && ctx.params.password == "pass") {
				ctx.meta.user = { id: "tiaod" };
			}
		},
		getUserInfo(ctx) {
			return ctx.meta.user;
		}
	}
});

broker.createService({
	name: "rooms",
	actions: {
		join(ctx) {
			ctx.meta.$join = ctx.params.join;
		},
		leave(ctx) {
			ctx.meta.$leave = ctx.params.leave;
		},
		get(ctx) {
			return ctx.meta.$rooms;
		}
	}
});

broker.createService({
	name: "file",
	actions: {
		save: {
			handler(ctx) {
				return new this.Promise((resolve, reject) => {
					const filePath = path.join(__dirname, "public/upload", ctx.meta.filename);
					const f = fs.createWriteStream(filePath);
					f.on("close", () => {
						this.logger.info(`Uploaded file stored in '${filePath}'`);
						resolve(filePath);
					});
					f.on("error", err => reject(err));

					ctx.params.pipe(f);
				});
			}
		}
	}
});

const ioService = broker.createService({
	name: "io",
	mixins: [SocketIOService],
	settings: {
		io: {
			options: {
				// adapter: redisAdapter({ host: 'localhost', port: 6379 })
			},
			namespaces: {
				"/": {
					authorization: true,
					middlewares: [
						function (socket, next) {
							console.log("namespace middleware"); //point to service instance.
							next();
						}
					],
					// packetMiddlewares:[],
					events: {
						call: {
							whitelist: ["math.*", "say.*", "accounts.*", "rooms.*", "io.*"],
							onBeforeCall: async function (
								ctx,
								socket,
								action,
								params,
								callOptions
							) {
								console.log("before hook:", { action, params, callOptions });
							},
							onAfterCall: async function (ctx, socket, res) {
								console.log("after hook", res);
							}
							// callOptions:{}
						},
						upload: async function ({ name, type }, file, respond) {
							let stream = new Duplex();
							stream.push(file);
							stream.push(null);
							await this.$service.broker.call("file.save", stream, {
								meta: {
									filename: name
								}
							});
							respond(null, name);
						}
					}
				}
			}
		}
	},
	methods: {
		socketAuthorize(socket, handler) {
			console.log("Login using token:", socket.handshake.query.token);
			let accessToken = socket.handshake.query.token;
			if (accessToken) {
				if (accessToken === "12345") {
					// valid credential
					return Promise.resolve({
						id: 1,
						detail: "You are authorized using token.",
						name: "John Doe"
					});
				} else {
					// invalid credentials
					return Promise.reject();
				}
			} else {
				// anonymous user
				return Promise.resolve();
			}
		}
	}
});

ioService.initSocketIO(server);

broker.start().then(() => broker.repl());

server.listen(3000);
