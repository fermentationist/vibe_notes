import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";

// Color palette for peer cursors
const CURSOR_COLORS = [
  "#FF5733", // Red-orange
  "#33A8FF", // Blue
  "#33FF57", // Green
  "#FF33A8", // Pink
  "#A833FF", // Purple
  "#FFBD33", // Yellow-orange
  "#33FFC1", // Teal
  "#FF5733", // Fallback
];

// DOM Elements
const editor = document.getElementById("editor");
const statusElement = document.getElementById("status");
const usernameInput = document.getElementById("username");
const sessionIdInput = document.getElementById("session-id");
const joinButton = document.getElementById("join-btn");
const sessionDisplay = document.getElementById("session-display");
const currentSessionElement = document.getElementById("current-session");
const copyNotification = document.getElementById("copy-notification");
const themeToggle = document.getElementById("theme-toggle");
const moonIcon = document.getElementById("moon-icon");
const sunIcon = document.getElementById("sun-icon");

// Set default username
usernameInput.value = "User" + Math.floor(Math.random() * 1000);

// Mobile debug console for Safari testing
let debugConsole = null;
let debugMessages = [];

function createMobileDebugConsole() {
  // Only create if on mobile or if console is not easily accessible
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobile || window.location.search.includes("debug=true")) {
    debugConsole = document.createElement("div");
    debugConsole.id = "mobile-debug-console";
    debugConsole.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 200px;
      background: rgba(0, 0, 0, 0.9);
      color: #00ff00;
      font-family: monospace;
      font-size: 10px;
      padding: 10px;
      overflow-y: auto;
      z-index: 10000;
      border-top: 2px solid #333;
      display: none;
    `;

    // Add toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "🐛 Debug";
    toggleBtn.style.cssText = `
      position: fixed;
      bottom: 50px;
      right: 10px;
      z-index: 10001;
      background: #333;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
    `;

    toggleBtn.onclick = () => {
      const isVisible = debugConsole.style.display === "block";
      debugConsole.style.display = isVisible ? "none" : "block";
      toggleBtn.textContent = isVisible ? "🐛 Debug" : "❌ Close";
    };

    document.body.appendChild(debugConsole);
    document.body.appendChild(toggleBtn);

    // Override console methods to capture output
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = function (...args) {
      originalLog.apply(console, args);
      addDebugMessage("LOG", args.join(" "));
    };

    console.error = function (...args) {
      originalError.apply(console, args);
      addDebugMessage("ERROR", args.join(" "));
    };

    console.warn = function (...args) {
      originalWarn.apply(console, args);
      addDebugMessage("WARN", args.join(" "));
    };
  }
}

function addDebugMessage(type, message) {
  if (!debugConsole) return;

  const timestamp = new Date().toLocaleTimeString();
  const color =
    type === "ERROR" ? "#ff4444" : type === "WARN" ? "#ffaa00" : "#00ff00";

  debugMessages.push({ type, message, timestamp });

  // Keep only last 50 messages
  if (debugMessages.length > 50) {
    debugMessages.shift();
  }

  // Update display
  debugConsole.innerHTML = debugMessages
    .map(
      (msg) =>
        `<div style="color: ${color}; margin-bottom: 2px;">[${msg.timestamp}] ${msg.type}: ${msg.message}</div>`
    )
    .join("");

  // Auto-scroll to bottom
  debugConsole.scrollTop = debugConsole.scrollHeight;
}

// Initialize mobile debug console
createMobileDebugConsole();

// Theme management
function initTheme() {
  // Check if user has a saved preference
  const savedTheme = localStorage.getItem("theme");

  if (savedTheme) {
    // Apply saved theme
    applyTheme(savedTheme);
  } else {
    // Check system preference
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }
}

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    moonIcon.style.display = "none";
    sunIcon.style.display = "block";
  } else {
    document.documentElement.removeAttribute("data-theme");
    moonIcon.style.display = "block";
    sunIcon.style.display = "none";
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const newTheme = isDark ? "light" : "dark";

  // Apply the new theme
  applyTheme(newTheme);

  // Save preference
  localStorage.setItem("theme", newTheme);
}

// Initialize theme
initTheme();

// Theme toggle event listener
themeToggle.addEventListener("click", toggleTheme);

// Generate a random session ID
function generateSessionId() {
  if (crypto === void 0 || !crypto.randomUUID) {
    // make fake uuid with Math.random (crypto is not available in insecure contexts)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }
  return crypto.randomUUID();
}

// Get session ID from URL or generate a new one
function getSessionIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("session") || generateSessionId();
}

// Update URL with session ID
function updateUrl(sessionId) {
  const url = new URL(window.location);
  url.searchParams.set("session", sessionId);
  window.history.pushState({}, "", url);
}

// utility function to sanitize user input to prevent XSS attacks
function sanitizeInput(input) {
  return input.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Variables
let doc;
let provider;
let yText;
let currentSessionId = getSessionIdFromUrl();
let isInitialSync = true;
let peerCursors = {}; // Store peer cursor elements
let colorAssignments = {}; // Map client IDs to colors

// Initialize the collaborative editor with a session ID
function initCollaboration(sessionId) {
  // Clean up previous instances if they exist
  if (provider) {
    provider.destroy();
  }
  if (doc) {
    doc.destroy();
  }

  // Create a new Yjs document
  doc = new Y.Doc();
  yText = doc.getText("content");

  // Connect to peers using the session ID
  provider = new WebrtcProvider(`minimal-p2p-notes-${sessionId}`, doc, {
    signaling: [
      "wss://signaling.yjs.dev",
      "wss://demos.yjs.dev/ws",
      "wss://y-webrtc-signaling-eu.herokuapp.com",
      "wss://y-webrtc-signaling-us.herokuapp.com",
    ],
    maxConns: 20,
    filterBcConns: true,
    peerOpts: {
      config: {
        iceServers: [
          // Google's public STUN servers
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },

          // Additional STUN servers for better connectivity
          { urls: "stun:stun.stunprotocol.org:3478" },
          { urls: "stun:stun.voiparound.com" },
          { urls: "stun:stun.voipbuster.com" },

          // Mozilla's STUN servers
          { urls: "stun:stun.services.mozilla.com" },

          // Add free TURN servers (limited bandwidth)
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
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: "all",
      },
    },
  });

  console.log(`=== WebRTC Debug Info ===`);
  console.log(`Session ID: ${sessionId}`);
  console.log(`Room: vibe-notes-${sessionId}`);
  console.log(`URL: ${window.location.href}`);
  console.log(`User Agent: ${navigator.userAgent}`);
  console.log(`Is Secure Context: ${window.isSecureContext}`);

  // Monitor signaling connection
  provider.on("status", (event) => {
    console.log(`[${new Date().toISOString()}] Provider Status:`, event);
    if (event.status === "connected") {
      console.log("✅ Connected to signaling server");
    } else if (event.status === "disconnected") {
      console.log("❌ Disconnected from signaling server");
    }
  });

  // Monitor peer connections
  provider.on("peers", (event) => {
    console.log(`[${new Date().toISOString()}] Peers Event:`, event);
    const peerCount = provider.awareness.getStates().size - 1;
    console.log(`Current peer count: ${peerCount}`);
  });

  // Monitor awareness changes (when peers join/leave)
  provider.awareness.on("change", (changes) => {
    console.log(`[${new Date().toISOString()}] Awareness Change:`, changes);
    const states = provider.awareness.getStates();
    console.log("All connected clients:", Array.from(states.keys()));
    states.forEach((state, clientId) => {
      if (clientId !== provider.awareness.clientID) {
        console.log(`Peer ${clientId}:`, state.user?.name || "Anonymous");
      }
    });
  });

  // Monitor WebRTC connection errors
  provider.on("connection-error", (error) => {
    console.error(
      `[${new Date().toISOString()}] WebRTC Connection Error:`,
      error
    );
  });

  // Monitor document sync
  provider.on("sync", (isSynced) => {
    console.log(
      `[${new Date().toISOString()}] Document Sync:`,
      isSynced ? "✅ Synced" : "⏳ Syncing..."
    );
  });

  // Log when provider is ready
  setTimeout(() => {
    console.log(`Provider Client ID: ${provider.awareness.clientID}`);
    console.log(`Connected Peers: ${provider.awareness.getStates().size - 1}`);
  }, 1000);

  // Monitor connection attempts
  provider.on("status", (event) => {
    console.log("WebRTC Provider status:", event);
  });

  provider.on("peers", (event) => {
    console.log("Peer connection event:", event);
  });

  // Update UI with current session ID
  sessionDisplay.textContent = sessionId;
  currentSessionId = sessionId;
  updateUrl(sessionId);

  // Set up awareness (presence) handling
  const username =
    usernameInput.value.trim() || "User" + Math.floor(Math.random() * 1000);
  provider.awareness.setLocalStateField("user", {
    name: username,
    cursor: null, // Will be updated when cursor moves
  });

  // Update connection status when peers connect/disconnect
  provider.awareness.on("change", () => {
    updateStatus();
    updatePeerCursors();
  });

  // Handle WebRTC connection status
  provider.on("status", (event) => {
    if (event.status === "connected") {
      statusElement.style.backgroundColor = "rgba(0,255,0,0.2)";
    } else {
      statusElement.style.backgroundColor = "rgba(255,0,0,0.2)";
    }
  });

  // Initial status update
  updateStatus();

  // Set up editor binding
  setupEditorBinding();
}

// Set up the binding between the editor and Yjs
function setupEditorBinding() {
  // Flag to prevent update loops
  let preventObservation = false;

  // Set initial content - use textContent to handle line breaks naturally
  editor.textContent = yText.toString();

  // Listen for Yjs updates
  yText.observe((event) => {
    // Only update if the change didn't come from this client
    if (
      event.transaction.origin !== provider.awareness.clientID &&
      !preventObservation
    ) {
      // Get current selection
      const selection = window.getSelection();
      const selectionExists = selection.rangeCount > 0;
      let selectionInfo = null;

      // Save selection position if it exists
      if (selectionExists) {
        const range = selection.getRangeAt(0);
        selectionInfo = {
          startContainer: range.startContainer,
          startOffset: range.startOffset,
          endContainer: range.endContainer,
          endOffset: range.endOffset,
        };
      }

      // Update editor content with preserved line breaks
      editor.innerHTML = yText.toString();

      // Try to restore selection if it existed
      if (selectionExists && selectionInfo) {
        try {
          // Wait a tick for the DOM to update
          setTimeout(() => {
            // Try to find equivalent positions in the new DOM
            const newRange = document.createRange();
            const nodeIndex = Array.from(editor.childNodes).findIndex(
              (node) =>
                node.textContent === selectionInfo.startContainer.textContent
            );

            if (nodeIndex >= 0) {
              const node = editor.childNodes[nodeIndex];
              newRange.setStart(
                node,
                Math.min(selectionInfo.startOffset, node.textContent.length)
              );
              newRange.setEnd(
                node,
                Math.min(selectionInfo.endOffset, node.textContent.length)
              );
              selection.removeAllRanges();
              selection.addRange(newRange);
            }
          }, 0);
        } catch (e) {
          // If restoring selection fails, don't worry about it
        }
      }
    }
  });

  // Handle input events to update Yjs document
  editor.addEventListener("input", () => {
    // Prevent update loops
    preventObservation = true;

    const content = sanitizeInput(editor.innerText);
    // Update Yjs document
    yText.delete(0, yText.length);
    yText.insert(0, content);

    // Allow observation again
    preventObservation = false;

    // Update cursor position after input
    updateLocalCursorPosition();
  });

  // Track cursor position
  editor.addEventListener("mouseup", updateLocalCursorPosition);
  editor.addEventListener("keyup", updateLocalCursorPosition);
  editor.addEventListener("click", updateLocalCursorPosition);

  // Focus editor on load
  setTimeout(() => {
    editor.focus();
    updateLocalCursorPosition();
  }, 100);
}

// Update connection status
function updateStatus() {
  if (!provider) return;

  const peers = provider.awareness.getStates().size;
  statusElement.textContent = `Connected with ${peers - 1} peer${
    peers !== 2 ? "s" : ""
  }`;

  // Visual indicator
  if (peers > 1) {
    statusElement.style.backgroundColor = "rgba(0,255,0,0.2)";
  } else {
    statusElement.style.backgroundColor = "rgba(255,165,0,0.2)";
  }
}

// Join button click handler
joinButton.addEventListener("click", () => {
  const sessionId = sessionIdInput.value.trim() || generateSessionId();

  // Clean up existing peer cursors before joining a new session
  clearPeerCursors();

  // Reset color assignments when joining a new session
  colorAssignments = {};

  // Initialize the new collaboration session
  initCollaboration(sessionId);
  sessionIdInput.value = "";
});

// Initialize with the current session ID
initCollaboration(currentSessionId);

// Add click handler for copying session URL to clipboard
currentSessionElement.addEventListener("click", () => {
  // Create the full URL with the session ID
  const url = new URL(window.location);
  url.searchParams.set("session", currentSessionId);
  const fullUrl = url.toString();

  // Copy to clipboard
  navigator.clipboard
    .writeText(fullUrl)
    .then(() => {
      // Show notification
      copyNotification.classList.add("show");

      // Hide notification after 2 seconds
      setTimeout(() => {
        copyNotification.classList.remove("show");
      }, 2000);
    })
    .catch((err) => {
      console.error("Failed to copy URL: ", err);
    });
});

// Handle browser unload
window.addEventListener("beforeunload", () => {
  if (provider) provider.destroy();
  if (doc) doc.destroy();
  clearPeerCursors();
});

// Update local cursor position and broadcast to peers
function updateLocalCursorPosition() {
  if (!provider || !provider.awareness) return;

  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return;

  // Get cursor position relative to editor
  let cursorRect;

  // Create a temporary span to get the exact cursor position
  // This works better for empty lines and with plaintext-only mode
  const tempSpan = document.createElement("span");
  tempSpan.innerHTML = "&#8203;"; // Zero-width space

  // Insert the span at the cursor position
  const rangeClone = range.cloneRange();
  rangeClone.insertNode(tempSpan);

  // Get the position of the temporary span
  cursorRect = tempSpan.getBoundingClientRect();

  // If the rect has no dimensions (which can happen with empty lines),
  // use the parent node's position or calculate based on line height
  if (cursorRect.height === 0) {
    const parentNode = tempSpan.parentNode || editor;
    const parentRect = parentNode.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(editor);
    const lineHeight = parseInt(computedStyle.lineHeight) || 20;

    cursorRect = {
      left: parentRect.left + 20, // Add padding
      top: parentRect.top,
      width: 0,
      height: lineHeight,
    };
  }

  // Remove the temporary span
  if (tempSpan.parentNode) {
    tempSpan.parentNode.removeChild(tempSpan);
  }

  // Restore the selection
  selection.removeAllRanges();
  selection.addRange(range);

  // Special case for cursor at the very beginning of the editor
  if (range.startContainer === editor && range.startOffset === 0) {
    const editorRect = editor.getBoundingClientRect();
    cursorRect = {
      left: editorRect.left + 20, // Add padding
      top: editorRect.top + 20, // Add padding
      width: 0,
      height: 20,
    };
  }

  const editorRect = editor.getBoundingClientRect();

  const cursorPosition = {
    left: cursorRect.left - editorRect.left,
    top: cursorRect.top - editorRect.top,
  };

  // Broadcast cursor position to peers
  provider.awareness.setLocalStateField("user", {
    name:
      usernameInput.value.trim() || "User" + Math.floor(Math.random() * 1000),
    cursor: cursorPosition,
  });
}

// Update peer cursors based on awareness information
function updatePeerCursors() {
  if (!provider || !provider.awareness) return;

  // Clear existing cursors first
  clearPeerCursors();

  // Get all user states
  const states = provider.awareness.getStates();
  const localClientId = provider.awareness.clientID;

  // Create a cursor for each remote peer
  states.forEach((state, clientId) => {
    // Skip local user
    if (clientId === localClientId || !state.user || !state.user.cursor) return;

    // Create or update cursor element
    createPeerCursor(clientId, state.user);
  });
}

// Create a cursor element for a peer
function createPeerCursor(clientId, userData) {
  // Assign a color if not already assigned
  if (!colorAssignments[clientId]) {
    const colorIndex =
      Object.keys(colorAssignments).length % CURSOR_COLORS.length;
    colorAssignments[clientId] = CURSOR_COLORS[colorIndex];
  }

  const color = colorAssignments[clientId];
  const cursorPosition = userData.cursor;

  // Skip if cursor position is invalid
  if (
    !cursorPosition ||
    typeof cursorPosition.left !== "number" ||
    typeof cursorPosition.top !== "number"
  ) {
    return;
  }

  // Create cursor element if it doesn't exist
  if (!peerCursors[clientId]) {
    const cursorElement = document.createElement("div");
    cursorElement.className = "remote-cursor";
    cursorElement.style.backgroundColor = color;

    const labelElement = document.createElement("div");
    labelElement.className = "cursor-label";
    labelElement.style.backgroundColor = color;
    labelElement.textContent = userData.name || "Anonymous";

    cursorElement.appendChild(labelElement);
    document.body.appendChild(cursorElement);

    peerCursors[clientId] = cursorElement;
  }

  // Position the cursor
  const cursorElement = peerCursors[clientId];

  // Calculate absolute position
  const editorRect = editor.getBoundingClientRect();
  const absoluteLeft = editorRect.left + cursorPosition.left;
  const absoluteTop = editorRect.top + cursorPosition.top;

  cursorElement.style.left = `${absoluteLeft}px`;
  cursorElement.style.top = `${absoluteTop}px`;

  // Make sure cursor is visible
  cursorElement.style.display = "block";
}

// Clear all peer cursors
function clearPeerCursors() {
  Object.values(peerCursors).forEach((cursor) => {
    if (cursor && cursor.parentNode) {
      cursor.parentNode.removeChild(cursor);
    }
  });

  peerCursors = {};
}
