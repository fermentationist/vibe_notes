import * as ws from "lib0/websocket";
import * as map from "lib0/map";
import * as error from "lib0/error";
import * as random from "lib0/random";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { ObservableV2 } from "lib0/observable";
import * as logging from "lib0/logging";
import * as promise from "lib0/promise";
import * as bc from "lib0/broadcastchannel";
import * as buffer from "lib0/buffer";
import * as math from "lib0/math";
import { createMutex } from "lib0/mutex";

import * as Y from "yjs"; // eslint-disable-line
import Peer from "simple-peer";

import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";

import * as cryptoutils from "./crypto.js";

const log = logging.createModuleLogger("y-webrtc");

// Immediate verification that patched library is loaded
console.log("🔥 PATCHED Y-WEBRTC LIBRARY LOADED - Version with TURN servers and enhanced logging");

const messageSync = 0;
const messageQueryAwareness = 3;
const messageAwareness = 1;
const messageBcPeerId = 4;

/**
 * @type {Map<string, SignalingConn>}
 */
const signalingConns = new Map();

/**
 * @type {Map<string,Room>}
 */
const rooms = new Map();

/**
 * @param {Room} room
 */
const checkIsSynced = (room) => {
  let synced = true;
  room.webrtcConns.forEach((peer) => {
    if (!peer.synced) {
      synced = false;
    }
  });
  if ((!synced && room.synced) || (synced && !room.synced)) {
    room.synced = synced;
    room.provider.emit("synced", [{ synced }]);
    log("synced ", logging.BOLD, room.name, logging.UNBOLD, " with all peers");
  }
};

/**
 * @param {Room} room
 * @param {Uint8Array} buf
 * @param {function} syncedCallback
 * @return {encoding.Encoder?}
 */
const readMessage = (room, buf, syncedCallback) => {
  const decoder = decoding.createDecoder(buf);
  const encoder = encoding.createEncoder();
  const messageType = decoding.readVarUint(decoder);
  if (room === undefined) {
    return null;
  }
  const awareness = room.awareness;
  const doc = room.doc;
  let sendReply = false;
  switch (messageType) {
    case messageSync: {
      encoding.writeVarUint(encoder, messageSync);
      const syncMessageType = syncProtocol.readSyncMessage(
        decoder,
        encoder,
        doc,
        room
      );
      if (
        syncMessageType === syncProtocol.messageYjsSyncStep2 &&
        !room.synced
      ) {
        syncedCallback();
      }
      if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
        sendReply = true;
      }
      break;
    }
    case messageQueryAwareness:
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          awareness,
          Array.from(awareness.getStates().keys())
        )
      );
      sendReply = true;
      break;
    case messageAwareness:
      awarenessProtocol.applyAwarenessUpdate(
        awareness,
        decoding.readVarUint8Array(decoder),
        room
      );
      break;
    case messageBcPeerId: {
      const add = decoding.readUint8(decoder) === 1;
      const peerName = decoding.readVarString(decoder);
      if (
        peerName !== room.peerId &&
        ((room.bcConns.has(peerName) && !add) ||
          (!room.bcConns.has(peerName) && add))
      ) {
        const removed = [];
        const added = [];
        if (add) {
          room.bcConns.add(peerName);
          added.push(peerName);
        } else {
          room.bcConns.delete(peerName);
          removed.push(peerName);
        }
        room.provider.emit("peers", [
          {
            added,
            removed,
            webrtcPeers: Array.from(room.webrtcConns.keys()),
            bcPeers: Array.from(room.bcConns),
          },
        ]);
        broadcastBcPeerId(room);
      }
      break;
    }
    default:
      console.error("Unable to compute message");
      return encoder;
  }
  if (!sendReply) {
    // nothing has been written, no answer created
    return null;
  }
  return encoder;
};

/**
 * @param {WebrtcConn} peerConn
 * @param {Uint8Array} buf
 * @return {encoding.Encoder?}
 */
const readPeerMessage = (peerConn, buf) => {
  const room = peerConn.room;
  log(
    "received message from ",
    logging.BOLD,
    peerConn.remotePeerId,
    logging.GREY,
    " (",
    room.name,
    ")",
    logging.UNBOLD,
    logging.UNCOLOR
  );
  return readMessage(room, buf, () => {
    peerConn.synced = true;
    log(
      "synced ",
      logging.BOLD,
      room.name,
      logging.UNBOLD,
      " with ",
      logging.BOLD,
      peerConn.remotePeerId
    );
    checkIsSynced(room);
  });
};

/**
 * @param {WebrtcConn} webrtcConn
 * @param {encoding.Encoder} encoder
 */
const sendWebrtcConn = (webrtcConn, encoder) => {
  log(
    "send message to ",
    logging.BOLD,
    webrtcConn.remotePeerId,
    logging.UNBOLD,
    logging.GREY,
    " (",
    webrtcConn.room.name,
    ")",
    logging.UNCOLOR
  );
  try {
    webrtcConn.peer.send(encoding.toUint8Array(encoder));
  } catch (e) {}
};

/**
 * @param {Room} room
 * @param {Uint8Array} m
 */
const broadcastWebrtcConn = (room, m) => {
  log("broadcast message in ", logging.BOLD, room.name, logging.UNBOLD);
  room.webrtcConns.forEach((conn) => {
    try {
      conn.peer.send(m);
    } catch (e) {}
  });
};

export class WebrtcConn {
  /**
   * @param {SignalingConn} signalingConn
   * @param {boolean} initiator
   * @param {string} remotePeerId
   * @param {Room} room
   */
  constructor(signalingConn, initiator, remotePeerId, room) {
    console.log("🚀 PATCHED LIBRARY: WebrtcConn constructor called for", remotePeerId);
    console.log("🔍 PATCHED LIBRARY: Constructor params:", {
      signalingConn: !!signalingConn,
      initiator,
      remotePeerId,
      room: !!room,
      roomProvider: !!room?.provider,
      roomProviderPeerOpts: room?.provider?.peerOpts
    });
    
    log("establishing connection to ", logging.BOLD, remotePeerId);
    this.room = room;
    this.remotePeerId = remotePeerId;
    this.glareToken = undefined;
    this.closed = false;
    this.connected = false;
    this.synced = false;
    /**
     * @type {any}
     */
    const iceServers = room.provider.iceServers || defaultIceServers;
    
    // Check if peerOpts already has config with iceServers to avoid duplication
    const providerPeerOpts = room.provider.peerOpts || {};
    const hasProviderIceServers = providerPeerOpts.config && providerPeerOpts.config.iceServers;
    
    // Separate config and other options to avoid conflicts
    const { config: providerConfig, ...otherProviderOpts } = providerPeerOpts;
    
    const peerConfig = {
      ...otherProviderOpts,  // Spread provider options first
      initiator,             // Then override with our initiator value
      config: {
        iceServers: hasProviderIceServers ? providerConfig.iceServers : iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: "all",
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        ...(providerConfig || {}),  // Spread provider config
      },
    };
    
    console.log("🔍 PATCHED LIBRARY: Final peerConfig before Peer creation:", JSON.stringify(peerConfig, null, 2));
    console.log("🔧 PATCHED LIBRARY: Creating peer with config:", peerConfig);
    console.log(
      "🔧 PATCHED LIBRARY: Creating peer with config:",
      peerConfig
    );
    console.log(
      "🌐 PATCHED LIBRARY: ICE servers:",
      iceServers.map((s) => s.urls)
    );
    
    // Wrap peer creation in try-catch to handle mobile compatibility issues
    try {
      this.peer = new Peer(peerConfig);
      console.log("✅ PATCHED LIBRARY: Peer created successfully");
    } catch (error) {
      console.error("🚨 PATCHED LIBRARY: Peer creation failed:", error);
      console.error("This may be due to mobile-desktop WebRTC compatibility issues");
      
      // Try fallback configuration with minimal settings
      try {
        const fallbackConfig = {
          initiator: peerConfig.initiator,
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" }
            ]
          }
        };
        console.log("🔄 PATCHED LIBRARY: Attempting fallback peer creation");
        this.peer = new Peer(fallbackConfig);
        console.log("✅ PATCHED LIBRARY: Fallback peer created successfully");
      } catch (fallbackError) {
        console.error("❌ PATCHED LIBRARY: Fallback peer creation also failed:", fallbackError);
        // Create a dummy peer object to prevent further errors
        this.peer = {
          destroy: () => {},
          on: () => {},
          signal: () => {},
          send: () => {}
        };
        this.closed = true;
        return;
      }
    }
    this.peer.on("signal", (signal) => {
      if (this.glareToken === undefined) {
        // add some randomness to the timestamp of the offer
        this.glareToken = Date.now() + Math.random();
      }
      publishSignalingMessage(signalingConn, room, {
        to: remotePeerId,
        from: room.peerId,
        type: "signal",
        token: this.glareToken,
        signal,
      });
    });
    this.peer.on("connect", () => {
      log("connected to ", logging.BOLD, remotePeerId);
      this.connected = true;
      // send sync step 1
      const provider = room.provider;
      const doc = provider.doc;
      const awareness = room.awareness;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeSyncStep1(encoder, doc);
      sendWebrtcConn(this, encoder);
      const awarenessStates = awareness.getStates();
      if (awarenessStates.size > 0) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(
            awareness,
            Array.from(awarenessStates.keys())
          )
        );
        sendWebrtcConn(this, encoder);
      }
    });
    this.peer.on("close", () => {
      this.connected = false;
      this.closed = true;
      if (room.webrtcConns.has(this.remotePeerId)) {
        room.webrtcConns.delete(this.remotePeerId);
        room.provider.emit("peers", [
          {
            removed: [this.remotePeerId],
            added: [],
            webrtcPeers: Array.from(room.webrtcConns.keys()),
            bcPeers: Array.from(room.bcConns),
          },
        ]);
      }
      checkIsSynced(room);
      this.peer.destroy();
      log("closed connection to ", logging.BOLD, remotePeerId);
      announceSignalingInfo(room);
    });
    this.peer.on("error", (err) => {
      log("Error in connection to ", logging.BOLD, remotePeerId, ": ", err);
      log("Error details:", {
        type: err.type || "unknown",
        message: err.message || "no message",
        code: err.code || "no code",
      });
      announceSignalingInfo(room);
    });

    // Add comprehensive ICE connection monitoring
    this.peer.on("iceStateChange", (iceConnectionState, iceGatheringState) => {
      log("ICE state change for", logging.BOLD, remotePeerId, ":", {
        connection: iceConnectionState,
        gathering: iceGatheringState,
      });
      
      if (iceConnectionState === 'failed') {
        log("❌ ICE connection failed for", logging.BOLD, remotePeerId);
      } else if (iceConnectionState === 'connected') {
        log("✅ ICE connection established for", logging.BOLD, remotePeerId);
      } else if (iceConnectionState === 'disconnected') {
        log("⚠️ ICE connection disconnected for", logging.BOLD, remotePeerId);
      }
    });

    // Monitor signaling state
    this.peer.on("signalingStateChange", (signalingState) => {
      log(
        "Signaling state change for",
        logging.BOLD,
        remotePeerId,
        ":",
        signalingState
      );
    });

    // Add ICE candidate monitoring
    this.peer._pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        log("ICE candidate for", logging.BOLD, remotePeerId, ":", {
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address,
          port: event.candidate.port,
          candidate: event.candidate.candidate
        });
      } else {
        log("ICE gathering complete for", logging.BOLD, remotePeerId);
      }
    });

    // Monitor connection state changes
    this.peer._pc.addEventListener('connectionstatechange', () => {
      log("Connection state for", logging.BOLD, remotePeerId, ":", this.peer._pc.connectionState);
    });
    this.peer.on("data", (data) => {
      const answer = readPeerMessage(this, data);
      if (answer !== null) {
        sendWebrtcConn(this, answer);
      }
    });
  }

  destroy() {
    this.peer.destroy();
  }
}

/**
 * @param {Room} room
 * @param {Uint8Array} m
 */
const broadcastBcMessage = (room, m) =>
  cryptoutils
    .encrypt(m, room.key)
    .then((data) => room.mux(() => bc.publish(room.name, data)));

/**
 * @param {Room} room
 * @param {Uint8Array} m
 */
const broadcastRoomMessage = (room, m) => {
  if (room.bcconnected) {
    broadcastBcMessage(room, m);
  }
  broadcastWebrtcConn(room, m);
};

/**
 * @param {Room} room
 */
const announceSignalingInfo = (room) => {
  console.log("📢 PATCHED LIBRARY: Announcing signaling info for room", room.name, "peerId:", room.peerId);
  signalingConns.forEach((conn, index) => {
    console.log(`📡 PATCHED LIBRARY: Checking signaling conn ${index}:`, conn.url, "connected:", conn.connected);
    // only subscribe if connection is established, otherwise the conn automatically subscribes to all rooms
    if (conn.connected) {
      console.log(`✅ PATCHED LIBRARY: Subscribing to room ${room.name} on ${conn.url}`);
      conn.send({ type: "subscribe", topics: [room.name] });
      if (room.webrtcConns.size < room.provider.maxConns) {
        console.log(`📣 PATCHED LIBRARY: Announcing presence in room ${room.name} from ${room.peerId}`);
        publishSignalingMessage(conn, room, {
          type: "announce",
          from: room.peerId,
        });
      }
    } else {
      console.log(`❌ PATCHED LIBRARY: Signaling conn ${index} not connected:`, conn.url);
    }
  });
};

/**
 * @param {Room} room
 */
const broadcastBcPeerId = (room) => {
  if (room.provider.filterBcConns) {
    // broadcast peerId via broadcastchannel
    const encoderPeerIdBc = encoding.createEncoder();
    encoding.writeVarUint(encoderPeerIdBc, messageBcPeerId);
    encoding.writeUint8(encoderPeerIdBc, 1);
    encoding.writeVarString(encoderPeerIdBc, room.peerId);
    broadcastBcMessage(room, encoding.toUint8Array(encoderPeerIdBc));
  }
};

export class Room {
  /**
   * @param {Y.Doc} doc
   * @param {WebrtcProvider} provider
   * @param {string} name
   * @param {CryptoKey|null} key
   */
  constructor(doc, provider, name, key) {
    /**
     * Do not assume that peerId is unique. This is only meant for sending signaling messages.
     *
     * @type {string}
     */
    this.peerId = random.uuidv4();
    this.doc = doc;
    /**
     * @type {awarenessProtocol.Awareness}
     */
    this.awareness = provider.awareness;
    this.provider = provider;
    this.synced = false;
    this.name = name;
    // @todo make key secret by scoping
    this.key = key;
    /**
     * @type {Map<string, WebrtcConn>}
     */
    this.webrtcConns = new Map();
    /**
     * @type {Set<string>}
     */
    this.bcConns = new Set();
    this.mux = createMutex();
    this.bcconnected = false;
    /**
     * @param {ArrayBuffer} data
     */
    this._bcSubscriber = (data) =>
      cryptoutils.decrypt(new Uint8Array(data), key).then((m) =>
        this.mux(() => {
          const reply = readMessage(this, m, () => {});
          if (reply) {
            broadcastBcMessage(this, encoding.toUint8Array(reply));
          }
        })
      );
    /**
     * Listens to Yjs updates and sends them to remote peers
     *
     * @param {Uint8Array} update
     * @param {any} _origin
     */
    this._docUpdateHandler = (update, _origin) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      broadcastRoomMessage(this, encoding.toUint8Array(encoder));
    };
    /**
     * Listens to Awareness updates and sends them to remote peers
     *
     * @param {any} changed
     * @param {any} _origin
     */
    this._awarenessUpdateHandler = ({ added, updated, removed }, _origin) => {
      const changedClients = added.concat(updated).concat(removed);
      const encoderAwareness = encoding.createEncoder();
      encoding.writeVarUint(encoderAwareness, messageAwareness);
      encoding.writeVarUint8Array(
        encoderAwareness,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      broadcastRoomMessage(this, encoding.toUint8Array(encoderAwareness));
    };

    this._beforeUnloadHandler = () => {
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        [doc.clientID],
        "window unload"
      );
      rooms.forEach((room) => {
        room.disconnect();
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this._beforeUnloadHandler);
    } else if (typeof process !== "undefined") {
      process.on("exit", this._beforeUnloadHandler);
    }
  }

  connect() {
    this.doc.on("update", this._docUpdateHandler);
    this.awareness.on("update", this._awarenessUpdateHandler);
    // signal through all available signaling connections
    announceSignalingInfo(this);
    const roomName = this.name;
    bc.subscribe(roomName, this._bcSubscriber);
    this.bcconnected = true;
    // broadcast peerId via broadcastchannel
    broadcastBcPeerId(this);
    // write sync step 1
    const encoderSync = encoding.createEncoder();
    encoding.writeVarUint(encoderSync, messageSync);
    syncProtocol.writeSyncStep1(encoderSync, this.doc);
    broadcastBcMessage(this, encoding.toUint8Array(encoderSync));
    // broadcast local state
    const encoderState = encoding.createEncoder();
    encoding.writeVarUint(encoderState, messageSync);
    syncProtocol.writeSyncStep2(encoderState, this.doc);
    broadcastBcMessage(this, encoding.toUint8Array(encoderState));
    // write queryAwareness
    const encoderAwarenessQuery = encoding.createEncoder();
    encoding.writeVarUint(encoderAwarenessQuery, messageQueryAwareness);
    broadcastBcMessage(this, encoding.toUint8Array(encoderAwarenessQuery));
    // broadcast local awareness state
    const encoderAwarenessState = encoding.createEncoder();
    encoding.writeVarUint(encoderAwarenessState, messageAwareness);
    encoding.writeVarUint8Array(
      encoderAwarenessState,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, [
        this.doc.clientID,
      ])
    );
    broadcastBcMessage(this, encoding.toUint8Array(encoderAwarenessState));
  }

  disconnect() {
    // signal through all available signaling connections
    signalingConns.forEach((conn) => {
      if (conn.connected) {
        conn.send({ type: "unsubscribe", topics: [this.name] });
      }
    });
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.doc.clientID],
      "disconnect"
    );
    // broadcast peerId removal via broadcastchannel
    const encoderPeerIdBc = encoding.createEncoder();
    encoding.writeVarUint(encoderPeerIdBc, messageBcPeerId);
    encoding.writeUint8(encoderPeerIdBc, 0); // remove peerId from other bc peers
    encoding.writeVarString(encoderPeerIdBc, this.peerId);
    broadcastBcMessage(this, encoding.toUint8Array(encoderPeerIdBc));

    bc.unsubscribe(this.name, this._bcSubscriber);
    this.bcconnected = false;
    this.doc.off("update", this._docUpdateHandler);
    this.awareness.off("update", this._awarenessUpdateHandler);
    this.webrtcConns.forEach((conn) => conn.destroy());
  }

  destroy() {
    this.disconnect();
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler);
    } else if (typeof process !== "undefined") {
      process.off("exit", this._beforeUnloadHandler);
    }
  }
}

/**
 * @param {Y.Doc} doc
 * @param {WebrtcProvider} provider
 * @param {string} name
 * @param {CryptoKey|null} key
 * @return {Room}
 */
const openRoom = (doc, provider, name, key) => {
  // there must only be one room
  if (rooms.has(name)) {
    throw error.create(`A Yjs Doc connected to room "${name}" already exists!`);
  }
  const room = new Room(doc, provider, name, key);
  rooms.set(name, /** @type {Room} */ (room));
  return room;
};

/**
 * @param {SignalingConn} conn
 * @param {Room} room
 * @param {any} data
 */
const publishSignalingMessage = (conn, room, data) => {
  if (room.key) {
    cryptoutils.encryptJson(data, room.key).then((data) => {
      conn.send({
        type: "publish",
        topic: room.name,
        data: buffer.toBase64(data),
      });
    });
  } else {
    conn.send({ type: "publish", topic: room.name, data });
  }
};

export class SignalingConn extends ws.WebsocketClient {
  constructor(url) {
    super(url);
    /**
     * @type {Set<WebrtcProvider>}
     */
    this.providers = new Set();
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 1000;

    this.on("connect", () => {
      console.log(`✅ PATCHED LIBRARY: Connected to signaling server ${url}`);
      log(`connected to signaling server (${url})`);
      this.connectionAttempts = 0;
      const topics = Array.from(rooms.keys());
      this.send({ type: "subscribe", topics });
      rooms.forEach((room) => {
        publishSignalingMessage(this, room, {
          type: "announce",
          from: room.peerId,
        });
        console.log(`📣 PATCHED LIBRARY: Announced presence in room ${room.name} via ${url}`);
        log(`announced presence in room: ${room.name}`);
      });
    });

    this.on("disconnect", () => {
      console.log(`❌ PATCHED LIBRARY: Disconnected from signaling server ${url}`);
      log(`disconnected from signaling server (${url})`);
      if (this.connectionAttempts < this.maxRetries) {
        this.connectionAttempts++;
        const delay =
          this.retryDelay * Math.pow(2, this.connectionAttempts - 1);
        console.log(`🔄 PATCHED LIBRARY: Attempting to reconnect to ${url} in ${delay}ms (attempt ${this.connectionAttempts}/${this.maxRetries})`);
        log(
          `attempting to reconnect to ${url} in ${delay}ms (attempt ${this.connectionAttempts}/${this.maxRetries})`
        );
        setTimeout(() => {
          if (this.providers.size > 0) {
            this.connect();
          }
        }, delay);
      } else {
        console.log(`🚫 PATCHED LIBRARY: Max reconnection attempts reached for ${url}`);
        log(`max reconnection attempts reached for ${url}`);
      }
    });
    this.on("message", (m) => {
      switch (m.type) {
        case "publish": {
          const roomName = m.topic;
          const room = rooms.get(roomName);
          if (room == null || typeof roomName !== "string") {
            log("received message for unknown room:", roomName);
            return;
          }
          log(
            "received signaling message for room:",
            roomName,
            "type:",
            m.data?.type
          );
          const execMessage = (data) => {
            const webrtcConns = room.webrtcConns;
            const peerId = room.peerId;
            if (
              data == null ||
              data.from === peerId ||
              (data.to !== undefined && data.to !== peerId) ||
              room.bcConns.has(data.from)
            ) {
              // ignore messages that are not addressed to this conn, or from clients that are connected via broadcastchannel
              return;
            }
            const emitPeerChange = webrtcConns.has(data.from)
              ? () => {}
              : () =>
                  room.provider.emit("peers", [
                    {
                      removed: [],
                      added: [data.from],
                      webrtcPeers: Array.from(room.webrtcConns.keys()),
                      bcPeers: Array.from(room.bcConns),
                    },
                  ]);
            switch (data.type) {
              case "announce":
                console.log("🎯 PATCHED LIBRARY: Peer announced:", data.from, "to room:", room.name);
                log(
                  "peer announced:",
                  data.from,
                  "current connections:",
                  webrtcConns.size,
                  "max:",
                  room.provider.maxConns
                );
                if (webrtcConns.size < room.provider.maxConns) {
                  console.log("🤝 PATCHED LIBRARY: Creating WebRTC connection to peer:", data.from);
                  map.setIfUndefined(
                    webrtcConns,
                    data.from,
                    () => new WebrtcConn(this, true, data.from, room)
                  );
                  emitPeerChange();
                } else {
                  console.log("⚠️ PATCHED LIBRARY: Max connections reached, ignoring announce from:", data.from);
                  log(
                    "max connections reached, ignoring announce from:",
                    data.from
                  );
                }
                break;
              case "signal":
                log(
                  "received signal from:",
                  data.from,
                  "type:",
                  data.signal.type,
                  "to:",
                  data.to
                );
                if (data.signal.type === "offer") {
                  const existingConn = webrtcConns.get(data.from);
                  if (existingConn) {
                    const remoteToken = data.token;
                    const localToken = existingConn.glareToken;
                    if (localToken && localToken > remoteToken) {
                      log(
                        "offer rejected due to glare resolution: ",
                        data.from
                      );
                      return;
                    }
                    // if we don't reject the offer, we will be accepting it and answering it
                    existingConn.glareToken = undefined;
                  }
                }
                if (data.signal.type === "answer") {
                  log("offer answered by: ", data.from);
                  const existingConn = webrtcConns.get(data.from);
                  if (existingConn) {
                    existingConn.glareToken = undefined;
                  }
                }
                if (data.to === peerId) {
                  const conn = map.setIfUndefined(
                    webrtcConns,
                    data.from,
                    () => new WebrtcConn(this, false, data.from, room)
                  );
                  try {
                    conn.peer.signal(data.signal);
                    emitPeerChange();
                  } catch (err) {
                    log("error processing signal from", data.from, ":", err);
                  }
                } else {
                  log("signal not addressed to this peer, ignoring");
                }
                break;
            }
          };
          if (room.key) {
            if (typeof m.data === "string") {
              cryptoutils
                .decryptJson(buffer.fromBase64(m.data), room.key)
                .then(execMessage);
            }
          } else {
            execMessage(m.data);
          }
        }
      }
    });
    this.on("disconnect", () => log(`disconnect (${url})`));
  }
}

/**
 * @typedef {Object} ProviderOptions
 * @property {Array<string>} [signaling]
 * @property {string} [password]
 * @property {awarenessProtocol.Awareness} [awareness]
 * @property {number} [maxConns]
 * @property {boolean} [filterBcConns]
 * @property {any} [peerOpts]
 * @property {Array<Object>} [iceServers]
 */

/**
 * Default ICE servers for WebRTC connections
 */
const defaultIceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  
  // Free TURN servers
  {
    urls: "turn:relay1.expressturn.com:3478",
    username: "efSLANXM7179I8RTB5",
    credential: "T0C0Ej5r6eWBjNppC",
  },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  
  // Additional TURN servers
  {
    urls: "turn:numb.viagenie.ca",
    username: "webrtc@live.com",
    credential: "muazkh",
  },
  {
    urls: "turn:192.158.29.39:3478?transport=udp",
    username: "28224511:1379330808",
    credential: "JZEOEt2V3Qb0y27GRntt2u2PAYA=",
  },
  {
    urls: "turn:192.158.29.39:3478?transport=tcp",
    username: "28224511:1379330808", 
    credential: "JZEOEt2V3Qb0y27GRntt2u2PAYA=",
  },
];

/**
 * @param {WebrtcProvider} provider
 */
const emitStatus = (provider) => {
  provider.emit("status", [
    {
      connected: provider.connected,
    },
  ]);
};

/**
 * @typedef {Object} WebrtcProviderEvents
 * @property {function({connected:boolean}):void} WebrtcProviderEvent.status
 * @property {function({synced:boolean}):void} WebrtcProviderEvent.synced
 * @property {function({added:Array<string>,removed:Array<string>,webrtcPeers:Array<string>,bcPeers:Array<string>}):void} WebrtcProviderEvent.peers
 */

/**
 * @extends ObservableV2<WebrtcProviderEvents>
 */
export class WebrtcProvider extends ObservableV2 {
  /**
   * @param {string} roomName
   * @param {Y.Doc} doc
   * @param {ProviderOptions?} opts
   */
  constructor(
    roomName,
    doc,
    {
      signaling = ["wss://demos.yjs.dev/ws", "wss://y-webrtc-signaling.herokuapp.com"],
      password = null,
      awareness = new awarenessProtocol.Awareness(doc),
      maxConns = 20 + math.floor(random.rand() * 15), // the random factor reduces the chance that n clients form a cluster
      filterBcConns = true,
      peerOpts = {}, // simple-peer options. See https://github.com/feross/simple-peer#peer--new-peeropts
      iceServers = null, // ICE servers for WebRTC connections
    } = {}
  ) {
    console.log("🚀 PATCHED LIBRARY: WebrtcProvider constructor called for room", roomName);
    super();
    this.roomName = roomName;
    this.doc = doc;
    this.filterBcConns = filterBcConns;
    /**
     * @type {awarenessProtocol.Awareness}
     */
    this.awareness = awareness;
    this.shouldConnect = false;
    this.signalingUrls = signaling;
    this.signalingConns = [];
    this.maxConns = maxConns;
    this.peerOpts = peerOpts;
    this.iceServers = iceServers;

    // Log connection configuration
    log("WebRTC Provider initialized:", {
      roomName,
      signalingUrls: signaling,
      maxConns,
      hasPassword: !!password,
      iceServers: iceServers || "default",
    });
    /**
     * @type {PromiseLike<CryptoKey | null>}
     */
    this.key = password
      ? cryptoutils.deriveKey(password, roomName)
      : /** @type {PromiseLike<null>} */ (promise.resolve(null));
    /**
     * @type {Room|null}
     */
    this.room = null;
    this.key.then((key) => {
      this.room = openRoom(doc, this, roomName, key);
      if (this.shouldConnect) {
        this.room.connect();
      } else {
        this.room.disconnect();
      }
      emitStatus(this);
    });
    this.connect();
    this.destroy = this.destroy.bind(this);
    doc.on("destroy", this.destroy);
  }

  /**
   * Indicates whether the provider is looking for other peers.
   *
   * Other peers can be found via signaling servers or via broadcastchannel (cross browser-tab
   * communication). You never know when you are connected to all peers. You also don't know if
   * there are other peers. connected doesn't mean that you are connected to any physical peers
   * working on the same resource as you. It does not change unless you call provider.disconnect()
   *
   * `this.on('status', (event) => { console.log(event.connected) })`
   *
   * @type {boolean}
   */
  get connected() {
    return this.room !== null && this.shouldConnect;
  }

  connect() {
    this.shouldConnect = true;
    this.signalingUrls.forEach((url) => {
      const signalingConn = map.setIfUndefined(
        signalingConns,
        url,
        () => new SignalingConn(url)
      );
      this.signalingConns.push(signalingConn);
      signalingConn.providers.add(this);
    });
    if (this.room) {
      this.room.connect();
      emitStatus(this);
    }
  }

  disconnect() {
    this.shouldConnect = false;
    this.signalingConns.forEach((conn) => {
      conn.providers.delete(this);
      if (conn.providers.size === 0) {
        conn.destroy();
        signalingConns.delete(conn.url);
      }
    });
    if (this.room) {
      this.room.disconnect();
      emitStatus(this);
    }
  }

  destroy() {
    this.doc.off("destroy", this.destroy);
    // need to wait for key before deleting room
    this.key.then(() => {
      /** @type {Room} */ (this.room).destroy();
      rooms.delete(this.roomName);
    });
    super.destroy();
  }
}
