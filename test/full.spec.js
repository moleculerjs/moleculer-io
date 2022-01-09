const { Socket } = require("socket.io");
const io = require("socket.io-client");
const { ServiceBroker, Context } = require("moleculer");
const { MoleculerClientError } = require("moleculer").Errors;
const SocketIOService = require("../src");
const { UnAuthorizedError } = require("../src/errors");

describe("Test full features", () => {
	let broker, svc, port;
	let FLOW = [];

	const beforeCall = jest.fn(async () => FLOW.push("before hook"));
	const afterCall = jest.fn(async (ctx, socket, res) => {
		FLOW.push("after hook");
		return res;
	});

	beforeAll(async () => {
		broker = new ServiceBroker({ logLevel: "error" });

		svc = broker.createService({
			name: "io",
			mixins: [SocketIOService],
			settings: {
				port: 0,
				io: {
					options: {
						// adapter: redisAdapter({ host: 'localhost', port: 6379 })
					},
					namespaces: {
						"/": {
							authorization: false,
							middlewares: [
								function (socket, next) {
									FLOW.push("namespace middleware");
									next();
								}
							],
							packetMiddlewares: [
								function (packet, next) {
									FLOW.push("packet middleware");
									next();
								}
							],
							events: {
								call: {
									aliases: {
										div: "math.div"
									},
									whitelist: ["math.*", "rooms.*", "io.*", "send.*"],
									onBeforeCall: beforeCall,
									onAfterCall: afterCall
									// callOptions:{}
								},
								custom: async function (p, respond) {
									FLOW.push(`custom-${p.a}`);
									respond(null, "custom-ok");
								}
							}
						},

						"/admin": {
							authorization: true,
							middlewares: [
								function (socket, next) {
									FLOW.push("admin namespace middleware");
									next();
								}
							],
							packetMiddlewares: [
								function (packet, next) {
									FLOW.push("admin packet middleware");
									next();
								}
							],
							events: {
								call: {
									whitelist: ["math.*", "rooms.*", "top-secret.*"],
									onBeforeCall: beforeCall,
									onAfterCall: afterCall,
									callOptions: {
										timeout: 500
									}
								}
							}
						}
					}
				}
			},

			methods: {
				socketAuthorize(socket, handler) {
					FLOW.push("auth");
					const accessToken = socket.handshake.query.token;
					if (accessToken && accessToken === "12345") {
						// valid credential
						return Promise.resolve({
							id: 1,
							detail: "You are authorized using token.",
							name: "John Doe"
						});
					}

					// invalid credentials
					return Promise.reject(new UnAuthorizedError("Invalid token."));
				}
			}
		});

		broker.createService({
			name: "rooms",
			actions: {
				join: {
					params: {
						room: { type: "string", min: 2 }
					},
					handler(ctx) {
						ctx.meta.$join = ctx.params.room;
					}
				},
				leave: {
					params: {
						room: { type: "string", min: 2 }
					},
					handler(ctx) {
						ctx.meta.$leave = ctx.params.room;
					}
				},
				get(ctx) {
					return ctx.meta.$rooms;
				}
			}
		});

		broker.createService({
			name: "math",
			actions: {
				add: {
					visibility: "published",
					params: {
						a: "number",
						b: "number"
					},
					handler(ctx) {
						FLOW.push("action: math.add");
						return Number(ctx.params.a) + Number(ctx.params.b);
					}
				},
				sub(ctx) {
					return Number(ctx.params.a) - Number(ctx.params.b);
				},
				div(ctx) {
					if (ctx.params.b == 0) {
						throw new MoleculerClientError(
							"Divide by zero",
							400,
							"DIV_ZERO",
							ctx.params
						);
					}
					return ctx.params.a / ctx.params.b;
				}
			}
		});

		broker.createService({
			name: "send",
			actions: {
				message: {
					params: {
						namespace: { type: "string", default: "/" },
						room: { type: "string" },
						text: { type: "string" }
					},
					async handler(ctx) {
						await this.broker.call("io.broadcast", {
							event: "msg",
							namespace: ctx.params.namespace,
							args: [ctx.params.text],
							rooms: [ctx.params.room]
						});
						await this.Promise.delay(50);
					}
				},
				leave: {
					params: {
						leave: { type: "string", min: 2 }
					},
					handler(ctx) {
						ctx.meta.$leave = ctx.params.leave;
					}
				},
				get(ctx) {
					return ctx.meta.$rooms;
				}
			}
		});

		broker.createService({
			name: "top-secret",
			actions: {
				hello: {
					params: {
						name: { type: "string", min: 2 }
					},
					handler(ctx) {
						FLOW.push("action: top-secret.hello");
						return `${ctx.params.name} hello`;
					}
				}
			}
		});

		await broker.start();

		port = svc.io.httpServer.address().port;
	});

	afterAll(async () => {
		await broker.stop();
	});

	beforeEach(() => {
		FLOW = [];
		beforeCall.mockClear();
		afterCall.mockClear();
	});

	function call(client, action, params) {
		return new Promise(function (resolve, reject) {
			client.emit("call", action, params, function (err, res) {
				if (err) return reject(err);
				resolve(res);
			});
		});
	}

	describe("Test '/' namespace actions", () => {
		let client;

		beforeAll(() => (client = io.connect(`ws://localhost:${port}`, { forceNew: true })));
		afterAll(() => client.disconnect());

		it("call published actions", async () => {
			const res = await call(client, "math.add", { a: 1, b: 2 });
			expect(res).toBe(3);
			expect(FLOW).toEqual([
				"namespace middleware",
				"packet middleware",
				"before hook",
				"action: math.add",
				"after hook"
			]);
			expect(beforeCall).toBeCalledTimes(1);
			expect(beforeCall).toBeCalledWith(
				expect.any(Context),
				expect.any(Socket),
				"math.add",
				{ a: 1, b: 2 },
				{
					meta: {
						$socketId: client.id,
						$rooms: [client.id],
						user: undefined
					}
				}
			);
			expect(afterCall).toBeCalledTimes(1);
			expect(afterCall).toBeCalledWith(expect.any(Context), expect.any(Socket), 3);
		});

		it("call with wrong params", async () => {
			expect.assertions(4);
			try {
				await call(client, "math.add", { a: 1, c: 2 });
			} catch (err) {
				expect(err.name).toBe("ValidationError");
				expect(err.message).toBe("Parameters validation error!");
				expect(err.data).toEqual([
					{
						action: "math.add",
						field: "b",
						message: "The 'b' field is required.",
						nodeID: broker.nodeID,
						type: "required"
					}
				]);
				expect(FLOW).toEqual(["packet middleware", "before hook"]);
			}
		});

		it("should receive error", async () => {
			expect.assertions(6);
			try {
				await call(client, "div", { a: 10, b: 0 });
			} catch (err) {
				expect(err.name).toBe("MoleculerClientError");
				expect(err.code).toBe(400);
				expect(err.type).toBe("DIV_ZERO");
				expect(err.message).toBe("Divide by zero");
				expect(err.data).toEqual({ a: 10, b: 0 });
				expect(FLOW).toEqual(["packet middleware", "before hook"]);
			}
		});

		it("action name not string", async () => {
			expect.assertions(3);
			try {
				await call(client, 222, "wtf");
			} catch (err) {
				expect(err.name).toBe("BadRequestError");
				expect(err.message).toBe("Bad Request");
				expect(FLOW).toEqual(["packet middleware"]);
			}
		});

		it("action is not registered", async () => {
			expect.assertions(3);
			try {
				await call(client, "math.derive", { expr: "x^2" });
			} catch (err) {
				expect(err.name).toBe("ServiceNotFoundError");
				expect(err.message).toBe("Service 'math.derive' is not found.");
				expect(FLOW).toEqual(["packet middleware"]);
			}
		});

		it("whitelist filtered action", async () => {
			expect.assertions(3);
			try {
				await call(client, "top-secret.hello", { name: "Moleculer" });
			} catch (err) {
				expect(err.name).toBe("ServiceNotFoundError");
				expect(err.message).toBe("Service 'top-secret.hello' is not found.");
				expect(FLOW).toEqual(["packet middleware"]);
			}
		});

		it("call custom handler", async () => {
			const res = await new Promise(function (resolve, reject) {
				client.emit("custom", { a: 5 }, function (err, res) {
					if (err) return reject(err);
					resolve(res);
				});
			});
			expect(res).toBe("custom-ok");
			expect(FLOW).toEqual(["packet middleware", "custom-5"]);
			expect(beforeCall).toBeCalledTimes(0);
			expect(afterCall).toBeCalledTimes(0);
		});
	});

	describe("Test '/admin' namespace actions", () => {
		let adminClient;
		beforeAll(() => {
			adminClient = io.connect(`ws://localhost:${port}/admin`, {
				forceNew: true,
				query: { token: "12345" }
			});
		});
		afterAll(() => adminClient.disconnect());

		it("call actions with authenticated user", async () => {
			const res = await call(adminClient, "top-secret.hello", { name: "Moleculer" });
			expect(res).toBe("Moleculer hello");
			expect(FLOW).toEqual([
				"auth",
				"admin namespace middleware",
				"admin packet middleware",
				"before hook",
				"action: top-secret.hello",
				"after hook"
			]);
			expect(beforeCall).toBeCalledTimes(1);
			expect(beforeCall).toBeCalledWith(
				expect.any(Context),
				expect.any(Socket),
				"top-secret.hello",
				{ name: "Moleculer" },
				{
					meta: {
						$socketId: adminClient.id,
						$rooms: [adminClient.id],
						user: {
							id: 1,
							detail: "You are authorized using token.",
							name: "John Doe"
						}
					},
					timeout: 500
				}
			);
			expect(afterCall).toBeCalledTimes(1);
			expect(afterCall).toBeCalledWith(
				expect.any(Context),
				expect.any(Socket),
				"Moleculer hello"
			);
		});

		it("call actions with unauthenticated user", async () => {
			const unauthenticatedClient = io.connect(`ws://localhost:${port}/admin`, {
				forceNew: true
			});

			const p = new Promise((resolve, reject) =>
				unauthenticatedClient.on("connect_error", reject)
			);

			expect.assertions(3);
			try {
				call(unauthenticatedClient, "top-secret.hello", {
					name: "Moleculer"
				});
				await p;
			} catch (err) {
				expect(err.name).toBe("Error");
				expect(err.message).toBe("Unauthorized");
				expect(FLOW).toEqual(["auth"]);
			}

			unauthenticatedClient.disconnect();
		});
	});

	describe("Test room handling", () => {
		let client;

		beforeAll(() => (client = io.connect(`ws://localhost:${port}`, { forceNew: true })));
		afterAll(() => client.disconnect());

		it("run plan join/leave rooms", async () => {
			expect(await call(client, "rooms.get")).toEqual([client.id]);
			expect(await call(client, "io.getClients", { room: "room-01" })).toEqual([]);

			await call(client, "rooms.join", { room: "room-01" });
			expect(await call(client, "rooms.get")).toEqual([client.id, "room-01"]);
			expect(await call(client, "io.getClients", { room: "room-01" })).toEqual([client.id]);

			await call(client, "rooms.join", { room: "room-02" });
			expect(await call(client, "rooms.get")).toEqual([client.id, "room-01", "room-02"]);
			expect(await call(client, "io.getClients", { room: "room-01" })).toEqual([client.id]);

			await call(client, "rooms.leave", { room: "room-01" });
			expect(await call(client, "rooms.get")).toEqual([client.id, "room-02"]);
			expect(await call(client, "io.getClients", { room: "room-01" })).toEqual([]);

			await call(client, "rooms.leave", { room: "room-02" });
			expect(await call(client, "rooms.get")).toEqual([client.id]);
			expect(await call(client, "io.getClients", { room: "room-01" })).toEqual([]);
		});
	});

	describe("Test rooms and backward messages", () => {
		let client;
		let PACKETS = [];

		beforeAll(() => {
			client = io.connect(`ws://localhost:${port}`, { forceNew: true });
			client.on("msg", packet => PACKETS.push(packet));
		});
		afterAll(() => client.disconnect());
		beforeEach(() => (PACKETS = []));

		it("receive messages for socketId", async () => {
			expect(await call(client, "rooms.get")).toEqual([client.id]);
			expect(PACKETS).toEqual([]);
			await call(client, "send.message", { text: "Hello to socketId", room: client.id });
			await call(client, "send.message", { text: "Hello to room-1", room: "room-1" });
			expect(PACKETS).toEqual(["Hello to socketId"]);
		});

		it("receive messages for socketId & room", async () => {
			await call(client, "rooms.join", { room: "room-1" });
			expect(PACKETS).toEqual([]);
			await call(client, "send.message", { text: "Hello to socketId", room: client.id });
			await call(client, "send.message", { text: "Hello to room-1", room: "room-1" });
			expect(PACKETS).toEqual(["Hello to socketId", "Hello to room-1"]);
		});

		it("receive messages for socketId", async () => {
			await call(client, "rooms.leave", { room: "room-1" });
			expect(PACKETS).toEqual([]);
			await call(client, "send.message", { text: "Hello to socketId", room: client.id });
			await call(client, "send.message", { text: "Hello to room-1", room: "room-1" });
			expect(PACKETS).toEqual(["Hello to socketId"]);
		});
	});
});
