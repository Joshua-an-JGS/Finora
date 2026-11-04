// Custom sign script that skips code signing without invoking winCodeSign/signtool
exports.default = async function (configuration) {
  // No-op: skip signing
};

