"use strict";

const { ServiceBroker } = require("moleculer");
const SocketIOService = require("../../");

const IOclient = require("socket.io-client");

const broker = new ServiceBroker({});

/** @type {import('moleculer').ServiceSchema} */
const serviceSchema = {
	name: "io",
	mixins: [SocketIOService],
	settings: {
		port: 3000,
		io: {
			/** @type {import('socket.io').ServerOptions} */
			options: {},
			namespaces: {
				/**
				 * Configure handlers to be used by dynamically created IO namespaces.
				 * These handlers will be configured in service created() method
				 * They are referenced at this.settings.io.handlers
				 */
				dynamic: {
					// Don't create IO namespace
					// Will only create the handler(s)
					createNamespace: false,
					events: {
						call: {
							onBeforeCall: async function (ctx, socket, args) {
								console.log("Dynamic Handler onBeforeCall");
							},
							onAfterCall: async function (ctx, socket, data) {
								console.log("Dynamic Handler onAfterCall");
							}
						}
					}
				}
			}
		}
	},

	actions: {
		listIOHandlers: {
			handler(ctx) {
				return this.listIOHandlers();
			}
		},
		removeNamespace: {
			async handler(ctx) {
				return this.removeNamespace(ctx.params.namespace);
			}
		},
		addNamespace: {
			params: {
				namespace: "string", // Name of namespace
				handler: "string" // Handler(s) to use
			},
			async handler(ctx) {
				const item = ctx.params.handler;

				return this.registerNamespace(
					ctx.params.namespace, // New namespace
					ctx.params.handler, // Handler(s) to be used
					this.settings.io.namespaces[ctx.params.handler] // Auth, middleware to use
				);
			}
		}
	},

	methods: {
		listIOHandlers() {
			return this.settings.io.handlers;
		}
	}
};

function callAwait(client, action, params) {
	return new Promise(function (resolve, reject) {
		client.emit("call", action, params, function (err, res) {
			if (err) return reject(err);
			resolve(res);
		});
	});
}

broker.createService(serviceSchema);

broker.createService({
	name: "greeter",

	actions: {
		welcome(ctx) {
			return `Welcome ${ctx.params.namespace}`;
		},

		dynamic(ctx) {
			return `Dynamic ${ctx.params.namespace}`;
		}
	}
});

broker.start().then(async () => {
	broker.repl();

	const namespace = "/test";
	const handlerHame = "dynamic";

	const handlersList = await broker.call("io.listIOHandlers");

	await broker.call("io.addNamespace", {
		namespace, // Dynamically create '/test' namespace
		handler: handlerHame // Select the handler to be used by the namespace
	});

	let clientBase = IOclient.connect("http://localhost:3000");
	let clientTestNamespace = IOclient.connect("http://localhost:3000" + namespace);

	try {
		let resBaseNamespace = await callAwait(clientBase, "greeter.welcome", {
			namespace: "/"
		});
		console.log(resBaseNamespace);

		let resTestNamespace = await callAwait(clientTestNamespace, "greeter.dynamic", {
			namespace: "/test"
		});
		console.log(resTestNamespace);

		// Remove namespace and close client connections
		await broker.call("io.removeNamespace", { namespace });
	} catch (error) {
		broker.logger.error(error);
	} finally {
		clientBase.disconnect();
		clientTestNamespace.disconnect();
	}
});
