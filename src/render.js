// Views register their render functions; render() runs them all in registration order.
// Options are passed through, e.g. render({ flash: [2] }) to highlight nights the fill just set.
const fns = [];
export const onRender = (fn) => fns.push(fn);
export const render = (opts = {}) => fns.forEach((fn) => fn(opts));
