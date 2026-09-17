export function permitNavigation() {
  return window.dispatchEvent(
    new Event("widget-now:navigate", { cancelable: true }),
  );
}
