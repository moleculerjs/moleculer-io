const IO = require('socket.io')
const debug = require('debug')('moleculer-io')
const _ = require('lodash')
const nanomatch = require('nanomatch')
const { ServiceNotFoundError } = require("moleculer").Errors;
const { BadRequestError } = require('./errors')

module.exports = {
  name:'io',
  settings:{
    port: 3000,
    // options: {}, //socket.io options
    routes:[
      {
        namespace: '/',
        middlewares: [],
        socket: {
          middlewares: [],
          handlers: [
            {
              event: 'call',
              // type: 'call',
              // whitelist: [],
              callOptions:{}
            }
          ]
        }
      }
    ]
  },
  created(){
    this.handlers = {} //
    for(let item of this.settings.routes){
      this.logger.info('Add route:', item)
      if(!this.handlers[item.namespace]) this.handlers[item.namespace] = {}
      let events = item.socket.handlers
      for(let handlerItem of item.socket.handlers){
        switch (handlerItem.type || 'call') {
          case 'call':
            this.handlers[item.namespace][handlerItem.event] = this.makeHandler(
              handlerItem.event,
              handlerItem.whitelist,
              handlerItem.callOptions,
            )
            break;
          case 'login':
            this.handlers[item.namespace][handlerItem.event] = this.makeLoginHandler(
              handlerItem.event,
              handlerItem.whitelist,
              handlerItem.callOptions,
            )
            break
          default:
            throw new Error(`Unknow handler type: ${events[eventName].type}`)
        }
      }
    }
  },
  methods: {
    initServer(srv, opts){
      if ('object' == typeof srv && srv instanceof Object && !srv.listen) {
        opts = srv;
        srv = null;
      }
      opts = opts || this.settings.options
      srv = srv || this.settings.port
      this.io = new IO(srv, opts)
    },
    checkWhitelist(action, whitelist) {
			return whitelist.find(mask => {
				if (_.isString(mask)) {
					return nanomatch.isMatch(action, mask, { unixify: false })
				}
				else if (_.isRegExp(mask)) {
					return mask.test(action)
				}
			}) != null
		},
    async callAction(action, params, opts, whitelist){
      if(whitelist && !this.checkWhitelist(action, whitelist)){//check whitelist
        debug(`Service "${action}" not found`)
        throw new ServiceNotFoundError(action)
      }
      debug('Call action:', action, params, opts)
      return await this.broker.call(action, params, opts)
    },
    makeHandler:function(eventName, whitelist, opts){
      debug('MakeHandler', eventName)
      const svc = this
      return async function(action, params, respond){
        debug(`Handle ${eventName} event:`,action)
        if(!_.isString(action)){
          debug(`BadRequest:action is not string! action:`,action)
          throw new BadRequestError()
        }
        if(_.isFunction(params)){
          respond = params
          params = null
        }
        try{
          let meta = svc.getMeta(this)
          let res = await svc.callAction(action, params, _.assign({meta},opts), whitelist)
          if(_.isFunction(respond)) respond(null, res)
        }catch(err){
          debug('Call action error:',err)
          if(_.isFunction(respond)) svc.onError(err, respond)
        }
      }
    },
    makeLoginHandler:function(eventName, whitelist, opts){
      let handler = this.makeHandler(eventName, whitelist, opts)
      return async function(action, params, respond){
        let socket = this
        handler.call(socket, action, params, (err, res)=>{
          if(err) return respond(err)
          socket.client.user = res
          respond(err,res)
        })
      }
    },
    getMeta(socket){
      debug('getMeta', socket.client.user)
      return {
        user: socket.client.user
      }
    },
    onError(err, respond){
      debug('onError',err)
      const errObj = _.pick(err, ["name", "message", "code", "type", "data"]);
      return respond(errObj)
    }
  },
  started(){
    if(!this.io){
      this.initServer()
    }
    for(let item of this.settings.routes){
      let namespace = this.io.of(item.namespace || '/')
      if(item.middlewares){ //Server middlewares
        for(let middleware of item.middlewares){
          namespace.use(middleware)
        }
      }
      let handlers = this.handlers[item.namespace]
      namespace.on('connection', socket=>{
        this.logger.info(`(nsp:'${item.namespace}') Client connected:`,socket.id)
        if(item.socket.middlewares){ //socketmiddlewares
          for(let middleware of item.socket.middlewares){
            socket.use(middleware)
          }
        }
        for(let eventName in handlers){
          debug('Attach event:', eventName)
          socket.on(eventName, handlers[eventName])
        }
      })
    }
    // this.io.on('connection', client=>{
    //   this.logger.info('Client connected:', client.id)
    //   for(let event in this.routes){
    //     debug('Attach event:', event)
    //     client.on(event, this.routes[event]) //attach to socket
    //   }
    // })
  }
}
