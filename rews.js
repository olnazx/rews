'use strict';

/**
 * Local constants.
 */
const DEFAULT_BINARY_TYPE = 'blob';
const DEFAULT_TIMEOUT = 2500;
const DEFAULT_RECONNECT_IN = [0, 3000, 10000];

/**
 * Simple functional event emitter. One handler for one event.
 */
class EventEmitter {
  constructor () {
    this._handlers = {};
  }

  /**
   * Adds an event listener.
   * @param {String} type
   * @param {Function} handler
   * @return {void}
   */
  on (type, handler) {
    if (!type || typeof handler !== 'function') {
      return;
    }

    this._handlers[type] = handler;
  }

  /**
   * Removes an event listener.
   * @param {String} type
   * @return {void}
   */
  off (type) {
    if (!type) {
      return;
    }

    this._handlers[type] = undefined;
  }

  /**
   * Emits an event.
   * @param {String} type
   * @param {Any} event Event data.
   * @return {void}
   */
  emit (type, event) {
    if (!type) {
      return;
    }

    this._handlers[type] && this._handlers[type](event);
  }
}

/**
 * Local variables.
 */
let connectTimeout;
let delayTimeout;
let onOnlineRef;

/**
 * Reconnectable WebSocket.
 * 
 * WebSocket API: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
 */
export default class ReconnectableWebSocket extends EventEmitter {
  /**
   * Constructor.
   * @param {String} url The URL to which to connect.
   * @param {String / Array of String} protocols Either a single protocol string or an array of protocol strings.
   * @param {Object} options
   *   @property {String} binaryType  A string indicating the type of binary data being transmitted by the connection.
   *   @property {Number} timeout
   *   @property {Array of Number} reconnectIn
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
   */
  constructor (url, protocols, options) {
    if (typeof url !== 'string') {
      throw new Error('"url" must be a string.');
    }

    super();

    if (protocols && !options && (!Array.isArray(protocols) && typeof protocols !== 'string')) {
      options = protocols;
      protocols = undefined;
    }

    const self = this;

    let reconnectAttempts = 0;

    createWebSocket();

    function createWebSocket () {
      self._ws = new WebSocket(url, protocols);
      self._ws.binaryType = options.binaryType || DEFAULT_BINARY_TYPE;

      setUpWebSocket();
    }

    /**
     * WebSocket event listeners setup.
     * @return {void}
     */
    function setUpWebSocket () {
      // Connection established.
      self._ws.onopen = function (event) {
        self.emit('open', event);

        // Clear timeout.
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }

        // Reset attempts count.
        reconnectAttempts = 0;
      }

      // Connection closed.
      self._ws.onclose = function (event) {
        self.emit('close', event);

        // Clear timeout.
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }

        // Normally closed.
        // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent#Status_codes
        if (event.code === 1000) {
          self.emit('closed');

          return;
        }

        // User is offline now.
        if (navigator.onLine === false) {
          self.emit('offline');

          // Reset attempts count.
          reconnectAttempts = 0;

          // Listen to an "online" event, firing when user becomes online.
          manageConnectivityListener('add');

          return;
        }

        tryReconnect();
      }

      // Error occured.
      self._ws.onerror = function (event) {
        self.emit('error', event);
      }

      // Message received.
      self._ws.onmessage = function (event) {
        self.emit('message', event);
      }

      // Handling connect timeout.
      connectTimeout = setTimeout(() => {
        connectTimeout = null;

        // Close connection to force reconnection.
        self.close(4000);
      }, options.timeout || DEFAULT_TIMEOUT);
    }

    /**
     * Performs reconnection.
     * @return {void}
     */
    function tryReconnect () {
      const delay = (options.reconnectIn || DEFAULT_RECONNECT_IN)[reconnectAttempts];

      // Too many reconnections.
      if (delay === undefined) {
        self.emit('closed');

        return;
      }

      reconnectAttempts++;

      delayTimeout = setTimeout(() => {
        delayTimeout = null;

        createWebSocket();
      }, delay);
    }

    /**
     * "online" event listener.
     * @return {void}
     */
    function onOnline () {
      self.emit('online');

      // Remove "online" event listener.
      manageConnectivityListener('remove');

      // Try to reconnect.
      tryReconnect();
    }

    onOnlineRef = onOnline;

    /**
     * Sets and removes an "online" event listener.
     * @param {String} act ("add" or "remove")
     * @return {void}
     */
    function manageConnectivityListener (act) {
      window[act + 'EventListener']('online', onOnline);
    }
  }

  /**
   * Closes the WebSocket connection or connection attempt, if any. 
   * If the connection is already CLOSED, this method does nothing.
   * @param {Number} code A numeric value indicating the status code explaining why the connection is being closed.
   * @param {String} reason A human-readable string explaining why the connection is closing.
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#close()
   */
  close (code = 1000, reason) {
    return this._ws.close.call(this._ws, code, reason);
  }

  /**
   * Destroys WS instance, timeouts and unbinds event listeners.
   * @return {void}
   */
  destroy () {
    this._handlers = Object.create(null);
    this._ws.onclose = () => {};
    this._ws.close();

    clearTimeout(connectTimeout);
    clearTimeout(delayTimeout);

    window.removeEventListener('online', onOnlineRef);

    connectTimeout = null;
    delayTimeout = null;
    onOnlineRef = null;
    this._ws = null;
  }

  /**
   * Transmits data to the server over the WebSocket connection.
   * @param {String / ArrayBuffer / Blob} data
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#send()
   */
  send (data) {
    return this._ws.send.call(this._ws, data);
  }

  /**
   * A string indicating the type of binary data being transmitted by the connection. 
   * This should be either "blob" if DOM Blob objects are being used 
   * or "arraybuffer" if ArrayBuffer objects are being used.
   * @return {String}
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#Attributes
   */
  get binaryType () {
    return this._ws.binaryType;
  }

  /**
   * The number of bytes of data that have been queued 
   * using calls to send() but not yet transmitted to the network. 
   * This value resets to zero once all queued data has been sent. 
   * This value does not reset to zero when the connection is closed; 
   * if you keep calling send(), this will continue to climb.
   * @return {Number}
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#Attributes
   */
  get bufferedAmount () {
    return this._ws.bufferedAmount;
  }

  /**
   * The extensions selected by the server.
   * @return {String}
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#Attributes
   */
  get extensions () {
    return this._ws.extensions;
  }

  /**
   * A string indicating the name of the sub-protocol the server selected; 
   * this will be one of the strings specified in the protocols parameter 
   * when creating the WebSocket object.
   * @return {String}
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#Attributes
   */
  get protocol () {
    return this._ws.protocol;
  }

  /**
   * The current state of the connection; this is one of the Ready state constants.
   * @return {Number}
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#Ready_state_constants
   * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#Attributes
   */
  get readyState () {
    return this._ws.readyState;
  }

  /**
   * The URL as resolved by the constructor. This is always an absolute URL.
   * @return {String}
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#Attributes
   */
  get url () {
    return this._ws.url;
  }
}
