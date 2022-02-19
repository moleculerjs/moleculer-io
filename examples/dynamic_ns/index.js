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
		addNamespace: {
			params: {
				namespace: "string", // Name of namespace
				handler: "string" // Handler(s) to be used
			},
			async handler(ctx) {
				return this.registerNamespace(ctx.params.namespace, ctx.params.handler);
			}
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
	console.log(handlersList);

	await broker.call("io.addNamespace", {
		namespace, // Dynamically create '/test' namespace
		handler: handlerHame // Select the handler to be used by the namespace
	});

	clientBase = IOclient.connect("http://localhost:3000");
	clientTestNamespace = IOclient.connect("http://localhost:3000" + namespace);

	try {
		const resBaseNamespace = await callAwait(clientBase, "greeter.welcome", {
			namespace: "/"
		});
		console.log(resBaseNamespace);

		const resTestNamespace = await callAwait(clientTestNamespace, "greeter.dynamic", {
			namespace: "/test"
		});
		console.log(resTestNamespace);
	} catch (error) {
		broker.logger.err(error);
	} finally {
		clientBase.disconnect();
		clientTestNamespace.disconnect();
	}
});
