const IO = require('socket.io')
const _ = require('lodash')
const { match } = require('moleculer').Utils
const { ServiceNotFoundError } = require("moleculer").Errors;
const { BadRequestError } = require('./errors')
const chalk = require('chalk')

module.exports = {
  name: 'io',
  settings: {
    // port: 3000,
    io: {
      // options: {}, //socket.io options
      // adapter: redis({ host: 'localhost', port: 6379 }),
      namespaces: {
        '/':{
          // middlewares: [],
          // packetMiddlewares:[],
          events: {
            call: {
              // whitelist: [],
              // callOptions:{},
              // onBeforeCall: async function(ctx, socket, args){
              //   ctx.meta.socketid = socket.id
              // },
              // onAfterCall:async function(ctx, socket, data){
              //  socket.emit('afterCall', data)
              // }
            }
          }
        }
      }
    }
  },
  created(){
    let handlers = {}
    for(let nsp in namespaces){
      let item = namespaces[nsp]
      debug('Add route:', item)
      if(!handlers[nsp]) handlers[nsp] = {}
      let events = item.events
      for(let event in events){
        let handler = events[event]
        if(typeof handler === 'function'){ //custom handler
          handlers[nsp][event] = handler
        }else{
          handlers[nsp][event] = makeHandler(handler)
        }
      }
    }
    this.settings.io.handlers = handlers
  },
  started(){
    if(!this.io){
      this.initSocketIO()
    }
    let namespaces = this.settings.namespaces
    for(let nsp in namespaces){
      let namespace = this.io.of(nsp)
      if(namespaces[nsp].middlewares){ //Server middlewares
        for(let middleware of namespaces[nsp].middlewares){
          namespace.use(middleware.bind(this))
        }
      }
      let handlers = this.settings.io.handlers[key]
      namespace.on('connection', socket=>{
        socket.$service = this
        this.logger.info(`(nsp:'${nsp}') Client connected:`,socket.id)
        if(item.packetMiddlewares){ //socketmiddlewares
          for(let middleware of item.packetMiddlewares){
            socket.use(middleware.bind(this))
          }
        }
        for(let eventName in handlers){
          socket.on(eventName, handlers[eventName])
        }
      })
    }
  },
  stopped(){
    if(this.io){
      return new Promise((resolve, reject)=>{
        this.io.close(err=>{
          // if (err)
			    //   return reject(err) //Ignore this error
					this.logger.info("Socket.io API Gateway stopped!")
					resolve()
        })
      })
    }
  },
  actions: {
    call: {
      visibility: "private",
      async handler(ctx){
        let {socket, action, params, handlerItem} = ctx.params
        if(!_.isString(action)){
          debug(`BadRequest:action is not string! action:`,action)
          throw new BadRequestError()
        }
        //Check whitelist
        if(handlerItem.whitelist && !this.checkIOWhitelist(action, handlerItem.whitelist)){
          debug(`Service "${action}" not found`)
          throw new ServiceNotFoundError({action})
        }
        // Check endpoint visibility
        const endpoint = svc.broker.findNextActionEndpoint(action)
        if (endpoint instanceof Error)
          throw endpoint
        if (endpoint.action.visibility != null && endpoint.action.visibility != "published") {
          // Action can't be published
          throw new ServiceNotFoundError({ action })
        }
        // get callOptions
        let opts = _.assign({
          meta: this.getMeta(socket)
        }, handlerItem.callOptions)
        this.logger.debug('Call action:', action, params, opts)
        if(handlerItem.onBeforeCall){
          await handlerItem.onBeforeCall.call(this, ctx, socket, action, params, opts)
        }
        let res = await ctx.call(action, params, opts)
        if(handlerItem.onAfterCall){
          res = await handlerItem.onAfterCall.call(this, ctx, socket, res) || res
        }
        this.socketSaveMeta(socket, ctx)
        if(ctx.meta.$join){
          await this.socketJoinRooms(socket, ctx.meta.$join)
        }
        if(ctx.meta.$leave){
          if(_.isArray(ctx.meta.$leave)){
            await Promise.all(ctx.meta.$leave.map(room=>this.leaveRoom(socket, room)))
          }else{
            await this.leaveRoom(socket, ctx.meta.$leave)
          }
        }
        return res
      }
    }
  },
  methods: {
    initSocketIO(srv, opts){
      if ('object' == typeof srv && srv instanceof Object && !srv.listen) {
        opts = srv;
        srv = null;
      }
      opts = opts || this.settings.io
      srv = srv || this.server || this.settings.port
      this.io = new IO(srv, opts)
      if (this.settings.adapter) {
        this.io.adapter(this.settings.adapter)
      }
      this.logger.info('Socket.io API Gateway started.')
    },
    socketGetMeta(){
      let meta = {
        user: socket.client.user,
        $rooms: Object.keys(socket.rooms)
      }
      debug('getMeta', meta)
      return meta
    },
    socketSaveMeta(socket,ctx){
      socket.client.user = ctx.meta.user
    },
    socketOnError(err, respond){
      debug('onIOError',err)
      const errObj = _.pick(err, ["name", "message", "code", "type", "data"]);
      return respond(errObj)
    },
    socketJoinRooms(socket, rooms){
      debug(`socket ${socket.id} join room:`, rooms)
      return new Promise(function(resolve, reject) {
        socket.join(rooms,err=>{
          if(err){
            reject(err)
          } else {
            resolve()
          }
        })
      })
    },
    socketLeaveRoom(socket, room){
      return new Promise(function(resolve, reject) {
        socket.leave(room,err=>{
          if(err){
            reject(err)
          } else {
            resolve()
          }
        })
      })
    },
  }
}

function checkWhitelist(action, whitelist){
  return whitelist.find(mask => {
    if (_.isString(mask)) {
      return match(action, mask)
    }
    else if (_.isRegExp(mask)) {
      return mask.test(action)
    }
  }) != null
}


function makeHandler(svc, handlerItem){
  svc.logger.debug('makeHandler:', handlerItem)
  return async function(action, params, respond){
    svc.logger.info(`   => Client '${this.id}' call '${action}'`);
    if (svc.settings.logRequestParams && svc.settings.logRequestParams in svc.logger)
        svc.logger[svc.settings.logRequestParams]("   Params:", params);
    try{
      if(_.isFunction(params)){
        respond = params
        params = null
      }
      let res = await svc.actions.call({socket:this, action, params, opts, handlerItem})
      svc.logger.info(`   <= ${chalk.green.bold('Success')} ${action}`)
      if(_.isFunction(respond)) respond(null, res)
    }catch(err){
      if (svc.settings.log4XXResponses || (err && !_.inRange(err.code, 400, 500))) {
        svc.logger.error("   Request error!", err.name, ":", err.message, "\n", err.stack, "\nData:", err.data);
      }
      if(_.isFunction(respond)) svc.socketOnError(err, respond)
    }
  }
}
