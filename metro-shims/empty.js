// Node core modules are never executed on-device (TypeScript's sys loader and
// similar guards only touch them on real Node). These empty shims exist solely
// so Metro can statically resolve literal require("fs")/etc calls inside
// bundled libraries such as the TypeScript compiler used for diagnostics.
module.exports = {};
