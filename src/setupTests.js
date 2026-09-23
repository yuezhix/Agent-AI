// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Ant Design uses matchMedia for responsive behavior; jsdom does not provide it.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// React 19 / rc-component schedule work with MessageChannel, which the jsdom version bundled
// with react-scripts 5 does not provide.
if (typeof global.MessageChannel === 'undefined') {
  global.MessageChannel = class MessageChannel {
    constructor() {
      this.port1 = { onmessage: null, postMessage: () => {}, close: () => {} };
      this.port2 = {
        postMessage: (data) => {
          setTimeout(() => this.port1.onmessage?.({ data }), 0);
        },
        close: () => {},
      };
    }
  };
}
