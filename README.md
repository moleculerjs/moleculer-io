[![Moleculer logo](http://moleculer.services/images/banner.png)](https://github.com/moleculerjs/moleculer)

[![CI test](https://github.com/moleculerjs/moleculer-io/actions/workflows/ci.yml/badge.svg)](https://github.com/moleculerjs/moleculer-io/actions/workflows/ci.yml)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/moleculerjs/moleculer-io/master/LICENSE)
[![npm](https://img.shields.io/npm/v/moleculer-io.svg)](https://www.npmjs.com/package/moleculer-io)
[![Known Vulnerabilities](https://snyk.io/test/github/moleculerjs/moleculer-io/badge.svg)](https://snyk.io/test/github/moleculerjs/moleculer-io)
[![Downloads](https://img.shields.io/npm/dm/moleculer-io.svg)](https://www.npmjs.com/package/moleculer-io)
<h1>Moleculer-io</h1>

The `moleculer-io` is a Websocket gateway service for [Moleculer](https://github.com/moleculerjs/moleculer) using `socket.io`.

<h1>Features</h1>
- Call moleculer actions by emiting Socket.io events.
- Support Socket.io authorization (Default: `socket.client.user` => moleculer `ctx.meta.user`)
- Whitelist.
- Middlewares.
- Broadcast events.
- Joining and leaving rooms.

<h1>Install</h1>

```shell
$ npm install moleculer-io
```

<h1>Table of contents</h1>
<!-- TOC depthFrom:1 depthTo:6 withLinks:1 updateOnSave:1 orderedList:0 -->

- [Usage](#usage)
  - [Init server](#init-server)
  - [Handle socket events](#handle-socket-events)
  - [Handle multiple events](#handle-multiple-events)
  - [Aliases](#aliases)
    - [Mapping policy](#mapping-policy)
  - [Custom handler](#custom-handler)
  - [Handler hooks](#handler-hooks)
  - [Calling options](#calling-options)
  - [Middlewares](#middlewares)
  - [Authorization](#authorization)
  - [Joining and leaving rooms](#joining-and-leaving-rooms)
  - [Broadcast](#broadcast)
  - [CORS](#cors)
  - [Using multiple instances](#using-multiple-instances)
  - [Logging settings](#logging-settings)
  - [Full settings](#full-settings)
  - [License](#license)
  - [Contact](#contact)

<!-- /TOC -->


# Usage

## Init server

Using with Node http server:

```javascript
const server = require('http').Server(app)
const SocketIOService = require("moleculer-io")
const ioService = broker.createService({
  name: 'io',
  mixins: [SocketIOService]
})

ioService.initSocketIO(server)

// Once the initSocketIO() was called, you can access the io object from ioService.io
broker.start()
server.listen(3000)
```

Or let moleculer-io create a server for you:

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000 //will call initSocketIO() on broker.start()
  }
})
broker.start()
```

Or maybe you want to use it with `moleculer-web`

```js
const ApiService = require("moleculer-web");
const SocketIOService = require("moleculer-io")
broker.createService({
  name: 'gateway',
  mixins: [ApiService, SocketIOService], //Should after moleculer-web
  settings: {
    port: 3000
  }
})
broker.start()
```
In this case, `moleculer-io` will use the server created by `moleculer-web` .

## Handle socket events

Server:

```javascript
const IO = require('socket.io')
const {
  ServiceBroker
} = require('moleculer')
const SocketIOService = require('moleculer-io')

const broker = new ServiceBroker()

broker.createService({
  name: "math",
  actions: {
    add(ctx) {
      return Number(ctx.params.a) + Number(ctx.params.b);
    }
  }
})

const ioService = broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000
  }
})

broker.start()
```

By default, `moleculer-io` handle the `call` event which will proxy to moleculer's `broker.call`

Examples:

-   Call `test.hello` action without params: `socket.emit('call','test.hello', callback)`
-   Call `math.add` action with params: `socket.emit('call','math.add', {a:25, b:13}, callback)`
-   Get health info of node: `socket.emit('call','$node.health', callback)`
-   List all actions: `socket.emit('call', '$node.actions', callback)`

**Example client:**

```javascript
const io = require('socket.io-client')
const socket = io('http://localhost:3000')
socket.emit('call', 'math.add', { a: 123, b: 456},
function(err, res) {
  if (err) {
    console.error(err)
  } else {
    console.log('call success:', res)
  }
})
```

## Handle multiple events

You can create multiple routes with different whitelist, calling options & authorization.

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000,
    io: {
      namespaces: {
        '/': {
          events: {
            'call': {
              whitelist: [
                'math.add'
              ],
              callOptions: {}
            },
            'adminCall': {
              whitelist: [
                'users.*',
                '$node.*'
              ]
            }
          }
        }
      }
    }
  }
})
```

## Aliases

You can use alias names instead of action names.

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000,
    io: {
      namespaces: {
        '/': {
          events: {
            'call': {
              aliases: {
                'add': 'math.add'
              },
              whitelist: [
                'math.add'
              ],
              callOptions: {}
            }
          }
        }
      }
    }
  }
})
```

Then doing `socket.emit('call','math.add', {a:25, b:13}, callback)` on the client side will be equivalent to `socket.emit('call','add', {a:25, b:13}, callback)`.

### Mapping policy

The `event` has a `mappingPolicy` property to handle events without aliases.

*Available options:*
* `all` - enable to handle all actions with or without aliases (default)
* `restrict` - enable to handle only the actions with aliases

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000,
    io: {
      namespaces: {
        '/': {
          events: {
            'call': {
              mappingPolicy: 'restrict',
              aliases: {
                'add': 'math.add'
              },
              callOptions: {}
            }
          }
        }
      }
    }
  }
})
```

## Custom handler

You can make use of custom functions within the declaration of an event handler.

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000,
    io: {
      namespaces: {
        '/': {
          events: {
            'call': {},
            'myCustomEventHandler': function(data, ack) { // write your handler function here.
              let socket = this
              socket.emit('hello', 'world')
              socket.$service.broker.call('math.add', {
                a: 123,
                b: 456
              })
            }
          }
        }
      }
    }
  }
})
```
There is an internal pointer in socket objects:
- `socket.$service` is pointed to this service instance.


## Handler hooks

The event handler has before & after call hooks. You can use it to set ctx.meta, access socket object or modify the response data.

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    io: {
      namespaces: {
        '/': {
          events: {
            'call': {
              whitelist: [
                'math.*'
              ],
              onBeforeCall: async function(ctx, socket, action, params, callOptions) { //before hook
                  console.log('before hook:', params)
                },
              onAfterCall: async function(ctx, socket, res) { //after hook
                console.log('after hook', res)
                // res: The respose data.
              }
            }
          }
        }
      }
    }
  }
})
```

## Calling options

The handler has a callOptions property which is passed to broker.call. So you can set timeout, retryCount or fallbackResponse options for routes.

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    io: {
      namespaces: {
        '/': {
          events: {
            'call': {
              callOptions: {
                timeout: 500,
                retryCount: 0,
                fallbackResponse(ctx, err) { ...
                }
              }
            }
          }
        }
      }
    }
  }
})
```

Note: If you provide a meta field here, it replaces the socketGetMeta method's result.

## Middlewares

Register middlewares. Both namespace middlewares and packet middlewares are supported.

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    io: {
      namespaces: {
        '/': {
          middlewares: [ //Namespace level middlewares, equipment to namespace.use()
            function(socket, next) {
              if (socket.request.headers.cookie) return next();
              next(new Error('Authentication error'));
            }
          ],
          packetMiddlewares: [ // equipment to socket.use()
            function(packet, next) {
              if (packet.doge === true) return next();
              next(new Error('Not a doge error'));
            }
          ],
          events: {
            'call': {}
          }
        }
      }
    }
  }
})
```

**Note:** In middlewares the `this` is always pointed to the Service instance.

## Authorization

You can implement authorization. Do 2 things to enable it.

- Set `authorization: true` in your namespace
- Define the `socketAuthorize` method in service.

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    io: {
      namespaces: {
        '/': {
          authorization: true, // First thing
          events: {
            'call': {
              whitelist: [
                'math.*',
                'accounts.*'
              ]
            }
          }
        }
      }
    }
  },
  methods: {
    // Second thing
    async socketAuthorize(socket, eventHandler){
      let accessToken = socket.handshake.query.token
      if (accessToken) {
        try{
          let user = await this.broker.call("user.verifyToken", {accessToken})
          return {id: user.id, email: user.email, token: accessToken}  // valid credential, return the user
        }catch(err){
          throw new UnAuthorizedError() // invalid credentials
        }
      } else {
        // anonymous user
        return
      }
    }
  }
})
```

Client:

```javascript
const socket = io({
  query: {
    token: '12345'
  }
})
```

See [`examples/full`](examples/full)

Also you could overwrite the `socketGetMeta` method to add more addition meta info. The default `socketGetMeta` method is:

```javascript
socketGetMeta(socket){
  return {
    user: socket.client.user,
    $rooms: Object.keys(socket.rooms)
  }
}
```

Example to add more additional info:

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  methods: {
    socketGetMeta(socket) { //construct the meta object.
      return {
        user: socket.client.user,
        $rooms: Object.keys(socket.rooms),
        socketId: socket.id
      }
    },
    // In addition, you can also customize the place where user is stored.
    // Here is the default method the save user:
    socketSaveMeta(socket, ctx) {
      socket.client.user = ctx.meta.user
    }
  }
})
```

If you want to authorize a user after socket connected, you can write an action to do it.
```js
broker.createService({
  name: 'accounts',
  actions: {
    login(ctx){
      if(ctx.params.user == 'tiaod' && ctx.params.password == 'pass'){
        ctx.meta.user = {id:'tiaod'}
      }
    },
    getUserInfo(ctx){
      return ctx.meta.user
    }
  }
})
```
## Joining and leaving rooms

In your action, set `ctx.meta.$join` or `ctx.meta.$leave` to the rooms you want to join or leave.

eg.

```javascript
ctx.meta.$join = 'room1' //Join room1
ctx.meta.$join = ['room1', 'room2'] // Join room1 and room2

ctx.meta.$leave = 'room1' //Leave room1
ctx.meta.$leave = ['room1', 'room2'] // Leave room1 and room2
```

After the action is finished, `moleculer-io` will join or leave the room you specified.

**Example room management service:**

```javascript
broker.createService({
  name: 'rooms',
  actions: {
    join(ctx){
      ctx.meta.$join = ctx.params.room
    },
    leave(ctx){
      ctx.meta.$leave = ctx.params.room
    },
    list(ctx){
      return ctx.meta.$rooms
    }
  }
})
```

## Broadcast

If you want to broadcast event to socket.io from moleculer service:

```javascript
broker.call('io.broadcast', {
  namespace:'/', //optional
  event:'hello',
  args: ['my', 'friends','!'], //optional
  volatile: true, //optional
  local: true, //optional
  rooms: ['room1', 'room2'] //optional
})
```

_Note: You should change the 'io' to the service name you created._

## CORS
`moleculer-io` will pick the `settings.cors.origin` option and use it to validate the request. (Which is also compatible with `moleculer-web`! )

```js
broker.createService({
  name: 'io',
  mixins: [ApiGateway, SocketIOService],
  settings:{
		cors: {
			origin: ["http://example.com"], //Moleculer-io only pick up this option and set it to io.origins()
			methods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
			allowedHeaders: [],
			exposedHeaders: [],
			credentials: false,
			maxAge: 3600
		}
	}
})
```
For detail see https://socket.io/docs/server-api/#server-origins-fn

## Using multiple instances

If you plan for a highly available setup (launching multiple instances of this service behind a Load Balancer),
you will have to take some extra steps. Due to the nature of WebSockets these instances will need a PubSub capable broker
to connect to, in order to broadcast messages to sockets that are connected to other instances. For a more
in depth explanation of this concept, and additional steps that have to be taken (such as Load Balancer configuration), refer to the [Socket.io Documentation](https://socket.io/docs/using-multiple-nodes/).

In order to interconnect this service with other services, start the service with an adapter:

```javascript
const broker = new ServiceBroker({
    transporter: "redis://redis:6379"
})
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000,
    io: {
      options: {
        adapter: require("socket.io-redis")("redis://redis:6379")
      }
    }
  }
})
```

## Logging settings

If you want to keep clean your project console or have a more deep way to debug the data sent over the socket you can just change some settings in your service to add/remove logs:

- **logRequest**: Log all the incoming request through the socket
- **logRequestParams**: Log the request params
- **logResponse**: Log response data
- **logBroadcastRequest**: Log the request to forward to the sockets
- **logClientConnection**: Log when a client gets connected

To start logging something indicate whatever logging level you want:

```javascript
const broker = new ServiceBroker({
    transporter: "redis://redis:6379"
})
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    logClientConnection: 'info'
    port: 3000,
    io: {
      options: {
        adapter: require("socket.io-redis")("redis://redis:6379")
      }
    }
  }
})
```

logRequest, logRequestParams, logResponse are adopted from the API gateway, the other ones are managed only in this one and by default they are disabled

## Full settings

```javascript
settings: {
  port: 3000,
  io: {
    options: {}, //socket.io options
    namespaces: {
      '/':{
        authorization: false,
        middlewares: [],
        packetMiddlewares:[],
        events: {
          call: {
            mappingPolicy: 'all',
            aliases: {
              'add': 'math.add'
            },
            whitelist: [
              'math.*'
            ],
            callOptions:{},
            onBeforeCall: async function(ctx, socket, action, params, callOptions){
              ctx.meta.socketid = socket.id
            },
            onAfterCall:async function(ctx, socket, res){
             socket.emit('afterCall', res)
            }
          }
        }
      }
    }
  }
}
```
## License

The project is available under the [MIT license](https://tldrlegal.com/license/mit-license).

## Contact

Copyright (c) 2021 MoleculerJS

[![@MoleculerJS](https://img.shields.io/badge/github-moleculerjs-green.svg)](https://github.com/moleculerjs) [![@MoleculerJS](https://img.shields.io/badge/twitter-MoleculerJS-blue.svg)](https://twitter.com/MoleculerJS)
