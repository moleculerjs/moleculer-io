<a name="v3.0.0"></a>

# 3.0.0

## Breaking changes
- **Minimum Node.js version raised to v22** (from v10).
- **Minimum Moleculer version raised to v0.14** (dropped v0.13 support from peerDependencies).
- Deprecated `socket.io-redis` adapter replaced with `@socket.io/redis-adapter` in examples.
- Deprecated `broker.createService(schema, schemaMods)` usage removed from tests (use `mixins` instead).
- Jest upgraded to v30 — deprecated assertion aliases (`toBeCalledTimes`, `toBeCalledWith`) replaced with canonical names.

## Moleculer 0.15 compatibility
- **Streaming API updated**: examples now use the new calling options pattern (`{ stream }`) instead of passing stream as `ctx.params`. The `file.save` example reads from `ctx.stream` instead of `ctx.params.pipe()`.
- **TypeScript definitions updated** for Moleculer 0.15:
  - Added `SocketIOMeta` interface with typed meta fields (`$socketId`, `$rooms`, `$join`, `$leave`, `user`).
  - Hook signatures (`onBeforeCall`, `onAfterCall`) now use typed `Context<..., SocketIOMeta>`.
  - Added `registerNamespace` and `removeNamespace` to `IOServiceMethods`.
  - Added `createNamespace` option to `IONamespace` interface.

## Dependency upgrades
- **ESLint**: migrated from v8 to v9 with flat config (`eslint.config.js`).
  - `eslint-plugin-node` → `eslint-plugin-n` v17
  - `eslint-plugin-promise` v5 → v7
  - `eslint-plugin-security` v1 → v4
  - `eslint-plugin-prettier` v4 → v5, `eslint-config-prettier` v8 → v10
  - `prettier` v2 → v3
- **Jest**: v27 → v30 (removed separate `jest-cli`).
- **socket.io**: v4.5 → v4.8 (both server and client).
- **express**: v4 → v5, **nodemon**: v2 → v3, **winston**: v3.8 → v3.19.
- **moleculer**: devDep updated to `^0.15.0`, **moleculer-repl**: `^0.8.0`, **moleculer-web**: `^0.11.0`.
- **lodash**: v4.17.21 → v4.17.23.

## Other changes
- Sanitized filename with `path.basename()` in file upload example to prevent path traversal.
- Added minimal `file` service to test helper for upload handler completeness.
- Updated CI workflow to test on Node.js 22 and 24 (using `actions/checkout@v4`, `actions/setup-node@v4`).
- Updated copyright years to 2026.

---

<a name="v2.2.0"></a>

# [2.2.0](https://github.com/moleculerjs/moleculer-io/compare/v2.1.0...v2.2.0) (2022-11-07)

- Prevent request/response log based on settings [#52](https://github.com/moleculerjs/moleculer-io/pull/52)


<a name="v2.1.0"></a>

# [2.1.0](https://github.com/moleculerjs/moleculer-io/compare/v2.0.0...v2.1.0) (2022-08-13)

- support dynamic namespaces [#50](https://github.com/moleculerjs/moleculer-io/pull/50)
- added metrics [#51](https://github.com/moleculerjs/moleculer-io/pull/51)


<a name="v2.0.0"></a>
# [2.0.0](https://github.com/moleculerjs/moleculer-io/compare/2443ce39edf16c0ead578b7e567df94eaf9f0ab9...v2.0.0) (2022-01-09)

- **[breaking change]** upgrade to Socket.io v4.
- refactored codebase.
- added integration tests.
- fixed namespace middleware handling issue.


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
