const IO = require('socket.io')
const debug = require('debug')('moleculer-io')
const _ = require('lodash')
const nanomatch = require('nanomatch')
const { ServiceNotFoundError } = require("moleculer").Errors;
const { BadRequestError } = require('./errors')

module.exports = {
  name:'io',
  settings:{
    options: {}, //socket.io options
    routes:[
      {
        namespace: '/', //default
        // middlewares: [],
        socket: {
          event:'call',
          // middlewares:[],
          // whitelist: [],
          // callOptions: {}
        }
      }
    ]
  },
  created(){
    // this.routes = {} //handlers
    // for(let item of this.settings.routes){ //attach new actions
    //   this.logger.info('Add handler:', item)
    //   this.routes[item.event] = this.makeHandler(item)
    // }
    this.handlers = {} //
    for(let item of this.settings.routes){
      this.logger.info('Add handler:', item)
      if(!this.handlers[item.namespace]) this.handlers[item.namespace] = {}
      this.handlers[item.namespace][item.socket.event] = this.makeHandler(item)
    }
  },
  methods: {
    listen(server){
      this.io = IO.listen(server)
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
    makeHandler:function(item){
      let namespace = item.namespace
      let eventName = item.socket.event
      let whitelist = item.socket.whitelist
      let opts = item.socket.callOptions
      debug('MakeHandler', eventName)
      const svc = this
      return async function(action, params, respond){
        debug(`Handle ${eventName} event:`,action, params)
        if(!_.isString(action)){
          debug(`BadRequest:action is not string! action:`,action)
          throw new BadRequestError()
        } // validate action
        try{
          let meta = svc.getMeta(this)
          opts =  _.assign({meta},opts)
          let res = await svc.callAction(action, params, opts, whitelist)
          if(_.isFunction(respond)) respond(null, res)
        }catch(err){
          debug('Call action error:',err)
          if(_.isFunction(respond)) svc.onError(err, respond)
        }
      }
    },
    getMeta(socket){
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
      throw new Error('No io object.')
    }
    for(let item of this.settings.routes){
      let nsp = item.namespace || '/'
      let eventName = item.socket.event
      let namespace = this.io.of(nsp)
      if(item.middlewares){ //Server middlewares
        for(let middleware of item.middlewares){
          namespace.use(middleware)
        }
      }

      namespace.on('connection', socket=>{
        this.logger.info(`[${nsp}]Client connected:`,socket.id)
        if(item.socket.middlewares){ //socketmiddlewares
          for(let middleware of item.socket.middlewares){
            socket.use(middleware)
          }
        }
        debug('Attach event:', eventName)
        socket.on(eventName, this.handlers[nsp][eventName])
      })
    }
    this.io.on('connection', client=>{
      this.logger.info('Client connected:', client.id)
      for(let event in this.routes){
        debug('Attach event:', event)
        client.on(event, this.routes[event]) //attach to socket
      }
    })
  }
}
