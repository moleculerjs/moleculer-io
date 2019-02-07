# Migration Guide for moving from Moleculer-io 0.x to 1.x
Version 1.0.0 is a rewritten of `moleculer-io`, in order to make `moleculer-web` and `moleculer-io` more compatible.

## Init server
In moleculer-io 0.x:
```js
ioService.initServer()
```
In moleculer-io 1.x:
```js
ioService.initSocketIO()
```

## Setting
In moleculer-io 0.x:
```js
settings:{
  port: 3000,
  io: {}, //socket.io options
  adapter: {
    module: require('socket.io-...') // socket.io adapter module
    options: {} // socket.io adapter options
  },
  namespaces: {
    '/':{
      middlewares:[],
      packetMiddlewares:[],
      events:{
        'call':{
          whitelist: [],
          callOptions:{},
          before: async function(ctx, socket, args){},
          after:async function(ctx, socket, res){}
        }
      }
    }
  }
}
```

In moleculer-io 1.x:
```js
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
Changes:
1. move `settings.namespaces` to the `settings.io.namespaces` field, and move the socket.io options to `settings.io.options`
2. Hooks name are changed. `before` => `onBeforeCall`; `after` => `onAfterCall`
3. The `onBeforeCall` take the params of `(ctx, socket, action, params, callOptions)`

**Why remove the adapter field? How can I set the adapter for socket.io?**

Because you can set it in `settings.io.options`:
```js
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000,
    io: {
      options: {
        adapter: redisAdapter({ host: 'localhost', port: 6379 })
      }
    }
  }
})
```

## Authorization
This is a new feature, you can define `socketAuthorize` method to authorize your socket on connect. See [Authorization](README.md#authorization)

Then moleculer-io will add a authorize middleware to your namespace.

Some service methods name are also changed
- getMeta -> socketGetMeta
- saveUser -> socketSaveMeta
- onError -> socketOnError
