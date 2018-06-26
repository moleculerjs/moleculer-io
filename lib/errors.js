"use strict";

/*
 * moleculer-sc
 * Copyright (c) 2018 tiaod (https://github.com/tiaod/moleculer-sc)
 * MIT Licensed
 */

const MoleculerError = require("moleculer").Errors.MoleculerError;

const ERR_INVALID_TOKEN = "ERR_INVALID_TOKEN";
class UnAuthorizedError extends MoleculerError {
	/**
  * Creates an instance of UnAuthorizedError.
  *
  * @param {String} type
  * @param {any} data
  *
  * @memberOf UnAuthorizedError
  */
	constructor(type, data) {
		super("Unauthorized", 401, type || ERR_INVALID_TOKEN, data);
	}
}

class BadRequestError extends MoleculerError {
	constructor(type, data) {
		super('Bad Request', 400, type || "ERR_INVALID_FORMAT", data);
	}
}

module.exports = { UnAuthorizedError, BadRequestError };