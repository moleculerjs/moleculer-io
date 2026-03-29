/* eslint-disable no-console */

const { ServiceBroker } = require("moleculer");
const SocketIOService = require("../../");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");

const pubClient = createClient({ url: "redis://localhost:6379" });
const subClient = pubClient.duplicate();

const broker = new ServiceBroker();

broker.createService({
	name: "io",
	mixins: [SocketIOService],
	settings: {
		port: 3000,
		io: {
			options: {
				adapter: createAdapter(pubClient, subClient)
			}
		}
	}
});

broker.start().then(() => broker.repl());
