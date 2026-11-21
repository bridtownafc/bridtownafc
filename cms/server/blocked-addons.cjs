// Stand-in for the `isolated-vm` and `rolldown` packages, whose prebuilt native
// add-ons (.node files) are unsigned and blocked by Windows Smart App Control.
// Directus imports both at start-up but only uses isolated-vm for sandboxed
// extensions and the Flows "Run Script" operation, and rolldown only when
// EXTENSIONS_ROLLDOWN is set (it uses rollup otherwise). This project uses none
// of those, so they throw if invoked and the rest of the admin works normally.
// Wired up in run-directus.mjs.
const unavailable = () => {
  throw new Error('This feature needs a native add-on that Windows Smart App Control blocks on this PC (sandboxed extensions, Flows "Run Script", EXTENSIONS_ROLLDOWN).');
};
const blocked = class { constructor() { unavailable(); } };

module.exports = {
  // isolated-vm
  Isolate: blocked, Reference: blocked, Callback: blocked, ExternalCopy: blocked, Context: blocked, Script: blocked, Module: blocked,
  // rolldown
  rolldown: unavailable,
};
