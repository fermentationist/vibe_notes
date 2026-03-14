#!/usr/bin/env node

import { WebSocketServer } from "ws";
import http from "http";
import app from "./app.js";
import * as map from "lib0/map";

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
const wsReadyStateClosing = 2; // eslint-disable-line
const wsReadyStateClosed = 3; // eslint-disable-line

const pingTimeout = 30000;

const httpPort = process.env.PORT || 3000;

// HTTP server for static files
const httpServer = http.createServer(app);

// WebSocket server for signaling - use the same HTTP server
const wss = new WebSocketServer({ noServer: true });

/**
 * Map froms topic-name to set of subscribed clients.
 * @type {Map<string, Set<any>>}
 */
const topics = new Map();

/**
 * @param {any} conn
 * @param {object} message
 */
const send = (conn, message) => {
  if (
    conn.readyState !== wsReadyStateConnecting &&
    conn.readyState !== wsReadyStateOpen
  ) {
    conn.close();
  }
  try {
    conn.send(JSON.stringify(message));
  } catch (e) {
    conn.close();
  }
};

/**
 * Setup a new client
 * @param {any} conn
 */
const onconnection = (conn) => {
  console.log(
    `🔗 [${new Date().toISOString()}] New WebSocket connection established`,
  );
  console.log(`📡 Connection details:`, {
    remoteAddress: conn.socket?.remoteAddress,
    readyState: conn.readyState,
    userAgent: conn.socket?.upgradeReq?.headers["user-agent"],
  });
  /**
   * @type {Set<string>}
   */
  const subscribedTopics = new Set();
  let closed = false;
  // Check if connection is still alive
  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      conn.close();
      clearInterval(pingInterval);
    } else {
      pongReceived = false;
      try {
        conn.ping();
      } catch (e) {
        conn.close();
      }
    }
  }, pingTimeout);
  conn.on("pong", () => {
    pongReceived = true;
  });
  conn.on("close", () => {
    console.log(`❌ [${new Date().toISOString()}] WebSocket connection closed`);
    subscribedTopics.forEach((topicName) => {
      console.log(`📤 Unsubscribing from topic: ${topicName}`);
      const subs = topics.get(topicName) || new Set();
      subs.delete(conn);
      if (subs.size === 0) {
        topics.delete(topicName);
        console.log(`🗑️ Topic ${topicName} removed (no more subscribers)`);
      }
    });
    subscribedTopics.clear();
    closed = true;
  });
  conn.on(
    "message",
    /** @param {object} message */ (message) => {
      if (typeof message === "string" || message instanceof Buffer) {
        message = JSON.parse(message);
      }
      if (message && message.type && !closed) {
        switch (message.type) {
          case "subscribe":
            console.log(
              `📝 [${new Date().toISOString()}] Subscribe request:`,
              message.topics,
            );
            /** @type {Array<string>} */ (message.topics || []).forEach(
              (topicName) => {
                if (typeof topicName === "string") {
                  // add conn to topic
                  const topic = map.setIfUndefined(
                    topics,
                    topicName,
                    () => new Set(),
                  );
                  topic.add(conn);
                  // add topic to conn
                  subscribedTopics.add(topicName);
                  console.log(
                    `✅ Client subscribed to topic: ${topicName} (total subscribers: ${topic.size})`,
                  );
                }
              },
            );
            break;
          case "unsubscribe":
            /** @type {Array<string>} */ (message.topics || []).forEach(
              (topicName) => {
                const subs = topics.get(topicName);
                if (subs) {
                  subs.delete(conn);
                }
              },
            );
            break;
          case "publish":
            if (message.topic) {
              console.log(
                `📤 [${new Date().toISOString()}] Publish to topic ${message.topic}:`,
                {
                  messageSize: JSON.stringify(message).length,
                  clientsInTopic: topics.get(message.topic)?.size || 0,
                },
              );
              const receivers = topics.get(message.topic);
              if (receivers) {
                message.clients = receivers.size;
                receivers.forEach((receiver) => {
                  try {
                    send(receiver, message);
                  } catch (e) {
                    console.error(`❌ Failed to send to receiver:`, e);
                  }
                });
                console.log(
                  `✅ Message broadcasted to ${receivers.size} clients`,
                );
              } else {
                console.log(
                  `⚠️ No subscribers found for topic: ${message.topic}`,
                );
              }
            }
            break;
          case "ping":
            send(conn, { type: "pong" });
        }
      }
    },
  );
};
wss.on("connection", onconnection);

// Handle WebSocket upgrade requests on /ws path
httpServer.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`)
    .pathname;

  console.log(`🚀 [${new Date().toISOString()}] WebSocket upgrade request:`);
  console.log(`   Path: ${pathname}`);
  console.log(`   Origin: ${request.headers.origin}`);
  console.log(`   User-Agent: ${request.headers["user-agent"]}`);
  console.log(`   Remote Address: ${request.socket.remoteAddress}`);

  if (pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log(`✅ WebSocket upgrade successful for /ws`);
      wss.emit("connection", ws, request);
    });
  } else {
    console.log(`❌ WebSocket upgrade rejected - invalid path: ${pathname}`);
    socket.destroy();
  }
});

// Start the HTTP server (handles both HTTP and WebSocket)
httpServer.listen(httpPort, () => {
  console.log(`🌐 [${new Date().toISOString()}] Server started successfully`);
  console.log(`📡 HTTP server serving static files on port ${httpPort}`);
  console.log(`🔗 WebSocket signaling server available at /ws`);
  console.log(`🌍 Access URLs:`);
  console.log(`   Local: http://localhost:${httpPort}`);
  // console.log(
  //   `   Network: http://${require("os").networkInterfaces().eth0?.[0]?.address || "localhost"}:${httpPort}`,
  // );
});

export { httpServer };
