# rews &middot; [![npm](https://img.shields.io/npm/v/rews.svg)](https://npm.im/rews) [![npm](https://img.shields.io/npm/dt/rews.svg)](https://npm.im/rews)

Reconnectable WebSocket for the web.

### Installation

```sh
$ npm install rews
```

### Usage

```js
import ReWS from 'rews';

const client = new ReWS('ws://example.com/wss');

// ReWS supports all native WebSocket events as described here:
// https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

// For example:
client.on('open', event => {
  console.log('Connection opened.');
  client.send('Hello World');
});

client.on('message', event => console.log('New message received:', event.data));

// As well as some helpful custom events: "closed", "offline" and "online".

client.on('closed', () => console.log('Connection closed and will not be opened again.'));
client.on('offline', () => console.log('You have no internet connection'));
client.on('online', () => console.log('You are back online. Reconnecting..'));
```
