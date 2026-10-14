import {Buffer} from 'buffer';

// Dependencies can use Buffer while their modules initialize, before launch.js runs.
globalThis.Buffer ??= Buffer;
export {Buffer};
