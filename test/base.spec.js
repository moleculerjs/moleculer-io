const io = require("socket.io-client");
const broker = require("./helpers/service-broker");

let socket, call;

beforeAll(async () => {
	await broker.start();
	socket = io("http://localhost:3000");
	call = function (action, params) {
		return new Promise(function (resolve, reject) {
			socket.emit("call", action, params, function (err, res) {
				if (err) {
					const e = new Error(err.message);
					e.name = err.name;
					e.code = err.code;
					e.type = err.type;
					return reject(e);
				}
				resolve(res);
			});
		});
	};
});

afterAll(async () => {
	await broker.stop();
});

describe("Test actions", () => {
	it("call published actions", async () => {
		const res = await call("math.add", { a: 1, b: 2 });
		expect(res).toBe(3);
	});

	it("action name not string", async () => {
		expect.assertions(2);
		try {
			await call(222, "wtf");
		} catch (err) {
			expect(err.name).toBe("BadRequestError");
			expect(err.message).toBe("Bad Request");
		}
	});

	it("run plan join/leave rooms", async () => {
		expect(await call("rooms.get")).toEqual([socket.id]);

		await call("rooms.join", { join: "room-01" });
		expect(await call("rooms.get")).toEqual([socket.id, "room-01"]);

		await call("rooms.join", { join: "room-02" });
		expect(await call("rooms.get")).toEqual([socket.id, "room-01", "room-02"]);

		await call("rooms.leave", { leave: "room-01" });
		expect(await call("rooms.get")).toEqual([socket.id, "room-02"]);

		await call("rooms.leave", { leave: "room-02" });
		expect(await call("rooms.get")).toEqual([socket.id]);
	});
});
