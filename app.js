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
const saveButton = document.getElementById("save-btn");
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
      padding-top: 40px;
      overflow-y: auto;
      z-index: 10000;
      border-top: 2px solid #333;
      display: none;
    `;

    // Add copy button to debug console
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋 Copy";
    copyBtn.style.cssText = `
      position: fixed;
      top: auto;
      bottom: 160px;
      right: 10px;
      background: #444;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      z-index: 10002;
      min-height: 32px;
      min-width: 70px;
      touch-action: manipulation;
    `;

    copyBtn.onclick = async () => {
      try {
        const debugText = debugMessages
          .map((msg) => `[${msg.timestamp}] ${msg.type}: ${msg.message}`)
          .join("\n");

        if (navigator.clipboard && window.isSecureContext) {
          // Use modern clipboard API if available
          await navigator.clipboard.writeText(debugText);
        } else {
          // Fallback for older browsers or non-secure contexts
          const textArea = document.createElement("textarea");
          textArea.value = debugText;
          textArea.style.position = "fixed";
          textArea.style.left = "-999999px";
          textArea.style.top = "-999999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
        }

        // Visual feedback
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "✅ Copied!";
        copyBtn.style.background = "#28a745";
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = "#444";
        }, 2000);
      } catch (err) {
        console.error("Failed to copy debug console:", err);
        copyBtn.textContent = "❌ Failed";
        copyBtn.style.background = "#dc3545";
        setTimeout(() => {
          copyBtn.textContent = "📋 Copy";
          copyBtn.style.background = "#444";
        }, 2000);
      }
    };

    // Show/hide copy button based on debug console visibility
    const updateCopyButtonVisibility = () => {
      copyBtn.style.display =
        debugConsole.style.display === "block" ? "block" : "none";
    };

    document.body.appendChild(copyBtn);
    document.body.appendChild(debugConsole);

    // Add toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "🐛 Debug";
    toggleBtn.style.cssText = `
      position: fixed;
      bottom: 63px;
      right: 16px;
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
      updateCopyButtonVisibility();
    };

    document.body.appendChild(toggleBtn);

    // Initialize copy button visibility
    updateCopyButtonVisibility();

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

// Header toggle functionality
const headerToggle = document.getElementById("header-toggle");
const header = document.querySelector(".header");
let isHeaderHidden = false;

function toggleHeader() {
  isHeaderHidden = !isHeaderHidden;

  if (isHeaderHidden) {
    header.classList.add("header--hidden");
    headerToggle.classList.add("header-toggle--hidden");
  } else {
    header.classList.remove("header--hidden");
    headerToggle.classList.remove("header-toggle--hidden");
  }

  // Save preference to localStorage
  localStorage.setItem("headerHidden", isHeaderHidden);
}

// Initialize header state from localStorage
function initHeaderState() {
  const savedState = localStorage.getItem("headerHidden");
  if (savedState === "true") {
    isHeaderHidden = true;
    header.classList.add("header--hidden");
    headerToggle.classList.add("header-toggle--hidden");
  }
}

// Header toggle event listener
headerToggle.addEventListener("click", toggleHeader);

// Initialize header state
initHeaderState();

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
  provider = new WebrtcProvider(`vibe_notes_${sessionId}`, doc, {
    signaling: ["wss://demos.yjs.dev/ws", "wss://signaling.yjs.dev"],
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

          //
          { urls: "stun.ekiga.net" },
          { urls: "stun.ideasip.com" },
          { urls: "stun.rixtelecom.se" },
          { urls: "stun.schlund.de" },
          { urls: "stun.stunprotocol.org:3478" },
          { urls: "stun.voiparound.com" },
          { urls: "stun.voipbuster.com" },
          { urls: "stun.voipstunt.com" },
          { urls: "stun.voxgratia.org" },
          { urls: "23.21.150.121:3478" },
          { urls: "iphone-stun.strato-iphone.de:3478" },
          { urls: "numb.viagenie.ca:3478" },
          { urls: "s1.taraba.net:3478" },
          { urls: "s2.taraba.net:3478" },
          { urls: "stun.12connect.com:3478" },
          { urls: "stun.12voip.com:3478" },
          { urls: "stun.1und1.de:3478" },
          { urls: "stun.2talk.co.nz:3478" },
          { urls: "stun.2talk.com:3478" },
          { urls: "stun.3clogic.com:3478" },
          { urls: "stun.3cx.com:3478" },
          { urls: "stun.a-mm.tv:3478" },
          { urls: "stun.aa.net.uk:3478" },
          { urls: "stun.acrobits.cz:3478" },
          { urls: "stun.actionvoip.com:3478" },
          { urls: "stun.advfn.com:3478" },
          { urls: "stun.aeta-audio.com:3478" },
          { urls: "stun.aeta.com:3478" },
          { urls: "stun.alltel.com.au:3478" },
          { urls: "stun.altar.com.pl:3478" },
          { urls: "stun.annatel.net:3478" },
          { urls: "stun.antisip.com:3478" },
          { urls: "stun.arbuz.ru:3478" },
          { urls: "stun.avigora.com:3478" },
          { urls: "stun.avigora.fr:3478" },
          { urls: "stun.awa-shima.com:3478" },
          { urls: "stun.awt.be:3478" },
          { urls: "stun.b2b2c.ca:3478" },
          { urls: "stun.bahnhof.net:3478" },
          { urls: "stun.barracuda.com:3478" },
          { urls: "stun.bluesip.net:3478" },
          { urls: "stun.bmwgs.cz:3478" },
          { urls: "stun.botonakis.com:3478" },
          { urls: "stun.budgetphone.nl:3478" },
          { urls: "stun.budgetsip.com:3478" },
          { urls: "stun.cablenet-as.net:3478" },
          { urls: "stun.callromania.ro:3478" },
          { urls: "stun.callwithus.com:3478" },
          { urls: "stun.cbsys.net:3478" },
          { urls: "stun.chathelp.ru:3478" },
          { urls: "stun.cheapvoip.com:3478" },
          { urls: "stun.ciktel.com:3478" },
          { urls: "stun.cloopen.com:3478" },
          { urls: "stun.colouredlines.com.au:3478" },
          { urls: "stun.comfi.com:3478" },
          { urls: "stun.commpeak.com:3478" },
          { urls: "stun.comtube.com:3478" },
          { urls: "stun.comtube.ru:3478" },
          { urls: "stun.cope.es:3478" },
          { urls: "stun.counterpath.com:3478" },
          { urls: "stun.counterpath.net:3478" },
          { urls: "stun.cryptonit.net:3478" },
          { urls: "stun.darioflaccovio.it:3478" },
          { urls: "stun.datamanagement.it:3478" },
          { urls: "stun.dcalling.de:3478" },
          { urls: "stun.decanet.fr:3478" },
          { urls: "stun.demos.ru:3478" },
          { urls: "stun.develz.org:3478" },
          { urls: "stun.dingaling.ca:3478" },
          { urls: "stun.doublerobotics.com:3478" },
          { urls: "stun.drogon.net:3478" },
          { urls: "stun.duocom.es:3478" },
          { urls: "stun.dus.net:3478" },
          { urls: "stun.e-fon.ch:3478" },
          { urls: "stun.easybell.de:3478" },
          { urls: "stun.easycall.pl:3478" },
          { urls: "stun.easyvoip.com:3478" },
          { urls: "stun.efficace-factory.com:3478" },
          { urls: "stun.einsundeins.com:3478" },
          { urls: "stun.einsundeins.de:3478" },
          { urls: "stun.ekiga.net:3478" },
          { urls: "stun.epygi.com:3478" },
          { urls: "stun.etoilediese.fr:3478" },
          { urls: "stun.eyeball.com:3478" },
          { urls: "stun.faktortel.com.au:3478" },
          { urls: "stun.freecall.com:3478" },
          { urls: "stun.freeswitch.org:3478" },
          { urls: "stun.freevoipdeal.com:3478" },
          { urls: "stun.fuzemeeting.com:3478" },
          { urls: "stun.gmx.de:3478" },
          { urls: "stun.gmx.net:3478" },
          { urls: "stun.gradwell.com:3478" },
          { urls: "stun.halonet.pl:3478" },
          { urls: "stun.hellonanu.com:3478" },
          { urls: "stun.hoiio.com:3478" },
          { urls: "stun.hosteurope.de:3478" },
          { urls: "stun.ideasip.com:3478" },
          { urls: "stun.imesh.com:3478" },
          { urls: "stun.infra.net:3478" },
          { urls: "stun.internetcalls.com:3478" },
          { urls: "stun.intervoip.com:3478" },
          { urls: "stun.ipcomms.net:3478" },
          { urls: "stun.ipfire.org:3478" },
          { urls: "stun.ippi.fr:3478" },
          { urls: "stun.ipshka.com:3478" },
          { urls: "stun.iptel.org:3478" },
          { urls: "stun.irian.at:3478" },
          { urls: "stun.it1.hr:3478" },
          { urls: "stun.ivao.aero:3478" },
          { urls: "stun.jappix.com:3478" },
          { urls: "stun.jumblo.com:3478" },
          { urls: "stun.justvoip.com:3478" },
          { urls: "stun.kanet.ru:3478" },
          { urls: "stun.kiwilink.co.nz:3478" },
          { urls: "stun.kundenserver.de:3478" },
          { urls: "stun.l.google.com:19302" },
          { urls: "stun.linea7.net:3478" },
          { urls: "stun.linphone.org:3478" },
          { urls: "stun.liveo.fr:3478" },
          { urls: "stun.lowratevoip.com:3478" },
          { urls: "stun.lugosoft.com:3478" },
          { urls: "stun.lundimatin.fr:3478" },
          { urls: "stun.magnet.ie:3478" },
          { urls: "stun.manle.com:3478" },
          { urls: "stun.mgn.ru:3478" },
          { urls: "stun.mit.de:3478" },
          { urls: "stun.mitake.com.tw:3478" },
          { urls: "stun.miwifi.com:3478" },
          { urls: "stun.modulus.gr:3478" },
          { urls: "stun.mozcom.com:3478" },
          { urls: "stun.myvoiptraffic.com:3478" },
          { urls: "stun.mywatson.it:3478" },
          { urls: "stun.nas.net:3478" },
          { urls: "stun.neotel.co.za:3478" },
          { urls: "stun.netappel.com:3478" },
          { urls: "stun.netappel.fr:3478" },
          { urls: "stun.netgsm.com.tr:3478" },
          { urls: "stun.nfon.net:3478" },
          { urls: "stun.noblogs.org:3478" },
          { urls: "stun.noc.ams-ix.net:3478" },
          { urls: "stun.node4.co.uk:3478" },
          { urls: "stun.nonoh.net:3478" },
          { urls: "stun.nottingham.ac.uk:3478" },
          { urls: "stun.nova.is:3478" },
          { urls: "stun.nventure.com:3478" },
          { urls: "stun.on.net.mk:3478" },
          { urls: "stun.ooma.com:3478" },
          { urls: "stun.ooonet.ru:3478" },
          { urls: "stun.oriontelekom.rs:3478" },
          { urls: "stun.outland-net.de:3478" },
          { urls: "stun.ozekiphone.com:3478" },
          { urls: "stun.patlive.com:3478" },
          { urls: "stun.personal-voip.de:3478" },
          { urls: "stun.petcube.com:3478" },
          { urls: "stun.phone.com:3478" },
          { urls: "stun.phoneserve.com:3478" },
          { urls: "stun.pjsip.org:3478" },
          { urls: "stun.poivy.com:3478" },
          { urls: "stun.powerpbx.org:3478" },
          { urls: "stun.powervoip.com:3478" },
          { urls: "stun.ppdi.com:3478" },
          { urls: "stun.prizee.com:3478" },
          { urls: "stun.qq.com:3478" },
          { urls: "stun.qvod.com:3478" },
          { urls: "stun.rackco.com:3478" },
          { urls: "stun.rapidnet.de:3478" },
          { urls: "stun.rb-net.com:3478" },
          { urls: "stun.refint.net:3478" },
          { urls: "stun.remote-learner.net:3478" },
          { urls: "stun.rixtelecom.se:3478" },
          { urls: "stun.rockenstein.de:3478" },
          { urls: "stun.rolmail.net:3478" },
          { urls: "stun.rounds.com:3478" },
          { urls: "stun.rynga.com:3478" },
          { urls: "stun.samsungsmartcam.com:3478" },
          { urls: "stun.schlund.de:3478" },
          { urls: "stun.services.mozilla.com:3478" },
          { urls: "stun.sigmavoip.com:3478" },
          { urls: "stun.sip.us:3478" },
          { urls: "stun.sipdiscount.com:3478" },
          { urls: "stun.sipgate.net:10000" },
          { urls: "stun.sipgate.net:3478" },
          { urls: "stun.siplogin.de:3478" },
          { urls: "stun.sipnet.net:3478" },
          { urls: "stun.sipnet.ru:3478" },
          { urls: "stun.siportal.it:3478" },
          { urls: "stun.sippeer.dk:3478" },
          { urls: "stun.siptraffic.com:3478" },
          { urls: "stun.skylink.ru:3478" },
          { urls: "stun.sma.de:3478" },
          { urls: "stun.smartvoip.com:3478" },
          { urls: "stun.smsdiscount.com:3478" },
          { urls: "stun.snafu.de:3478" },
          { urls: "stun.softjoys.com:3478" },
          { urls: "stun.solcon.nl:3478" },
          { urls: "stun.solnet.ch:3478" },
          { urls: "stun.sonetel.com:3478" },
          { urls: "stun.sonetel.net:3478" },
          { urls: "stun.sovtest.ru:3478" },
          { urls: "stun.speedy.com.ar:3478" },
          { urls: "stun.spokn.com:3478" },
          { urls: "stun.srce.hr:3478" },
          { urls: "stun.ssl7.net:3478" },
          { urls: "stun.stunprotocol.org:3478" },
          { urls: "stun.symform.com:3478" },
          { urls: "stun.symplicity.com:3478" },
          { urls: "stun.sysadminman.net:3478" },
          { urls: "stun.t-online.de:3478" },
          { urls: "stun.tagan.ru:3478" },
          { urls: "stun.tatneft.ru:3478" },
          { urls: "stun.teachercreated.com:3478" },
          { urls: "stun.tel.lu:3478" },
          { urls: "stun.telbo.com:3478" },
          { urls: "stun.telefacil.com:3478" },
          { urls: "stun.tis-dialog.ru:3478" },
          { urls: "stun.tng.de:3478" },
          { urls: "stun.twt.it:3478" },
          { urls: "stun.u-blox.com:3478" },
          { urls: "stun.ucallweconn.net:3478" },
          { urls: "stun.ucsb.edu:3478" },
          { urls: "stun.ucw.cz:3478" },
          { urls: "stun.uls.co.za:3478" },
          { urls: "stun.unseen.is:3478" },
          { urls: "stun.usfamily.net:3478" },
          { urls: "stun.veoh.com:3478" },
          { urls: "stun.vidyo.com:3478" },
          { urls: "stun.vipgroup.net:3478" },
          { urls: "stun.virtual-call.com:3478" },
          { urls: "stun.viva.gr:3478" },
          { urls: "stun.vivox.com:3478" },
          { urls: "stun.vline.com:3478" },
          { urls: "stun.vo.lu:3478" },
          { urls: "stun.vodafone.ro:3478" },
          { urls: "stun.voicetrading.com:3478" },
          { urls: "stun.voip.aebc.com:3478" },
          { urls: "stun.voip.blackberry.com:3478" },
          { urls: "stun.voip.eutelia.it:3478" },
          { urls: "stun.voiparound.com:3478" },
          { urls: "stun.voipblast.com:3478" },
          { urls: "stun.voipbuster.com:3478" },
          { urls: "stun.voipbusterpro.com:3478" },
          { urls: "stun.voipcheap.co.uk:3478" },
          { urls: "stun.voipcheap.com:3478" },
          { urls: "stun.voipfibre.com:3478" },
          { urls: "stun.voipgain.com:3478" },
          { urls: "stun.voipgate.com:3478" },
          { urls: "stun.voipinfocenter.com:3478" },
          { urls: "stun.voipplanet.nl:3478" },
          { urls: "stun.voippro.com:3478" },
          { urls: "stun.voipraider.com:3478" },
          { urls: "stun.voipstunt.com:3478" },
          { urls: "stun.voipwise.com:3478" },
          { urls: "stun.voipzoom.com:3478" },
          { urls: "stun.vopium.com:3478" },
          { urls: "stun.voxgratia.org:3478" },
          { urls: "stun.voxox.com:3478" },
          { urls: "stun.voys.nl:3478" },
          { urls: "stun.voztele.com:3478" },
          { urls: "stun.vyke.com:3478" },
          { urls: "stun.webcalldirect.com:3478" },
          { urls: "stun.whoi.edu:3478" },
          { urls: "stun.wifirst.net:3478" },
          { urls: "stun.wwdl.net:3478" },
          { urls: "stun.xs4all.nl:3478" },
          { urls: "stun.xtratelecom.es:3478" },
          { urls: "stun.yesss.at:3478" },
          { urls: "stun.zadarma.com:3478" },
          { urls: "stun.zadv.com:3478" },
          { urls: "stun.zoiper.com:3478" },
          { urls: "stun1.faktortel.com.au:3478" },
          { urls: "stun1.l.google.com:19302" },
          { urls: "stun1.voiceeclipse.net:3478" },
          { urls: "stun2.l.google.com:19302" },
          { urls: "stun3.l.google.com:19302" },
          { urls: "stun4.l.google.com:19302" },
          { urls: "stunserver.org:3478" },
          { urls: "23.21.150.121:3478" },
          { urls: "iphone-stun.strato-iphone.de:3478" },
          { urls: "numb.viagenie.ca:3478" },
          { urls: "s1.taraba.net:3478" },
          { urls: "s2.taraba.net:3478" },
          { urls: "stun.12connect.com:3478" },
          { urls: "stun.12voip.com:3478" },
          { urls: "stun.1und1.de:3478" },
          { urls: "stun.2talk.co.nz:3478" },
          { urls: "stun.2talk.com:3478" },
          { urls: "stun.3clogic.com:3478" },
          { urls: "stun.3cx.com:3478" },
          { urls: "stun.a-mm.tv:3478" },
          { urls: "stun.aa.net.uk:3478" },
          { urls: "stun.acrobits.cz:3478" },
          { urls: "stun.actionvoip.com:3478" },
          { urls: "stun.advfn.com:3478" },
          { urls: "stun.aeta-audio.com:3478" },
          { urls: "stun.aeta.com:3478" },
          { urls: "stun.alltel.com.au:3478" },
          { urls: "stun.altar.com.pl:3478" },
          { urls: "stun.annatel.net:3478" },
          { urls: "stun.antisip.com:3478" },
          { urls: "stun.arbuz.ru:3478" },
          { urls: "stun.avigora.com:3478" },
          { urls: "stun.avigora.fr:3478" },
          { urls: "stun.awa-shima.com:3478" },
          { urls: "stun.awt.be:3478" },
          { urls: "stun.b2b2c.ca:3478" },
          { urls: "stun.bahnhof.net:3478" },
          { urls: "stun.barracuda.com:3478" },
          { urls: "stun.bluesip.net:3478" },
          { urls: "stun.bmwgs.cz:3478" },
          { urls: "stun.botonakis.com:3478" },
          { urls: "stun.budgetphone.nl:3478" },
          { urls: "stun.budgetsip.com:3478" },
          { urls: "stun.cablenet-as.net:3478" },
          { urls: "stun.callromania.ro:3478" },
          { urls: "stun.callwithus.com:3478" },
          { urls: "stun.cbsys.net:3478" },
          { urls: "stun.chathelp.ru:3478" },
          { urls: "stun.cheapvoip.com:3478" },
          { urls: "stun.ciktel.com:3478" },
          { urls: "stun.cloopen.com:3478" },
          { urls: "stun.colouredlines.com.au:3478" },
          { urls: "stun.comfi.com:3478" },
          { urls: "stun.commpeak.com:3478" },
          { urls: "stun.comtube.com:3478" },
          { urls: "stun.comtube.ru:3478" },
          { urls: "stun.cope.es:3478" },
          { urls: "stun.counterpath.com:3478" },
          { urls: "stun.counterpath.net:3478" },
          { urls: "stun.cryptonit.net:3478" },
          { urls: "stun.darioflaccovio.it:3478" },
          { urls: "stun.datamanagement.it:3478" },
          { urls: "stun.dcalling.de:3478" },
          { urls: "stun.decanet.fr:3478" },
          { urls: "stun.demos.ru:3478" },
          { urls: "stun.develz.org:3478" },
          { urls: "stun.dingaling.ca:3478" },
          { urls: "stun.doublerobotics.com:3478" },
          { urls: "stun.drogon.net:3478" },
          { urls: "stun.duocom.es:3478" },
          { urls: "stun.dus.net:3478" },
          { urls: "stun.e-fon.ch:3478" },
          { urls: "stun.easybell.de:3478" },
          { urls: "stun.easycall.pl:3478" },
          { urls: "stun.easyvoip.com:3478" },
          { urls: "stun.efficace-factory.com:3478" },
          { urls: "stun.einsundeins.com:3478" },
          { urls: "stun.einsundeins.de:3478" },
          { urls: "stun.ekiga.net:3478" },
          { urls: "stun.epygi.com:3478" },
          { urls: "stun.etoilediese.fr:3478" },
          { urls: "stun.eyeball.com:3478" },
          { urls: "stun.faktortel.com.au:3478" },
          { urls: "stun.freecall.com:3478" },
          { urls: "stun.freeswitch.org:3478" },
          { urls: "stun.freevoipdeal.com:3478" },
          { urls: "stun.fuzemeeting.com:3478" },
          { urls: "stun.gmx.de:3478" },
          { urls: "stun.gmx.net:3478" },
          { urls: "stun.gradwell.com:3478" },
          { urls: "stun.halonet.pl:3478" },
          { urls: "stun.hellonanu.com:3478" },
          { urls: "stun.hoiio.com:3478" },
          { urls: "stun.hosteurope.de:3478" },
          { urls: "stun.ideasip.com:3478" },
          { urls: "stun.imesh.com:3478" },
          { urls: "stun.infra.net:3478" },
          { urls: "stun.internetcalls.com:3478" },
          { urls: "stun.intervoip.com:3478" },
          { urls: "stun.ipcomms.net:3478" },
          { urls: "stun.ipfire.org:3478" },
          { urls: "stun.ippi.fr:3478" },
          { urls: "stun.ipshka.com:3478" },
          { urls: "stun.iptel.org:3478" },
          { urls: "stun.irian.at:3478" },
          { urls: "stun.it1.hr:3478" },
          { urls: "stun.ivao.aero:3478" },
          { urls: "stun.jappix.com:3478" },
          { urls: "stun.jumblo.com:3478" },
          { urls: "stun.justvoip.com:3478" },
          { urls: "stun.kanet.ru:3478" },
          { urls: "stun.kiwilink.co.nz:3478" },
          { urls: "stun.kundenserver.de:3478" },
          { urls: "stun.l.google.com:19302" },
          { urls: "stun.linea7.net:3478" },
          { urls: "stun.linphone.org:3478" },
          { urls: "stun.liveo.fr:3478" },
          { urls: "stun.lowratevoip.com:3478" },
          { urls: "stun.lugosoft.com:3478" },
          { urls: "stun.lundimatin.fr:3478" },
          { urls: "stun.magnet.ie:3478" },
          { urls: "stun.manle.com:3478" },
          { urls: "stun.mgn.ru:3478" },
          { urls: "stun.mit.de:3478" },
          { urls: "stun.mitake.com.tw:3478" },
          { urls: "stun.miwifi.com:3478" },
          { urls: "stun.modulus.gr:3478" },
          { urls: "stun.mozcom.com:3478" },
          { urls: "stun.myvoiptraffic.com:3478" },
          { urls: "stun.mywatson.it:3478" },
          { urls: "stun.nas.net:3478" },
          { urls: "stun.neotel.co.za:3478" },
          { urls: "stun.netappel.com:3478" },
          { urls: "stun.netappel.fr:3478" },
          { urls: "stun.netgsm.com.tr:3478" },
          { urls: "stun.nfon.net:3478" },
          { urls: "stun.noblogs.org:3478" },
          { urls: "stun.noc.ams-ix.net:3478" },
          { urls: "stun.node4.co.uk:3478" },
          { urls: "stun.nonoh.net:3478" },
          { urls: "stun.nottingham.ac.uk:3478" },
          { urls: "stun.nova.is:3478" },
          { urls: "stun.nventure.com:3478" },
          { urls: "stun.on.net.mk:3478" },
          { urls: "stun.ooma.com:3478" },
          { urls: "stun.ooonet.ru:3478" },
          { urls: "stun.oriontelekom.rs:3478" },
          { urls: "stun.outland-net.de:3478" },
          { urls: "stun.ozekiphone.com:3478" },
          { urls: "stun.patlive.com:3478" },
          { urls: "stun.personal-voip.de:3478" },
          { urls: "stun.petcube.com:3478" },
          { urls: "stun.phone.com:3478" },
          { urls: "stun.phoneserve.com:3478" },
          { urls: "stun.pjsip.org:3478" },
          { urls: "stun.poivy.com:3478" },
          { urls: "stun.powerpbx.org:3478" },
          { urls: "stun.powervoip.com:3478" },
          { urls: "stun.ppdi.com:3478" },
          { urls: "stun.prizee.com:3478" },
          { urls: "stun.qq.com:3478" },
          { urls: "stun.qvod.com:3478" },
          { urls: "stun.rackco.com:3478" },
          { urls: "stun.rapidnet.de:3478" },
          { urls: "stun.rb-net.com:3478" },
          { urls: "stun.refint.net:3478" },
          { urls: "stun.remote-learner.net:3478" },
          { urls: "stun.rixtelecom.se:3478" },
          { urls: "stun.rockenstein.de:3478" },
          { urls: "stun.rolmail.net:3478" },
          { urls: "stun.rounds.com:3478" },
          { urls: "stun.rynga.com:3478" },
          { urls: "stun.samsungsmartcam.com:3478" },
          { urls: "stun.schlund.de:3478" },
          { urls: "stun.services.mozilla.com:3478" },
          { urls: "stun.sigmavoip.com:3478" },
          { urls: "stun.sip.us:3478" },
          { urls: "stun.sipdiscount.com:3478" },
          { urls: "stun.sipgate.net:10000" },
          { urls: "stun.sipgate.net:3478" },
          { urls: "stun.siplogin.de:3478" },
          { urls: "stun.sipnet.net:3478" },
          { urls: "stun.sipnet.ru:3478" },
          { urls: "stun.siportal.it:3478" },
          { urls: "stun.sippeer.dk:3478" },
          { urls: "stun.siptraffic.com:3478" },
          { urls: "stun.skylink.ru:3478" },
          { urls: "stun.sma.de:3478" },
          { urls: "stun.smartvoip.com:3478" },
          { urls: "stun.smsdiscount.com:3478" },
          { urls: "stun.snafu.de:3478" },
          { urls: "stun.softjoys.com:3478" },
          { urls: "stun.solcon.nl:3478" },
          { urls: "stun.solnet.ch:3478" },
          { urls: "stun.sonetel.com:3478" },
          { urls: "stun.sonetel.net:3478" },
          { urls: "stun.sovtest.ru:3478" },
          { urls: "stun.speedy.com.ar:3478" },
          { urls: "stun.spokn.com:3478" },
          { urls: "stun.srce.hr:3478" },
          { urls: "stun.ssl7.net:3478" },
          { urls: "stun.stunprotocol.org:3478" },
          { urls: "stun.symform.com:3478" },
          { urls: "stun.symplicity.com:3478" },
          { urls: "stun.sysadminman.net:3478" },
          { urls: "stun.t-online.de:3478" },
          { urls: "stun.tagan.ru:3478" },
          { urls: "stun.tatneft.ru:3478" },
          { urls: "stun.teachercreated.com:3478" },
          { urls: "stun.tel.lu:3478" },
          { urls: "stun.telbo.com:3478" },
          { urls: "stun.telefacil.com:3478" },
          { urls: "stun.tis-dialog.ru:3478" },
          { urls: "stun.tng.de:3478" },
          { urls: "stun.twt.it:3478" },
          { urls: "stun.u-blox.com:3478" },
          { urls: "stun.ucallweconn.net:3478" },
          { urls: "stun.ucsb.edu:3478" },
          { urls: "stun.ucw.cz:3478" },
          { urls: "stun.uls.co.za:3478" },
          { urls: "stun.unseen.is:3478" },
          { urls: "stun.usfamily.net:3478" },
          { urls: "stun.veoh.com:3478" },
          { urls: "stun.vidyo.com:3478" },
          { urls: "stun.vipgroup.net:3478" },
          { urls: "stun.virtual-call.com:3478" },
          { urls: "stun.viva.gr:3478" },
          { urls: "stun.vivox.com:3478" },
          { urls: "stun.vline.com:3478" },
          { urls: "stun.vo.lu:3478" },
          { urls: "stun.vodafone.ro:3478" },
          { urls: "stun.voicetrading.com:3478" },
          { urls: "stun.voip.aebc.com:3478" },
          { urls: "stun.voip.blackberry.com:3478" },
          { urls: "stun.voip.eutelia.it:3478" },
          { urls: "stun.voiparound.com:3478" },
          { urls: "stun.voipblast.com:3478" },
          { urls: "stun.voipbuster.com:3478" },
          { urls: "stun.voipbusterpro.com:3478" },
          { urls: "stun.voipcheap.co.uk:3478" },
          { urls: "stun.voipcheap.com:3478" },
          { urls: "stun.voipfibre.com:3478" },
          { urls: "stun.voipgain.com:3478" },
          { urls: "stun.voipgate.com:3478" },
          { urls: "stun.voipinfocenter.com:3478" },
          { urls: "stun.voipplanet.nl:3478" },
          { urls: "stun.voippro.com:3478" },
          { urls: "stun.voipraider.com:3478" },
          { urls: "stun.voipstunt.com:3478" },
          { urls: "stun.voipwise.com:3478" },
          { urls: "stun.voipzoom.com:3478" },
          { urls: "stun.vopium.com:3478" },
          { urls: "stun.voxgratia.org:3478" },
          { urls: "stun.voxox.com:3478" },
          { urls: "stun.voys.nl:3478" },
          { urls: "stun.voztele.com:3478" },
          { urls: "stun.vyke.com:3478" },
          { urls: "stun.webcalldirect.com:3478" },
          { urls: "stun.whoi.edu:3478" },
          { urls: "stun.wifirst.net:3478" },
          { urls: "stun.wwdl.net:3478" },
          { urls: "stun.xs4all.nl:3478" },
          { urls: "stun.xtratelecom.es:3478" },
          { urls: "stun.yesss.at:3478" },
          { urls: "stun.zadarma.com:3478" },
          { urls: "stun.zadv.com:3478" },
          { urls: "stun.zoiper.com:3478" },
          { urls: "stun1.faktortel.com.au:3478" },
          { urls: "stun1.l.google.com:19302" },
          { urls: "stun1.voiceeclipse.net:3478" },
          { urls: "stun2.l.google.com:19302" },
          { urls: "stun3.l.google.com:19302" },
          { urls: "stun4.l.google.com:19302" },
          { urls: "stunserver.org:3478" },

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
          // Add free TURN servers (limited bandwidth)
          { urls: "turn:turn01.hubl.in?transport=udp" },
          { urls: "turn:turn02.hubl.in?transport=tcp" },

          {
            url: "turn:numb.viagenie.ca",
            credential: "muazkh",
            username: "webrtc@live.com",
          },
          {
            url: "turn:192.158.29.39:3478?transport=udp",
            credential: "JZEOEt2V3Qb0y27GRntt2u2PAYA=",
            username: "28224511:1379330808",
          },
          {
            url: "turn:192.158.29.39:3478?transport=tcp",
            credential: "JZEOEt2V3Qb0y27GRntt2u2PAYA=",
            username: "28224511:1379330808",
          },
          {
            url: "turn:turn.bistri.com:80",
            credential: "homeo",
            username: "homeo",
          },
          {
            url: "turn:turn.anyfirewall.com:443?transport=tcp",
            credential: "webrtc",
            username: "webrtc",
          },
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: "all",
      },
    },
  });

  console.log(`=== WebRTC Debug Info ===`);
  console.log(`Session ID: ${sessionId}`);
  console.log(`Room: ${provider.roomName}`);
  console.log(`URL: ${window.location.href}`);
  console.log(`User Agent: ${navigator.userAgent}`);
  console.log(`Is Secure Context: ${window.isSecureContext}`);

  // Monitor signaling connection with detailed logging
  provider.on("status", (event) => {
    console.log(`[${new Date().toISOString()}] Provider Status:`, event);
    if (event.status === "connected") {
      console.log("✅ Connected to signaling server");
    } else if (event.status === "disconnected") {
      console.log("❌ Disconnected from signaling server");
    }
  });

  // Log all signaling events (with delay to ensure connections are initialized)
  setTimeout(() => {
    if (provider.signalingConns && provider.signalingConns.length > 0) {
      provider.signalingConns.forEach((conn, index) => {
        console.log(`Signaling connection ${index}:`, conn.url || conn);
        // Check if conn is a WebSocket object
        if (conn && typeof conn.addEventListener === "function") {
          conn.addEventListener("open", () => {
            console.log(`✅ Signaling WebSocket opened: ${conn.url}`);
          });
          conn.addEventListener("close", (event) => {
            console.log(
              `❌ Signaling WebSocket closed: ${conn.url}`,
              event.code,
              event.reason
            );
          });
          conn.addEventListener("error", (error) => {
            console.log(`🚨 Signaling WebSocket error: ${conn.url}`, error);
          });
        } else {
          console.log(
            `Signaling connection ${index} is not a WebSocket:`,
            typeof conn,
            conn
          );
        }
      });
    } else {
      console.log("❌ No signaling connections found");
    }
  }, 500);

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

  // Enhanced provider diagnostics
  setTimeout(() => {
    console.log(`Provider Client ID: ${provider.awareness.clientID}`);
    console.log(`Connected Peers: ${provider.awareness.getStates().size - 1}`);
    console.log(`Provider roomName property: ${provider.roomName}`);
    console.log(`Provider connected: ${provider.connected}`);
    console.log(
      `Signaling connections: ${provider.signalingConns?.length || 0}`
    );
    console.log(`Provider properties:`, Object.getOwnPropertyNames(provider));

    // Check if signaling is actually working
    provider.signalingConns?.forEach((conn, i) => {
      console.log(
        `Signaling ${i}: ${conn.url || "no url"} - connected: ${
          conn.connected || "false"
        }`
      );
    });
  }, 2000);

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
  // use the parent node's position with proper padding
  if (cursorRect.height === 0) {
    const parentNode = tempSpan.parentNode || editor;
    const parentRect = parentNode.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(editor);
    const lineHeight = parseInt(computedStyle.lineHeight) || 27; // matches CSS calc

    cursorRect = {
      left: parentRect.left + 24, // matches --space-lg (1.5rem = 24px)
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
      left: editorRect.left + 24, // matches --space-lg (1.5rem = 24px)
      top: editorRect.top + 24, // matches --space-lg (1.5rem = 24px)
      width: 0,
      height: 27, // matches CSS calc(1rem * 1.7) = 27.2px
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

// Update peer cursor positions when layout changes
function repositionPeerCursors() {
  if (!provider || !provider.awareness) return;

  const states = provider.awareness.getStates();
  const localClientId = provider.awareness.clientID;

  states.forEach((state, clientId) => {
    if (clientId === localClientId || !state.user || !state.user.cursor) return;

    const cursorElement = peerCursors[clientId];
    if (cursorElement) {
      const cursorPosition = state.user.cursor;
      const editorRect = editor.getBoundingClientRect();
      const absoluteLeft = editorRect.left + cursorPosition.left;
      const absoluteTop = editorRect.top + cursorPosition.top;

      cursorElement.style.left = `${absoluteLeft}px`;
      cursorElement.style.top = `${absoluteTop}px`;
    }
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

// Save to file functionality
async function saveNotesToFile() {
  const content = editor.innerText || editor.textContent || "";

  if (!content.trim()) {
    alert("No content to save!");
    return;
  }

  // Create default filename with timestamp
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const defaultFilename = `${roomName ?? "vibe_notes"}_${timestamp}`;

  // Debug: Log API availability

  // Try File System Access API first (Chrome 86+, Edge 86+)
  if ("showSaveFilePicker" in window && window.isSecureContext) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: defaultFilename,
        excludeAcceptAllOption: false,
        types: [
          {
            description: "All files",
            accept: { "*/*": [] },
          },
        ],
      });

      // Get the file extension from the chosen filename
      const filename = fileHandle.name;
      const extension = filename.split(".").pop()?.toLowerCase() || "txt";

      // Format content based on extension
      let fileContent = content;

      switch (extension) {
        case "html":
        case "htm":
          fileContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${filename.replace(/\.[^/.]+$/, "")}</title>
</head>
<body>
    <pre>${content}</pre>
</body>
</html>`;
          break;
        case "json":
          fileContent = JSON.stringify(
            {
              title: filename.replace(/\.[^/.]+$/, ""),
              content: content,
              timestamp: now.toISOString(),
              sessionId: currentSessionId,
            },
            null,
            2
          );
          break;
        default:
          fileContent = content;
      }

      const writable = await fileHandle.createWritable();
      await writable.write(fileContent);
      await writable.close();

      console.log(`📄 Notes saved as: ${filename}`);
      return;
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("User cancelled save dialog");
        return;
      }
      console.error("Native save dialog failed:", error.message);
      // Fall through to download method
    }
  }

  // Fallback: Use download method
  downloadFile(content, defaultFilename);
}

// Download method (works in all browsers)
function downloadFile(content, defaultFilename) {
  const filename = prompt("Enter filename with extension:", defaultFilename);

  if (filename === null || !filename.trim()) {
    return;
  }

  const extension = filename.split(".").pop()?.toLowerCase() || "txt";
  let fileContent = content;
  let mimeType = "text/plain;charset=utf-8";

  switch (extension) {
    case "md":
    case "markdown":
      mimeType = "text/markdown;charset=utf-8";
      break;
    case "html":
    case "htm":
      mimeType = "text/html;charset=utf-8";
      fileContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${filename.replace(/\.[^/.]+$/, "")}</title>
</head>
<body>
    <pre>${content}</pre>
</body>
</html>`;
      break;
    case "json":
      mimeType = "application/json;charset=utf-8";
      fileContent = JSON.stringify(
        {
          title: filename.replace(/\.[^/.]+$/, ""),
          content: content,
          timestamp: new Date().toISOString(),
          sessionId: currentSessionId,
        },
        null,
        2
      );
      break;
    default:
      mimeType = "text/plain;charset=utf-8";
  }

  const blob = new Blob([fileContent], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
  console.log(`📄 Notes downloaded as: ${filename}`);
}

// Load from file functionality
let isLoadingFile = false; // Prevent double execution

async function loadFromFile() {
  if (isLoadingFile) {
    console.log("🔍 Load already in progress, ignoring duplicate call");
    return;
  }

  isLoadingFile = true;

  try {
    // Use File System Access API if available
    if ("showOpenFilePicker" in window && window.isSecureContext) {
      const [fileHandle] = await window.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: [
          {
            description: "Text files",
            accept: {
              "text/plain": [".txt", ".md", ".markdown"],
              "text/javascript": [".js", ".mjs"],
              "text/typescript": [".ts"],
              "text/html": [".html", ".htm"],
              "application/json": [".json"],
              "text/css": [".css"],
              "text/xml": [".xml"],
              "application/xml": [".xml"],
              "text/*": [".log", ".conf", ".ini", ".cfg"],
            },
          },
        ],
      });

      const file = await fileHandle.getFile();
      const content = await file.text();

      // Update the editor content
      if (editor && yText) {
        // Let Yjs handle the editor update through its observer
        yText.doc.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, content);
        });
        // Don't manually update editor - let Yjs observer handle it
      }

      console.log(`📁 Loaded file: ${file.name} (${file.size} bytes)`);
    } else {
      // Fallback for older browsers
      loadFileWithInput();
    }
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("User cancelled file selection");
    } else {
      console.error("Error loading file:", error);
      // Try fallback method
      loadFileWithInput();
    }
  } finally {
    isLoadingFile = false;
  }
}

// Fallback file input method (works in all browsers)
function loadFileWithInput() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept =
    ".txt,.md,.markdown,.js,.mjs,.ts,.html,.htm,.json,.css,.xml,.log,.conf,.ini,.cfg,text/*";
  input.style.display = "none";

  input.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const content = await file.text();

      // Update the editor content
      if (editor && yText) {
        // Let Yjs handle the editor update through its observer
        yText.doc.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, content);
        });
        // Don't manually update editor - let Yjs observer handle it
      }

      console.log(`📁 Loaded file: ${file.name} (${file.size} bytes)`);
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Error reading file: " + error.message);
    } finally {
      document.body.removeChild(input);
    }
  });

  document.body.appendChild(input);
  input.click();
}

// Save button event listener
saveButton.addEventListener("click", saveNotesToFile);

// Load button event listener
const loadButton = document.getElementById("load-btn");
loadButton.addEventListener("click", loadFromFile);

// Window resize listener to reposition peer cursors
let resizeTimeout;
window.addEventListener("resize", () => {
  // Debounce resize events to avoid excessive repositioning
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    repositionPeerCursors();
  }, 100);
});

// Keyboard shortcuts
document.addEventListener("keydown", (event) => {
  // Ctrl+O or Cmd+O to load file
  if ((event.ctrlKey || event.metaKey) && event.key === "o") {
    event.preventDefault();
    loadFromFile();
  }

  // Ctrl+S or Cmd+S to save file
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    saveNotesToFile();
  }

  // F11 to toggle header visibility
  if (event.key === "F11") {
    event.preventDefault();
    toggleHeader();
  }

  // Ctrl+Shift+D for manual diagnostics
  if (event.ctrlKey && event.shiftKey && event.key === "D") {
    event.preventDefault();
    console.log("🔍 Manual diagnostics triggered...");
    if (provider) {
      console.log("Provider exists:", !!provider);
      console.log("Provider room:", provider.room);
      console.log(
        "Signaling connections:",
        provider.signalingConns?.length || 0
      );
      console.log("WebRTC connections:", provider.room?.webrtcConns?.size || 0);
      console.log("Awareness states:", provider.awareness.getStates().size);
      console.log("Document synced:", provider.synced);
    } else {
      console.log("❌ No provider found");
    }
  }
});
