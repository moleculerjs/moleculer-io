![LOGO](https://raw.githubusercontent.com/tiaod/moleculer-io/master/examples/full/public/logo.png)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/tiaod/moleculer-io/master/LICENSE)
[![npm](https://img.shields.io/npm/v/moleculer-io.svg)](https://www.npmjs.com/package/moleculer-io)
[![Known Vulnerabilities](https://snyk.io/test/github/tiaod/moleculer-io/badge.svg)](https://snyk.io/test/github/tiaod/moleculer-io)
[![Downloads](https://img.shields.io/npm/dm/moleculer-io.svg)](https://www.npmjs.com/package/moleculer-io)
<h1>Moleculer-io</h1>

The `moleculer-io` is the API gateway service for [Moleculer](https://github.com/moleculerjs/moleculer) using `socket.io`. Use it to publish your services.

<h1>Features</h1>

-   Call moleculer actions by emiting Socket.io events.
-   Support Socket.io authorization (Default: `socket.client.user` => moleculer `ctx.meta.user`)
-   Whitelist.
-   Middlewares.
-   Broadcast events.
-   Joining and leaving rooms.

<h1>Install</h1>

```shell
$ npm install moleculer-io
```

<h1>Table of contents</h1>



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
-   List all actions: `socket.emit('call', '$node.list', callback)`

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

Then doing `socket.emit('call','math.add', {a:25, b:13}, callback)` on the client side
will be equivalent to `socket.emit('call','add', {a:25, b:13}, callback)`.

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

You can make use of custom functions within the declaration of event handler.

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

Note: If you provie a meta field here, it replace the socketGetMeta method's result.

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
    socketAuthorize(socket, eventHandler){
      let accessToken = socket.handshake.query.token
      if (accessToken) {
        if (accessToken === "12345") {
        // valid credential, return the user
          return Promise.resolve({ id: 1, detail: "You are authorized using token.", name: "John Doe" })
        } else {
        // invalid credentials
          return Promise.reject()
        }
      } else {
      // anonymous user
        return Promise.resolve()
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

In your action, set ctx.meta.$join or ctx.meta.$leave to the rooms you want to join or leave.

eg.

```javascript
ctx.meta.$join = 'room1' //Join room1
ctx.meta.$join = ['room1', 'room2'] // Join room1 and room2

ctx.meta.$leave = 'room1' //Leave room1
ctx.meta.$leave = ['room1', 'room2'] // Leave room1 and room2
```

After the action finished, `moleculer-io` will join or leave the room you specified.

Example room management service:

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

Note: You should change the 'io' to the service name you created.

## Using multiple instances

If you plan for a highly available setup (launching multiple instances of this service behind a Load Balancer),
you will have to take some extra steps. Due to the nature of WebSockets these instances will need a PubSub capable broker
to connect to, in order to broadcast messages to sockets which are connected to other instances. For a more
in depth explanation of this concept, and additional steps that have to be taken (such as Load Balancer configuration), refere to the [Socket.io Documentation](https://socket.io/docs/using-multiple-nodes/).

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

# Change logs
**1.0.8**: Fix [#12](https://github.com/tiaod/moleculer-io/issues/12)

**1.0.7**: Add `settings.server` options.

**1.0.6**: Set the babel targets.node to 'current'

**1.0.5**: Bug fix.

**1.0.4**: Bug fix.

**1.0.3**: Add `aliases` and `mappingPolicy` event properties.

**1.0.2**: `socketAuthorize` method can return the user now. Add `socketSaveUser` method.

**1.0.1**: Bug fix.

**1.0.0**: See [Migrate to 1.x](migration_to_v1.md).

**0.13.4**: Fix bug of multiple custom event handler.

**0.13.3**: Add internal pointer to service instance, make `socket.$service` pointed to service instance.

**0.13.2**: Added socket.io adapter options for intercommunication of multiple instances

**0.13.1**: Add request logger.

**0.13.0**: `moleculer-io` can now get alone well with `moleculer-web`, you can use them together!
	\- Note that `settings.options` now become to `settings.io`.

**0.12.1**: CustomHandler context now bind to the service instance.

**0.12.0**: Change `ctx.meta.$user` to `ctx.meta.user`, add `saveUser` method.

**0.11.0**: Bind middlewares context to service instance.

**0.10.0**: Add action visibility support. See [Action visibility](https://moleculer.services/docs/0.13/actions.html#Action-visibility)

**0.9.1**: Fix `ServiceNotFoundError` message.

**0.9.0**: Upgrade to `moleculer@0.13`, no breaking changes.

**0.8.1**: Fix io.broadcast error.

**0.8.0**: Add ctx.meta.$rooms, and ctx.meta.$join ctx.meta.$leave

**0.7.0**: Add hooks.

**0.6.0**: Modify settings format. again :)

**0.5.0**: Add broadcast to socket.io rooms

**0.4.0**: Modify settings format.

**0.3.0**: Add login handler.

**0.2.0**: Add `initServer` method.

# License

Moleculer-io is available under the MIT license.
