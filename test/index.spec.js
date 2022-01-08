const { ServiceBroker } = require("moleculer");
const SocketIOService = require("../");

const io = require("socket.io-client");

function callAwait(socket, action, params) {
	return new Promise(function (resolve, reject) {
		socket.emit("call", action, params, function (err, res) {
			if (err) return reject(err);
			resolve(res);
		});
	});
}

describe("Test default settings", () => {
	let broker, socket;
	it("create env", async () => {
		broker = new ServiceBroker({ logLevel: "error" });
		const svc = broker.createService(SocketIOService, { settings: { port: 0 } });

		broker.createService({
			name: "greeter",
			actions: {
				hello(ctx) {
					return "Hello";
				},
				welcome: {
					params: {
						name: "string"
					},
					handler(ctx) {
						return `Welcome ${ctx.params.name}`;
					}
				}
			}
		});

		await broker.start();
		socket = io.connect("http://localhost:" + svc.io.httpServer.address().port);
	});

	it("should call an action", async () => {
		const res = await callAwait(socket, "greeter.hello");
		expect(res).toBe("Hello");

		const res2 = await callAwait(socket, "greeter.welcome", { name: "IO" });
		expect(res2).toBe("Welcome IO");
	});

	it("should throw error", async () => {
		expect.assertions(5);
		try {
			await callAwait(socket, "greeter.welcome");
		} catch (err) {
			expect(err.name).toBe("ValidationError");
			expect(err.message).toBe("Parameters validation error!");
			expect(err.type).toBe("VALIDATION_ERROR");
			expect(err.code).toBe(422);
			expect(err.data).toEqual([
				{
					action: "greeter.welcome",
					field: "name",
					message: "The 'name' field is required.",
					nodeID: broker.nodeID,
					type: "required"
				}
			]);
		}
	});
});
