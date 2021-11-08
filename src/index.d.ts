declare module "moleculer-io" {
	import { Server, ServerOptions, Socket } from "socket.io";
	import { Context, ServiceSchema, CallingOptions, ServiceMethods } from "moleculer";
	import { ApiSettingsSchema } from "moleculer-web";

	interface NamespaceEvent {
		/**
		 * The `event` has a `mappingPolicy` property to handle events without aliases.
		 * - all - enable to handle all actions with or without aliases (default)
		 * - restrict - enable to handle only the actions with aliases
		 * @see https://moleculer.services/docs/0.14/moleculer-web.html#Mapping-policy
		 * @default: "all"
		 */
		mappingPolicy: "all" | "restrict";
		/**
		 * You can use alias names instead of action names.
		 * @example {
		 *     add: "math.add"
		 * }
		 * socket.emit("call", "add", {a: 1, b: 2});
		 */
		aliases: Record<string, string>;
		whitelist: string[];
		callOptions: Partial<CallingOptions>;
		/**
		 * The event handler has before & after call hooks. You can use it to set ctx.meta, access socket object or modify the response data
		 * @see https://github.com/moleculerjs/moleculer-io#handler-hooks
		 */
		onBeforeCall<P = any>(
			ctx: Context<Record<string, any>, Record<any, any>>,
			socket: Socket,
			action: string,
			params: P,
			callOptions: CallingOptions
		): Promise<void>;
		/**
		 * The event handler has before & after call hooks. You can use it to set ctx.meta, access socket object or modify the response data
		 * @see https://github.com/moleculerjs/moleculer-io#handler-hooks
		 */
		onAfterCall<ORIGINAL_RES = any, MODIFIED_RES = any>(
			ctx: Context<Record<string, any>>,
			socket: Socket,
			res: ORIGINAL_RES
		): Promise<void | MODIFIED_RES>;
	}

	type NamespaceMiddlewareFunction = Parameters<Server["use"]>[0];
	type SocketMiddlewareFunction = Parameters<Server["use"]>[0];

	interface IONamespace {
		authorization?: boolean;
		middlewares?: NamespaceMiddlewareFunction[];
		packetMiddlewares?: SocketMiddlewareFunction[];

		events: {
			call: Partial<NamespaceEvent>;
			[k: string]: Partial<NamespaceEvent>;
		};
	}

	export interface IOSetting {
		options?: ServerOptions;
		namespaces: {
			[k: string]: IONamespace;
		};
	}

	type SocketAuthorizeFunction = <META = Record<any, any>>(
		socket: Socket,
		handlerItem: IONamespace
	) => Promise<META>;
	type SocketGetMetaFunction = <
		META = {
			user: any;
			$rooms: string[];
		}
	>(
		socket: Socket
	) => Promise<META>;
	type SocketSaveMetaFunction = (socket: Socket, ctx: Context<any, any>) => Promise<void>;
	type SocketSaveUserFunction = (socket: Socket, user: any) => Promise<void>;
	type SocketOnErrorFunction = (
		err: Error,
		respond: (error: Error | null, ...data: any[]) => void
	) => void;
	type SocketJoinRoomsFunction = (socket: Socket, rooms: string | string[]) => void;
	type SocketLeaveRoomFunction = (socket: Socket, room: string) => void;

	interface IOMethods extends ServiceMethods {
		socketAuthorize?: SocketAuthorizeFunction;
		socketGetMeta?: SocketGetMetaFunction;
		/**
		 * by default, will call socketSaveUser(socket, ctx.meta.user)
		 */
		socketSaveMeta?: SocketSaveMetaFunction;
		/**
		 * by default, will set user to socket.client.user
		 */
		socketSaveUser?: SocketSaveUserFunction;
		socketOnError?: SocketOnErrorFunction;
		socketJoinRooms?: SocketJoinRoomsFunction;
		socketLeaveRoom?: SocketLeaveRoomFunction;
	}
	export interface IOServiceSchema
		extends ServiceSchema<
			ApiSettingsSchema & {
				io?: IOSetting;
			}
		> {
		methods: IOMethods & ThisType<IOServiceSchema>;
	}

	const SocketIOMixin: Partial<IOServiceSchema>;
	export default SocketIOMixin;
}
