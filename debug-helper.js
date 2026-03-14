// Cross-Network WebRTC Debugging Helper
// Use this to systematically test cross-network connectivity

console.log('🔧 Cross-Network WebRTC Debug Helper Loaded');

window.WebRTCDebugger = {
  // Test network connectivity
  testNetworkConnectivity: async function() {
    console.log('🌐 Testing network connectivity...');
    
    // Test basic connectivity
    const isOnline = navigator.onLine;
    console.log(`   Online: ${isOnline}`);
    
    // Test connection info
    if (navigator.connection) {
      console.log('   Connection info:', {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData
      });
    }
    
    // Test DNS resolution
    try {
      const response = await fetch('https://httpbin.org/ip');
      const data = await response.json();
      console.log(`   Public IP: ${data.origin}`);
    } catch (e) {
      console.error('   Failed to get public IP:', e);
    }
    
    // Test WebSocket connectivity to signaling server
    const signalingUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    console.log(`   Testing WebSocket to: ${signalingUrl}`);
    
    try {
      const ws = new WebSocket(signalingUrl);
      ws.onopen = () => {
        console.log('   ✅ WebSocket connection successful');
        ws.close();
      };
      ws.onerror = (e) => {
        console.error('   ❌ WebSocket connection failed:', e);
      };
    } catch (e) {
      console.error('   ❌ WebSocket creation failed:', e);
    }
  },
  
  // Test WebRTC API support
  testWebRTCSupport: function() {
    console.log('🔍 Testing WebRTC API support...');
    
    const support = {
      RTCPeerConnection: !!window.RTCPeerConnection,
      RTCIceCandidate: !!window.RTCIceCandidate,
      RTCSessionDescription: !!window.RTCSessionDescription,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      RTCDataChannel: !!window.RTCDataChannel
    };
    
    console.log('   WebRTC Support:', support);
    console.log(`   Overall support: ${Object.values(support).every(v => v) ? '✅ Full' : '❌ Partial'}`);
    
    return support;
  },
  
  // Monitor current WebRTC connections
  monitorCurrentConnections: function() {
    console.log('👥 Monitoring current WebRTC connections...');
    
    if (!window.provider) {
      console.log('   ❌ No WebRTC provider found');
      return;
    }
    
    // Provider info
    console.log(`   Provider client ID: ${window.provider.awareness.clientID}`);
    console.log(`   Room name: ${window.provider.roomName}`);
    console.log(`   Connected: ${window.provider.connected}`);
    
    // Signaling connections
    const signalingConns = window.provider.signalingConns || [];
    console.log(`   Signaling connections: ${signalingConns.length}`);
    signalingConns.forEach((conn, i) => {
      console.log(`     ${i}: ${conn.url} - ${conn.connected ? 'connected' : 'disconnected'}`);
    });
    
    // WebRTC connections
    const webrtcConns = window.provider.webrtcConns;
    if (webrtcConns && webrtcConns.size > 0) {
      console.log(`   WebRTC connections: ${webrtcConns.size}`);
      webrtcConns.forEach((conn, peerId) => {
        if (conn && conn.peer) {
          console.log(`     Peer ${peerId}:`, {
            connectionState: conn.peer.connectionState,
            iceConnectionState: conn.peer.iceConnectionState,
            iceGatheringState: conn.peer.iceGatheringState,
            signalingState: conn.peer.signalingState
          });
        }
      });
    } else {
      console.log('   ❌ No WebRTC connections found');
    }
    
    // Awareness peers
    const awarenessStates = window.provider.awareness.getStates();
    console.log(`   Awareness peers: ${awarenessStates.size - 1}`);
    awarenessStates.forEach((state, clientId) => {
      if (clientId !== window.provider.awareness.clientID) {
        console.log(`     Peer ${clientId}: ${state.user?.name || 'Anonymous'}`);
      }
    });
  },
  
  // Test TURN server connectivity
  testTurnServers: async function() {
    console.log('🔄 Testing TURN server connectivity...');
    
    if (!window.provider) {
      console.log('   ❌ No WebRTC provider found');
      return;
    }
    
    const iceServers = window.provider.iceServers || [];
    console.log(`   Testing ${iceServers.length} ICE servers...`);
    
    // Test each ICE server
    for (let i = 0; i < iceServers.length; i++) {
      const server = iceServers[i];
      console.log(`   Testing server ${i + 1}: ${server.urls}`);
      
      try {
        const pc = new RTCPeerConnection({
          iceServers: [server]
        });
        
        // Create a simple offer to trigger ICE gathering
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Wait a bit for ICE candidates
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log(`     ✅ Server ${i + 1} appears accessible`);
        pc.close();
      } catch (e) {
        console.error(`     ❌ Server ${i + 1} failed:`, e);
      }
    }
  },
  
  // Run full diagnostic suite
  runFullDiagnostic: async function() {
    console.log('🚀 Starting full WebRTC diagnostic suite...');
    console.log('=' .repeat(50));
    
    this.testNetworkConnectivity();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.testWebRTCSupport();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.monitorCurrentConnections();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await this.testTurnServers();
    
    console.log('=' .repeat(50));
    console.log('🏁 Diagnostic suite complete');
  },
  
  // Enable continuous monitoring
  enableContinuousMonitoring: function(intervalMs = 5000) {
    console.log(`📊 Enabling continuous monitoring every ${intervalMs}ms...`);
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(() => {
      this.monitorCurrentConnections();
    }, intervalMs);
  },
  
  // Disable continuous monitoring
  disableContinuousMonitoring: function() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('📊 Continuous monitoring disabled');
    }
  }
};

// Auto-expose to global scope for easy access
console.log('💡 Usage: WebRTCDebugger.runFullDiagnostic() for full diagnostics');
console.log('💡 Usage: WebRTCDebugger.enableContinuousMonitoring() for live monitoring');
