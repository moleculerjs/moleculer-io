declare module "moleculer-io" {
	import { DefaultEventsMap, EventsMap } from "socket.io/dist/typed-events";
	import { Client } from "socket.io/dist/client";

	import { Server, ServerOptions, Socket } from "socket.io";
	import {
		Context,
		ServiceSchema,
		CallingOptions,
		ServiceMethods,
		ServiceSettingSchema,
		Service
	} from "moleculer";
	import { ApiSettingsSchema } from "moleculer-web";
	import * as http from "http";
	import { SocketOptions } from "socket.io-client";

	/**
	 * Socket meta fields injected by moleculer-io into `ctx.meta`
	 * when handling socket.io requests.
	 */
	interface SocketIOMeta {
		/** The socket.io socket ID of the caller */
		$socketId: string;
		/** Rooms the socket is currently in */
		$rooms: string[];
		/** Room(s) to join after the action call */
		$join?: string | string[];
		/** Room(s) to leave after the action call */
		$leave?: string | string[];
		/** Authenticated user info (set by socketAuthorize) */
		user?: any;
	}

	class ClientMoleculerIO<
		ClientUser,
		ListenEvents extends EventsMap,
		EmitEvents extends EventsMap,
		ServerSideEvents extends EventsMap
	> extends Client<ListenEvents, EmitEvents, ServerSideEvents> {
		user?: ClientUser;
	}
	export class SocketMoleculerIO<
		ClientUser = unknown,
		ServiceSettings = ServiceSettingSchema,
		ListenEvents extends EventsMap = DefaultEventsMap,
		EmitEvents extends EventsMap = ListenEvents,
		ServerSideEvents extends EventsMap = DefaultEventsMap
	> extends Socket<ListenEvents, EmitEvents, ServerSideEvents> {
		readonly $service: Service<ServiceSettings>;
		readonly client: ClientMoleculerIO<ClientUser, ListenEvents, EmitEvents, ServerSideEvents>;
	}
	interface NamespaceEvent {
		/**
		 * The `event` has a `mappingPolicy` property to handle events without aliases.
		 * - all - enable to handle all actions with or without aliases (default)
		 * - restrict - enable to handle only the actions with aliases
		 * @see https://moleculer.services/docs/moleculer-web.html#Mapping-policy
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
			ctx: Context<Record<string, any>, SocketIOMeta>,
			socket: SocketMoleculerIO,
			action: string,
			params: P,
			callOptions: CallingOptions
		): Promise<void>;
		/**
		 * The event handler has before & after call hooks. You can use it to set ctx.meta, access socket object or modify the response data
		 * @see https://github.com/moleculerjs/moleculer-io#handler-hooks
		 */
		onAfterCall<ORIGINAL_RES = any, MODIFIED_RES = any>(
			ctx: Context<Record<string, any>, SocketIOMeta>,
			socket: SocketMoleculerIO,
			res: ORIGINAL_RES
		): Promise<void | MODIFIED_RES>;
	}

	type NamespaceMiddlewareFunction = Parameters<Server["use"]>[0];
	type SocketMiddlewareFunction = Parameters<Socket["use"]>[0];
	/**
	 * Custom event's handler as a function.<br>
	 * Last params will be `response function` if client called `socket.emit('event', ..., aFunction(...){...})`.<br>
	 *
	 * @example {
	 * 		events: {
	 *			// callback (if exists) only accept 2 params: first is error, last is data
	 *	     	example(arg1: string, arg2: number, response: (...data: any[]) => void) {
	 *          	response(arg1, arg2)
	 *          },
	 *	     	exp2(arg1: string, arg2: number, callback: (err?: Error, ...data: any[]) => void) {
	 *          	callback(null, arg1, arg2)
	 *          },
	 *      },
	 * }
	 * @see https://socket.io/docs/v4/server-api/#socketoneventname-callback
	 */
	type EventCustomFunction<T = unknown> = (
		this: SocketMoleculerIO,
		...args: T[]
	) => void | Promise<void>;

	interface IONamespace {
		authorization?: boolean;
		/** If set to `false`, won't create IO namespace. Will only create the handler(s) */
		createNamespace?: boolean;
		middlewares?: NamespaceMiddlewareFunction[];
		packetMiddlewares?: SocketMiddlewareFunction[];

		events: {
			call: Partial<NamespaceEvent> | EventCustomFunction;
			[k: string]: Partial<NamespaceEvent> | EventCustomFunction;
		};
	}

	export interface IOSetting {
		options?: Partial<ServerOptions>;
		namespaces: {
			[k: string]: IONamespace;
		};
	}

	type InitSocketIOFunction = (srv: http.Server, opts: SocketOptions) => void;
	type SocketAuthorizeFunction = <USER = unknown>(
		socket: Socket,
		handlerItem: IONamespace
	) => Promise<USER | void>;
	type SocketGetMetaFunction = (socket: SocketMoleculerIO) => SocketIOMeta;
	type SocketSaveMetaFunction = (
		socket: SocketMoleculerIO,
		ctx: Context<any, SocketIOMeta>
	) => void;
	type SocketSaveUserFunction = (socket: Socket, user: any) => void;
	type SocketOnErrorFunction = (
		err: Error,
		respond: (error: Error | null, ...data: any[]) => void
	) => void;
	type SocketJoinRoomsFunction = (socket: SocketMoleculerIO, rooms: string | string[]) => void;
	type SocketLeaveRoomFunction = (socket: SocketMoleculerIO, room: string) => void;
	type RegisterNamespaceFunction = (nsp: string, handlerName: string, item?: IONamespace) => void;
	type RemoveNamespaceFunction = (nsp: string) => void;

	interface IOServiceMethods extends ServiceMethods {
		initSocketIO: InitSocketIOFunction;
		socketAuthorize: SocketAuthorizeFunction;
		socketGetMeta: SocketGetMetaFunction;
		/**
		 * by default, will call socketSaveUser(socket, ctx.meta.user)
		 */
		socketSaveMeta: SocketSaveMetaFunction;
		/**
		 * by default, will set user to socket.client.user
		 */
		socketSaveUser: SocketSaveUserFunction;
		socketOnError: SocketOnErrorFunction;
		socketJoinRooms: SocketJoinRoomsFunction;
		socketLeaveRoom: SocketLeaveRoomFunction;
		registerNamespace: RegisterNamespaceFunction;
		removeNamespace: RemoveNamespaceFunction;
	}
	export interface IOServiceSchema
		extends ServiceSchema<
			ServiceSettingSchema &
				ApiSettingsSchema & {
					io?: IOSetting;
				}
		> {
		// methods: Partial<IOServiceMethods> & ThisType<IOServiceSchema>;
	}

	const SocketIOMixin: Partial<IOServiceSchema>;
	export default SocketIOMixin;
}
