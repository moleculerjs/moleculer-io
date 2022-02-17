const { ServiceBroker } = require("moleculer");
const SocketIOService = require("../../");

const IOclient = require("socket.io-client");

const broker = new ServiceBroker({});

/** @type {import('moleculer').ServiceSchema} */
const serviceSchema = {
	name: "io",
	mixins: [SocketIOService],
	settings: {
		port: 3000
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
		}
	}
});

broker.start().then(async () => {
	broker.repl();

	const namespace = "/test";

	const res = await broker.call("io.addNamespace", {
		namespace
	});

	clientBase = IOclient.connect("http://localhost:3000");
	clientTestNamespace = IOclient.connect("http://localhost:3000" + namespace);

	try {
		const resBaseNamespace = await callAwait(clientBase, "greeter.welcome", {
			namespace: "/"
		});
		console.log(resBaseNamespace);

		const resTestNamespace = await callAwait(clientTestNamespace, "greeter.welcome", {
			namespace: "/test"
		});
		console.log(resTestNamespace);
	} catch (error) {
		broker.logger.err(error);
	}
});
