
# Changelog of 0.x.x and 1.x.x

**1.1.3**: Merge [#27](https://github.com/moleculerjs/moleculer-io/pull/27)

**1.1.1**: Fix [#18](https://github.com/moleculerjs/moleculer-io/issues/18)

**1.1.0**: Add cors config

**1.0.9**: Fix [#17](https://github.com/moleculerjs/moleculer-io/issues/17)

**1.0.8**: Fix [#12](https://github.com/moleculerjs/moleculer-io/issues/12)

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
