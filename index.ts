// DOBBLE BACKEND V1 - Interactive API Gateway & Developer Console
const app = document.getElementById('app');

interface ServerStatus {
  name: string;
  version: string;
  status: string;
  metrics: {
    registeredUsers: number;
    registeredDevices: number;
    activePairings: number;
    onlineWebSocketDevices: number;
    onlineDeviceList: string[];
  };
}

let activeTab: 'overview' | 'api' | 'websocket' | 'android' | 'docker' = 'overview';
let activeWs: WebSocket | null = null;
let wsLogs: Array<{ time: string; direction: 'in' | 'out' | 'sys'; text: string }> = [];

async function fetchStatus(): Promise<ServerStatus | null> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function renderConsole(status: ServerStatus | null) {
  if (!app) return;

  const isOnline = !!status && status.status === 'OPERATIONAL';
  const onlineCount = status?.metrics?.onlineWebSocketDevices ?? 0;
  const userCount = status?.metrics?.registeredUsers ?? 0;
  const deviceCount = status?.metrics?.registeredDevices ?? 0;
  const pairingCount = status?.metrics?.activePairings ?? 0;

  app.innerHTML = `
    <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <!-- Top Navigation Bar -->
      <header class="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 text-lg">
            DB
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-xl font-bold tracking-tight text-white">DOBBLE BACKEND V1</h1>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              }">
                <span class="w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}"></span>
                ${isOnline ? 'OPERATIONAL' : 'OFFLINE'}
              </span>
            </div>
            <p class="text-xs text-slate-400">Communication & Signaling Gateway for DOBBLE R ↔ DOBBLE R1</p>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <nav class="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
          <button id="tab-overview" class="px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
            activeTab === 'overview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }">Overview</button>
          <button id="tab-api" class="px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
            activeTab === 'api' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }">REST API</button>
          <button id="tab-websocket" class="px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
            activeTab === 'websocket' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }">WebSocket (/ws)</button>
          <button id="tab-android" class="px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
            activeTab === 'android' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }">Android Setup</button>
          <button id="tab-docker" class="px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
            activeTab === 'docker' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }">Deployment</button>
        </nav>
      </header>

      <!-- Main Body Content -->
      <main class="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        ${renderTabContent(status, { onlineCount, userCount, deviceCount, pairingCount })}
      </main>

      <!-- Footer -->
      <footer class="border-t border-slate-800/80 bg-slate-900/40 px-6 py-4 text-center text-xs text-slate-500">
        DOBBLE BACKEND V1 &bull; Standalone Node.js & WebSocket Communication Engine &bull; Port 3000
      </footer>
    </div>
  `;

  attachEventHandlers();
}

function renderTabContent(
  status: ServerStatus | null,
  counts: { onlineCount: number; userCount: number; deviceCount: number; pairingCount: number }
): string {
  switch (activeTab) {
    case 'overview':
      return `
        <!-- Metrics Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <span class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Active WS Devices</span>
            <div class="mt-2 flex items-baseline gap-2">
              <span class="text-3xl font-bold text-white">${counts.onlineCount}</span>
              <span class="text-xs text-emerald-400 font-medium">Real-time /ws</span>
            </div>
            <p class="text-xs text-slate-500 mt-1">Connected DOBBLE R / R1 peers</p>
          </div>

          <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <span class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Registered Devices</span>
            <div class="mt-2 flex items-baseline gap-2">
              <span class="text-3xl font-bold text-white">${counts.deviceCount}</span>
              <span class="text-xs text-indigo-400 font-medium">R & R1 records</span>
            </div>
            <p class="text-xs text-slate-500 mt-1">Unique hardware identifiers</p>
          </div>

          <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <span class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Active Pairings</span>
            <div class="mt-2 flex items-baseline gap-2">
              <span class="text-3xl font-bold text-white">${counts.pairingCount}</span>
              <span class="text-xs text-cyan-400 font-medium">Approved & Pending</span>
            </div>
            <p class="text-xs text-slate-500 mt-1">Pairing relationships verified</p>
          </div>

          <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <span class="text-xs uppercase tracking-wider text-slate-400 font-semibold">User Accounts</span>
            <div class="mt-2 flex items-baseline gap-2">
              <span class="text-3xl font-bold text-white">${counts.userCount}</span>
              <span class="text-xs text-amber-400 font-medium">Auth credentials</span>
            </div>
            <p class="text-xs text-slate-500 mt-1">Bcrypt & JWT authentication</p>
          </div>
        </div>

        <!-- Architecture Flow -->
        <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 class="text-lg font-bold text-white">System Architecture & Traffic Topology</h2>
          <div class="p-6 bg-slate-950 rounded-xl border border-slate-800/80 font-mono text-xs overflow-x-auto text-slate-300 leading-relaxed">
            <pre>
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│        DOBBLE R (Sender)        │                 │       DOBBLE R1 (Viewer)        │
│   - GPS Location Streamer       │                 │   - Live Tracking Map           │
│   - WebRTC Camera Source        │                 │   - WebRTC Remote Video Viewer  │
│   - Screen Capture Source       │                 │   - Screen Sharing Viewer       │
└────────────────┬────────────────┘                 └────────────────▲────────────────┘
                 │                                                   │
                 │ HTTPS (REST API) & WSS (/ws)                      │ HTTPS (REST API) & WSS (/ws)
                 ▼                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              DOBBLE BACKEND V1                                      │
│                                                                                     │
│  - REST API Engine (Auth, Device Registration, Pairing State Machine, GPS Upload)   │
│  - WebSocket RFC 6455 Gateway (/ws with Bearer Token Authorization)                 │
│  - WebRTC Signaling Broker (SDP Offer/Answer & ICE Candidates Relay)                │
│  - Strict Pairing Access Controller (Only APPROVED pairs can access streams)        │
│  - PostgreSQL Database with Prisma ORM                                              │
└─────────────────────────────────────────────────────────────────────────────────────┘
            </pre>
          </div>
        </div>

        <!-- Quick API Health Test -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <h3 class="font-semibold text-white text-sm mb-3">Live Health Endpoint Check</h3>
            <button id="btn-test-health" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition">
              Call GET /api/health
            </button>
            <div id="health-result" class="mt-3 p-3 bg-slate-950 rounded-lg text-xs font-mono text-slate-300 border border-slate-800 max-h-40 overflow-y-auto">
              Click button above to probe endpoint.
            </div>
          </div>

          <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <h3 class="font-semibold text-white text-sm mb-3">System Status & Metrics Check</h3>
            <button id="btn-test-status" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition">
              Call GET /api/status
            </button>
            <div id="status-result" class="mt-3 p-3 bg-slate-950 rounded-lg text-xs font-mono text-slate-300 border border-slate-800 max-h-40 overflow-y-auto">
              Click button above to probe endpoint.
            </div>
          </div>
        </div>
      `;

    case 'api':
      return `
        <div class="space-y-6">
          <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 class="text-lg font-bold text-white mb-2">DOBBLE BACKEND REST API Endpoints</h2>
            <p class="text-sm text-slate-400 mb-6">
              All endpoints respond with <code class="text-indigo-400 font-mono">application/json</code>. Authenticated routes require <code class="text-indigo-400 font-mono">Authorization: Bearer &lt;token&gt;</code>.
            </p>

            <div class="space-y-4">
              <!-- Auth Group -->
              <div class="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <div class="px-4 py-3 bg-slate-900/80 border-b border-slate-800 font-semibold text-xs text-indigo-400 uppercase tracking-wider">
                  Authentication (/api/auth)
                </div>
                <div class="divide-y divide-slate-800/60 text-xs font-mono">
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">POST</span> /api/auth/register</span>
                    <span class="text-slate-400 font-sans">Register new user account (email, password)</span>
                  </div>
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">POST</span> /api/auth/login</span>
                    <span class="text-slate-400 font-sans">Login and obtain Access Token & Refresh Token</span>
                  </div>
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">POST</span> /api/auth/refresh</span>
                    <span class="text-slate-400 font-sans">Rotate expired access token via refresh token</span>
                  </div>
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">POST</span> /api/auth/logout</span>
                    <span class="text-slate-400 font-sans">Invalidate session and revoke tokens</span>
                  </div>
                </div>
              </div>

              <!-- Device Group -->
              <div class="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <div class="px-4 py-3 bg-slate-900/80 border-b border-slate-800 font-semibold text-xs text-cyan-400 uppercase tracking-wider">
                  Device Management (/api/devices)
                </div>
                <div class="divide-y divide-slate-800/60 text-xs font-mono">
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">POST</span> /api/devices/register</span>
                    <span class="text-slate-400 font-sans">Register hardware device ID with appType ('R' or 'R1')</span>
                  </div>
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold">GET</span> /api/devices</span>
                    <span class="text-slate-400 font-sans">List user's registered devices with online status</span>
                  </div>
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold">GET</span> /api/devices/:id</span>
                    <span class="text-slate-400 font-sans">Get device details (authorized to owner or approved paired R1)</span>
                  </div>
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold">DELETE</span> /api/devices/:id</span>
                    <span class="text-slate-400 font-sans">Unregister device</span>
                  </div>
                </div>
              </div>

              <!-- Pairing Group -->
              <div class="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <div class="px-4 py-3 bg-slate-900/80 border-b border-slate-800 font-semibold text-xs text-amber-400 uppercase tracking-wider">
                  Pairing System (/api/pairing)
                </div>
                <div class="divide-y divide-slate-800/60 text-xs font-mono">
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">POST</span> /api/pairing/request</span>
                    <span class="text-slate-400 font-sans">DOBBLE R initiates pairing to DOBBLE R1 (triggers WS event)</span>
                  </div>
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold">GET</span> /api/pairing/requests</span>
                    <span class="text-slate-400 font-sans">DOBBLE R1 fetches pending incoming requests</span>
                  </div>
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">POST</span> /api/pairing/:id/approve</span>
                    <span class="text-slate-400 font-sans">DOBBLE R1 approves pairing (triggers WS pairing.approved)</span>
                  </div>
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">POST</span> /api/pairing/:id/reject</span>
                    <span class="text-slate-400 font-sans">DOBBLE R1 rejects pairing (triggers WS pairing.rejected)</span>
                  </div>
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">POST</span> /api/pairing/:id/revoke</span>
                    <span class="text-slate-400 font-sans">Revoke an active approved pairing</span>
                  </div>
                </div>
              </div>

              <!-- Location Group -->
              <div class="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <div class="px-4 py-3 bg-slate-900/80 border-b border-slate-800 font-semibold text-xs text-emerald-400 uppercase tracking-wider">
                  Location Tracking (/api/location)
                </div>
                <div class="divide-y divide-slate-800/60 text-xs font-mono">
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">POST</span> /api/location/update</span>
                    <span class="text-slate-400 font-sans">DOBBLE R pushes GPS fix (relayed via WS to approved R1 devices)</span>
                  </div>
                  <div class="p-3 flex items-center justify-between hover:bg-slate-900/40">
                    <span class="flex items-center gap-2"><span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold">GET</span> /api/location/:deviceId</span>
                    <span class="text-slate-400 font-sans">Fetch latest GPS coordinate fix for paired device</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

    case 'websocket':
      return `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Connection & Inspector -->
          <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 class="text-lg font-bold text-white">Live WebSocket Client (/ws)</h2>
            <p class="text-xs text-slate-400 leading-relaxed">
              Connect to the WebSocket server using a device access token to inspect real-time signaling, location frames, and pairing notifications.
            </p>

            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-slate-300 mb-1">Device Token (JWT)</label>
                <input id="ws-token-input" type="text" placeholder="Paste JWT token or leave empty for dev test" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div class="flex gap-2">
                <button id="btn-ws-connect" class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition">
                  Connect /ws
                </button>
                <button id="btn-ws-disconnect" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition">
                  Disconnect
                </button>
                <button id="btn-ws-ping" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition">
                  Send Ping
                </button>
              </div>
            </div>

            <!-- Terminal Output -->
            <div class="space-y-2">
              <div class="flex justify-between items-center text-xs text-slate-400">
                <span>Event Stream Log</span>
                <button id="btn-clear-logs" class="text-indigo-400 hover:underline">Clear</button>
              </div>
              <div id="ws-terminal" class="bg-slate-950 border border-slate-800/80 rounded-xl p-3 h-72 overflow-y-auto font-mono text-xs space-y-1.5 text-slate-300">
                ${
                  wsLogs.length === 0
                    ? '<div class="text-slate-500">No events yet. Connect to /ws above to listen for real-time signaling.</div>'
                    : wsLogs
                        .map(
                          (l) => `
                    <div class="flex items-start gap-2">
                      <span class="text-slate-500 select-none">[${l.time}]</span>
                      <span class="font-bold ${
                        l.direction === 'in'
                          ? 'text-emerald-400'
                          : l.direction === 'out'
                          ? 'text-cyan-400'
                          : 'text-amber-400'
                      }">${l.direction === 'in' ? '▼ IN' : l.direction === 'out' ? '▲ OUT' : '● SYS'}</span>
                      <span class="break-all">${l.text}</span>
                    </div>
                  `
                        )
                        .join('')
                }
              </div>
            </div>
          </div>

          <!-- Protocol Reference -->
          <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 class="text-lg font-bold text-white">WebSocket JSON Event Specification</h2>
            <div class="space-y-3 text-xs">
              <div class="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span class="text-indigo-400 font-bold font-mono">1. Lifecycle & Pairing Events</span>
                <pre class="mt-1 text-slate-400 font-mono">{
  "type": "device.online" | "device.offline",
  "deviceId": "samsung-s23",
  "timestamp": 1727712000000
}
{
  "type": "pairing.request" | "pairing.approved" | "pairing.rejected",
  "deviceId": "r-device-01",
  "targetDeviceId": "r1-device-01",
  "requestId": "uuid"
}</pre>
              </div>

              <div class="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span class="text-cyan-400 font-bold font-mono">2. Location Stream Event</span>
                <pre class="mt-1 text-slate-400 font-mono">{
  "type": "location.update",
  "deviceId": "r-device-01",
  "payload": {
    "latitude": -6.2088,
    "longitude": 106.8456,
    "accuracy": 10.0,
    "timestamp": 1727712000000
  }
}</pre>
              </div>

              <div class="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span class="text-amber-400 font-bold font-mono">3. WebRTC Camera & Screen Signaling</span>
                <pre class="mt-1 text-slate-400 font-mono">{
  "type": "camera.request" | "camera.approved" | "camera.rejected",
  "type": "camera.offer" | "camera.answer" | "camera.ice_candidate",
  "type": "screen.request" | "screen.offer" | "screen.ice_candidate",
  "deviceId": "sender-id",
  "targetDeviceId": "receiver-id",
  "payload": { /* SDP string or RTCIceCandidate object */ }
}</pre>
              </div>
            </div>
          </div>
        </div>
      `;

    case 'android':
      return `
        <div class="space-y-6">
          <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 class="text-lg font-bold text-white mb-2">Android Integration Guide</h2>
            <p class="text-sm text-slate-400 mb-6">
              Connect both DOBBLE R and DOBBLE R1 Android applications to this backend server using standard Retrofit / OkHttp / Ktor and WebSocket libraries.
            </p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- DOBBLE R Config -->
              <div class="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-cyan-400 text-sm">DOBBLE R (Sender / Tracker)</h3>
                  <span class="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 text-xs font-mono font-semibold">appType = "R"</span>
                </div>
                <p class="text-xs text-slate-400 leading-relaxed">
                  Put these values in your Kotlin/Java constants file or <code class="text-slate-300 font-mono">build.gradle.kts</code>:
                </p>
                <div class="bg-slate-900 p-3 rounded-lg font-mono text-xs text-slate-300">
                  <pre>object DobbleRBackendConfig {
    const val BASE_API_URL = "https://your-domain.com/api"
    const val WEBSOCKET_URL = "wss://your-domain.com/ws"
    const val APP_TYPE = "R"
}</pre>
                </div>
                <div class="text-xs text-slate-400 space-y-1">
                  <div><strong>1. Register:</strong> <code class="text-indigo-300 font-mono">POST /api/devices/register</code></div>
                  <div><strong>2. Connect WS:</strong> <code class="text-indigo-300 font-mono">wss://.../ws?token=...</code></div>
                  <div><strong>3. Request Pairing:</strong> <code class="text-indigo-300 font-mono">POST /api/pairing/request</code></div>
                  <div><strong>4. Send GPS:</strong> <code class="text-indigo-300 font-mono">POST /api/location/update</code></div>
                </div>
              </div>

              <!-- DOBBLE R1 Config -->
              <div class="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-indigo-400 text-sm">DOBBLE R1 (Viewer / Controller)</h3>
                  <span class="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 text-xs font-mono font-semibold">appType = "R1"</span>
                </div>
                <p class="text-xs text-slate-400 leading-relaxed">
                  Put these values in your Kotlin/Java constants file or <code class="text-slate-300 font-mono">build.gradle.kts</code>:
                </p>
                <div class="bg-slate-900 p-3 rounded-lg font-mono text-xs text-slate-300">
                  <pre>object DobbleR1BackendConfig {
    const val BASE_API_URL = "https://your-domain.com/api"
    const val WEBSOCKET_URL = "wss://your-domain.com/ws"
    const val APP_TYPE = "R1"
}</pre>
                </div>
                <div class="text-xs text-slate-400 space-y-1">
                  <div><strong>1. Register:</strong> <code class="text-indigo-300 font-mono">POST /api/devices/register</code></div>
                  <div><strong>2. Connect WS:</strong> <code class="text-indigo-300 font-mono">wss://.../ws?token=...</code></div>
                  <div><strong>3. Listen:</strong> <code class="text-indigo-300 font-mono">pairing.request</code></div>
                  <div><strong>4. Approve:</strong> <code class="text-indigo-300 font-mono">POST /api/pairing/:id/approve</code></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

    case 'docker':
      return `
        <div class="space-y-6">
          <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 class="text-lg font-bold text-white">Docker & Cloud Deployment</h2>
            <p class="text-sm text-slate-400">
              The project is containerized with a production multi-stage <code class="text-indigo-300 font-mono">Dockerfile</code> and <code class="text-indigo-300 font-mono">docker-compose.yml</code>.
            </p>

            <div class="space-y-4 text-xs font-mono">
              <div class="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <span class="text-emerald-400 font-bold font-sans text-sm">1. Local Docker Compose (Backend + PostgreSQL)</span>
                <pre class="text-slate-300"># Start both PostgreSQL and DOBBLE BACKEND V1
docker compose up --build -d

# Check live logs
docker compose logs -f backend

# Stop services
docker compose down</pre>
              </div>

              <div class="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <span class="text-cyan-400 font-bold font-sans text-sm">2. Database Migration with Prisma</span>
                <pre class="text-slate-300"># Generate Prisma client
npx prisma generate

# Apply migrations to PostgreSQL
npx prisma migrate dev --name init_dobble_v1</pre>
              </div>

              <div class="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <span class="text-amber-400 font-bold font-sans text-sm">3. Deploy to Render / Railway / VPS</span>
                <pre class="text-slate-300"># Set environment variables on your cloud provider:
PORT=3000
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/db?schema=public
JWT_SECRET=generate_strong_64_char_secret_key
JWT_REFRESH_SECRET=generate_strong_64_char_refresh_key
CORS_ORIGIN=*

# Target Cloud URLs generated:
HTTPS API:  https://api.yourdomain.com
WSS Socket: wss://api.yourdomain.com/ws</pre>
              </div>
            </div>
          </div>
        </div>
      `;
  }
}

function attachEventHandlers() {
  document.getElementById('tab-overview')?.addEventListener('click', () => {
    activeTab = 'overview';
    refreshUI();
  });
  document.getElementById('tab-api')?.addEventListener('click', () => {
    activeTab = 'api';
    refreshUI();
  });
  document.getElementById('tab-websocket')?.addEventListener('click', () => {
    activeTab = 'websocket';
    refreshUI();
  });
  document.getElementById('tab-android')?.addEventListener('click', () => {
    activeTab = 'android';
    refreshUI();
  });
  document.getElementById('tab-docker')?.addEventListener('click', () => {
    activeTab = 'docker';
    refreshUI();
  });

  // Health test button
  document.getElementById('btn-test-health')?.addEventListener('click', async () => {
    const el = document.getElementById('health-result');
    if (!el) return;
    el.textContent = 'Calling /api/health...';
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      el.textContent = JSON.stringify(data, null, 2);
    } catch (err: any) {
      el.textContent = 'Error: ' + err.message;
    }
  });

  // Status test button
  document.getElementById('btn-test-status')?.addEventListener('click', async () => {
    const el = document.getElementById('status-result');
    if (!el) return;
    el.textContent = 'Calling /api/status...';
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      el.textContent = JSON.stringify(data, null, 2);
    } catch (err: any) {
      el.textContent = 'Error: ' + err.message;
    }
  });

  // WebSocket connect
  document.getElementById('btn-ws-connect')?.addEventListener('click', () => {
    const input = document.getElementById('ws-token-input') as HTMLInputElement;
    const token = input?.value?.trim() || '';

    if (activeWs) {
      activeWs.close();
      activeWs = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws${token ? '?token=' + encodeURIComponent(token) : ''}`;

    appendWsLog('sys', `Connecting to ${wsUrl}...`);

    try {
      activeWs = new WebSocket(wsUrl);

      activeWs.onopen = () => {
        appendWsLog('sys', 'WebSocket connected successfully!');
      };

      activeWs.onmessage = (event) => {
        appendWsLog('in', event.data);
      };

      activeWs.onclose = (event) => {
        appendWsLog('sys', `WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
        activeWs = null;
      };

      activeWs.onerror = () => {
        appendWsLog('sys', 'WebSocket error encountered.');
      };
    } catch (err: any) {
      appendWsLog('sys', 'Failed to connect: ' + err.message);
    }
  });

  document.getElementById('btn-ws-disconnect')?.addEventListener('click', () => {
    if (activeWs) {
      activeWs.close();
      activeWs = null;
      appendWsLog('sys', 'Disconnected by user.');
    }
  });

  document.getElementById('btn-ws-ping')?.addEventListener('click', () => {
    if (!activeWs || activeWs.readyState !== WebSocket.OPEN) {
      appendWsLog('sys', 'Cannot send ping: WebSocket is not open. Connect first.');
      return;
    }
    const pingMsg = JSON.stringify({ type: 'ping', timestamp: Date.now() });
    activeWs.send(pingMsg);
    appendWsLog('out', pingMsg);
  });

  document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
    wsLogs = [];
    refreshUI();
  });
}

function appendWsLog(direction: 'in' | 'out' | 'sys', text: string) {
  const time = new Date().toLocaleTimeString();
  wsLogs.push({ time, direction, text });
  if (wsLogs.length > 50) wsLogs.shift();

  const term = document.getElementById('ws-terminal');
  if (term) {
    const row = document.createElement('div');
    row.className = 'flex items-start gap-2';
    row.innerHTML = `
      <span class="text-slate-500 select-none">[${time}]</span>
      <span class="font-bold ${
        direction === 'in' ? 'text-emerald-400' : direction === 'out' ? 'text-cyan-400' : 'text-amber-400'
      }">${direction === 'in' ? '▼ IN' : direction === 'out' ? '▲ OUT' : '● SYS'}</span>
      <span class="break-all">${text}</span>
    `;
    term.appendChild(row);
    term.scrollTop = term.scrollHeight;
  }
}

async function refreshUI() {
  const status = await fetchStatus();
  renderConsole(status);
}

// Initial Boot
refreshUI();
// Polling for metrics
setInterval(async () => {
  if (activeTab === 'overview') {
    const status = await fetchStatus();
    renderConsole(status);
  }
}, 10000);
