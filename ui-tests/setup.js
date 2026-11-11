// jsdom does not implement scrollIntoView, which real browsers have. The form uses it to bring the first
// invalid field into view, so the simulated browser gets a no-op.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
