# Ethermeris
An Experimental Real-time State Management Networking Framework for Node.js

## Features
Ethermeris is a real-time networking framework that simplifies state management between the server and clients. It consists of:
- A Node.js module for the server
- A JavaScript client library for the browser

**⚠ WARNING ⚠**
This package is very experimental and is not at all meant to be used in production. Many security features are missing and many bugs are yet to be found. You have been warned.

### Main Features:
Ethermeris is very similar to other networking frameworks but:
Ethermeris's main advantage is speed. 

**UDP Networking through WebRTC**
Ethermeris uses WebRTC to communicate between the server and clients to accomplish fast pack speeds. If WebRTC isn't supported on the browser, WebSockets is automatically used as a fallback.

**Event Compression through MessagePack**
Ethermeris automatically compresses and decompress event data using MessagePack end-to-end. By compressing JSON objects into binary blobs, Ethermeris can achieve high speeds.

**Built-in State Management**
The Ethermeris Server also provides a singular state that gets automatically synced with all clients intelligently. Currently, it is very restricting. There are some things to know about this state:
- MessagePack converts undefined to null during encoding, so do not use undefined in the state.
- Currently, to denote that a value should be deleted from the state, the value has to be set to null.
- Because of the two points above, instead of using null to show emptiness of a value, use something else that's more fitting such as an empty string or false.
- Arrays are not meant to be used within the state. Instead of holding collections of objects using arrays, use a normal object instead, and use the IDs of the objects as keys.

**Custom Object Compression**
Not implemented yet.

