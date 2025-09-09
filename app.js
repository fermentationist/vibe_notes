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

// Set default username
usernameInput.value = "User" + Math.floor(Math.random() * 1000);

// Generate a random session ID
function generateSessionId() {
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
    signaling: ["wss://signaling.yjs.dev"],
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
