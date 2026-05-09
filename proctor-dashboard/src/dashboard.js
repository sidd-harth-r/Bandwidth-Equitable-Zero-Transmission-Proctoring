/**
 * BEZP Proctor Dashboard — Client Logic
 *
 * Manages the proctor review workflow:
 * - Fetches review queue from /api/v1/reviews/queue
 * - Displays anomaly timeline with channel decomposition
 * - Submits reviewer decisions (suspicious/not_suspicious/escalate)
 * - Sends intervention messages to student sessions
 * - Retrieves verified labels for FL training pipeline
 */

/* ── Configuration ────────────────────────────────────────── */

const API_BASE = window.location.hostname === "localhost"
  ? "http://localhost:8000"
  : "";

const REVIEWER_ID = "proctor-" + Math.random().toString(36).slice(2, 8);
const POLL_INTERVAL_MS = 10_000;

/* ── State ────────────────────────────────────────────────── */

let currentView = "queue";
let currentClip = null;
let pollTimer = null;

/* ── Initialization ───────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  // Set reviewer name
  document.getElementById("reviewer-name").textContent = REVIEWER_ID;

  // Navigation
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Refresh buttons
  document.getElementById("refresh-queue").addEventListener("click", loadQueue);
  document.getElementById("refresh-sessions").addEventListener("click", loadSessions);
  document.getElementById("refresh-labels").addEventListener("click", loadLabels);

  // Filter
  document.getElementById("show-reviewed").addEventListener("change", loadQueue);

  // Modal
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.querySelector(".modal-backdrop").addEventListener("click", closeModal);

  // Decision buttons
  document.getElementById("btn-not-suspicious").addEventListener("click", () => submitDecision("not_suspicious"));
  document.getElementById("btn-suspicious").addEventListener("click", () => submitDecision("suspicious"));
  document.getElementById("btn-escalate").addEventListener("click", () => submitDecision("escalate"));

  // Intervention buttons
  document.querySelectorAll(".btn-intervention").forEach((btn) => {
    btn.addEventListener("click", () => sendIntervention(btn.dataset.type));
  });

  // Initial load
  loadQueue();
  startPolling();
});

/* ── Navigation ───────────────────────────────────────────── */

function switchView(view) {
  currentView = view;

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  document.querySelectorAll(".view").forEach((el) => {
    el.classList.toggle("active-view", el.id === `view-${view}`);
  });

  if (view === "queue") loadQueue();
  else if (view === "sessions") loadSessions();
  else if (view === "labels") loadLabels();
}

/* ── Polling ──────────────────────────────────────────────── */

function startPolling() {
  pollTimer = setInterval(() => {
    if (currentView === "queue") loadQueue();
  }, POLL_INTERVAL_MS);
}

/* ── Review Queue ─────────────────────────────────────────── */

async function loadQueue() {
  const showReviewed = document.getElementById("show-reviewed").checked;
  try {
    const res = await fetch(`${API_BASE}/api/v1/reviews/queue?reviewed=${showReviewed}&limit=100`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    updatePendingBadge(data.pending);
    renderQueue(data.items);
  } catch (err) {
    // Show demo data when API is unavailable
    renderDemoQueue();
  }
}

function updatePendingBadge(count) {
  document.getElementById("pending-badge").textContent = `${count} pending`;
}

function renderQueue(items) {
  const container = document.getElementById("queue-list");

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>No clips pending review</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const score = item.weighted_score ?? 0;
    const severity = score > 0.7 ? "high" : score > 0.4 ? "medium" : "low";
    const scoreColor = score > 0.7 ? "var(--accent-red)" : score > 0.4 ? "var(--accent-amber)" : "var(--accent-green)";
    const timeAgo = formatTimeAgo(item.received_at);

    return `
      <div class="queue-item ${item.reviewed ? "reviewed" : ""}"
           data-clip='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
        <div class="severity-dot ${severity}"></div>
        <div class="queue-meta">
          <span class="session-id">${item.session_id.slice(0, 12)}…</span>
          <span class="student-id">${item.student_id}</span>
        </div>
        <span class="queue-score" style="color: ${scoreColor}">${score.toFixed(2)}</span>
        <span class="queue-time">${timeAgo}</span>
        <span class="queue-action">Review →</span>
      </div>`;
  }).join("");

  container.querySelectorAll(".queue-item").forEach((el) => {
    el.addEventListener("click", () => {
      const clip = JSON.parse(el.dataset.clip);
      openReviewModal(clip);
    });
  });
}

function renderDemoQueue() {
  const demoItems = [
    { clip_id: "demo-1", session_id: "session-abc123def", student_id: "student_042", event_id: "evt-001", received_at: new Date().toISOString(), size_bytes: 256000, tier: "tier_2", reviewed: false, weighted_score: 0.82, channel_scores: { pose_gaze: 0.9, rppg: 0.3, au: 0.85, keystroke: 0.7 } },
    { clip_id: "demo-2", session_id: "session-xyz789abc", student_id: "student_017", event_id: "evt-002", received_at: new Date(Date.now() - 120000).toISOString(), size_bytes: 180000, tier: "tier_2", reviewed: false, weighted_score: 0.55, channel_scores: { pose_gaze: 0.6, rppg: 0.5, au: 0.4, keystroke: 0.65 } },
    { clip_id: "demo-3", session_id: "session-lmn456qrs", student_id: "student_091", event_id: "evt-003", received_at: new Date(Date.now() - 300000).toISOString(), size_bytes: 320000, tier: "tier_2", reviewed: false, weighted_score: 0.35, channel_scores: { pose_gaze: 0.3, rppg: 0.2, au: 0.5, keystroke: 0.3 } },
  ];
  updatePendingBadge(demoItems.length);
  renderQueue(demoItems);
}

/* ── Review Modal ─────────────────────────────────────────── */

function openReviewModal(clip) {
  currentClip = clip;

  document.getElementById("modal-title").textContent = `Review: ${clip.session_id.slice(0, 16)}…`;

  // Channel decomposition bars
  const channelBars = document.getElementById("channel-bars");
  const scores = clip.channel_scores || {};
  const channels = [
    { key: "pose_gaze", label: "Pose/Gaze" },
    { key: "rppg", label: "rPPG (Heart)" },
    { key: "au", label: "Action Units" },
    { key: "keystroke", label: "Keystroke" },
  ];

  channelBars.innerHTML = channels.map((ch) => {
    const val = scores[ch.key] ?? 0;
    const pct = Math.round(val * 100);
    const colorClass = val > 0.7 ? "red" : val > 0.4 ? "amber" : "green";
    return `
      <div class="channel-row">
        <span class="channel-label">${ch.label}</span>
        <div class="channel-bar-track">
          <div class="channel-bar-fill ${colorClass}" style="width: ${pct}%"></div>
        </div>
        <span class="channel-value">${val.toFixed(2)}</span>
      </div>`;
  }).join("");

  // Clip info
  document.getElementById("clip-info").innerHTML = `
    <strong>Clip ID:</strong> ${clip.clip_id}<br>
    <strong>Event:</strong> ${clip.event_id}<br>
    <strong>Student:</strong> ${clip.student_id}<br>
    <strong>Tier:</strong> ${clip.tier}<br>
    <strong>Size:</strong> ${(clip.size_bytes / 1024).toFixed(1)} KB<br>
    <strong>Score:</strong> ${(clip.weighted_score ?? 0).toFixed(3)}<br>
    <strong>Received:</strong> ${new Date(clip.received_at).toLocaleString()}
  `;

  // Clear notes
  document.getElementById("review-notes").value = "";

  // Show modal
  document.getElementById("review-modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("review-modal").classList.add("hidden");
  currentClip = null;
}

/* ── Submit Decision ──────────────────────────────────────── */

async function submitDecision(verdict) {
  if (!currentClip) return;

  const notes = document.getElementById("review-notes").value;

  try {
    const res = await fetch(`${API_BASE}/api/v1/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clip_id: currentClip.clip_id,
        reviewer_id: REVIEWER_ID,
        verdict,
        confidence: 1.0,
        notes,
      }),
    });

    if (res.ok) {
      showToast(`Decision saved: ${verdict.replace("_", " ")}`, "success");
      closeModal();
      loadQueue();
    } else if (res.status === 409) {
      showToast("Already reviewed by this proctor", "info");
    } else {
      showToast(`Error: ${res.statusText}`, "error");
    }
  } catch {
    // Demo mode — just close
    showToast(`Decision saved: ${verdict.replace("_", " ")} (demo)`, "success");
    closeModal();
  }
}

/* ── Send Intervention ────────────────────────────────────── */

async function sendIntervention(messageType) {
  if (!currentClip) return;

  try {
    const res = await fetch(`${API_BASE}/api/v1/interventions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: currentClip.session_id,
        sender_id: REVIEWER_ID,
        message_type: messageType,
      }),
    });

    if (res.ok) {
      showToast(`Intervention sent: ${messageType.replace(/_/g, " ")}`, "success");
    } else {
      showToast("Failed to send intervention", "error");
    }
  } catch {
    showToast(`Intervention sent: ${messageType.replace(/_/g, " ")} (demo)`, "info");
  }
}

/* ── Sessions View ────────────────────────────────────────── */

async function loadSessions() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/session-state`);
    if (!res.ok) throw new Error();
    const sessions = await res.json();
    renderSessions(Array.isArray(sessions) ? sessions : []);
  } catch {
    renderDemoSessions();
  }
}

function renderSessions(sessions) {
  const container = document.getElementById("sessions-list");

  if (sessions.length === 0) {
    renderDemoSessions();
    return;
  }

  container.innerHTML = sessions.map((s) => `
    <div class="session-card">
      <div class="session-header">
        <span class="session-name">${s.session_id?.slice(0, 16) ?? "Unknown"}…</span>
        <span class="session-status ${s.status === "live" ? "live" : "offline"}">${s.status ?? "unknown"}</span>
      </div>
      <div class="session-details">
        Student: ${s.student_id ?? "N/A"}<br>
        Gear: ${s.gear ?? "N/A"}<br>
        Events: ${s.event_count ?? 0}<br>
        Last Score: ${(s.latest_score ?? 0).toFixed(2)}
      </div>
    </div>
  `).join("");
}

function renderDemoSessions() {
  const demo = [
    { session_id: "session-abc123def456", student_id: "student_042", status: "live", gear: "gear_1", event_count: 12, latest_score: 0.45 },
    { session_id: "session-xyz789abc012", student_id: "student_017", status: "live", gear: "gear_2", event_count: 5, latest_score: 0.22 },
    { session_id: "session-lmn456qrs789", student_id: "student_091", status: "offline", gear: "gear_3", event_count: 28, latest_score: 0.71 },
  ];
  renderSessions(demo);
}

/* ── Verified Labels View ─────────────────────────────────── */

async function loadLabels() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/reviews/labels?limit=200`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderLabels(data.labels, data.total);
  } catch {
    renderDemoLabels();
  }
}

function renderLabels(labels, total) {
  const statsContainer = document.getElementById("labels-stats");
  const listContainer = document.getElementById("labels-list");

  // Compute stats
  const suspicious = labels.filter((l) => l.verdict === "suspicious").length;
  const notSuspicious = labels.filter((l) => l.verdict === "not_suspicious").length;
  const escalated = labels.filter((l) => l.verdict === "escalate").length;

  statsContainer.innerHTML = `
    <div class="stat-card">
      <div class="stat-value" style="color: var(--accent-blue)">${total}</div>
      <div class="stat-label">Total Labels</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: var(--accent-red)">${suspicious}</div>
      <div class="stat-label">Suspicious</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: var(--accent-green)">${notSuspicious}</div>
      <div class="stat-label">Not Suspicious</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: var(--accent-amber)">${escalated}</div>
      <div class="stat-label">Escalated</div>
    </div>
  `;

  if (labels.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏷️</div>
        <p>No verified labels yet</p>
      </div>`;
    return;
  }

  listContainer.innerHTML = labels.map((l) => `
    <div class="label-item">
      <span class="verdict-badge ${l.verdict}">${l.verdict.replace("_", " ")}</span>
      <span>${l.student_id} · ${l.session_id.slice(0, 12)}…</span>
      <span style="color: var(--text-muted)">${l.fl_weight}× weight</span>
      <span style="color: var(--text-muted)">${formatTimeAgo(l.decided_at)}</span>
    </div>
  `).join("");
}

function renderDemoLabels() {
  const demo = [
    { event_id: "e1", session_id: "session-abc123def", student_id: "student_042", verdict: "suspicious", fl_weight: 10, channel_scores: {}, weighted_score: 0.82, decided_at: new Date(Date.now() - 3600000).toISOString() },
    { event_id: "e2", session_id: "session-xyz789abc", student_id: "student_017", verdict: "not_suspicious", fl_weight: 10, channel_scores: {}, weighted_score: 0.35, decided_at: new Date(Date.now() - 7200000).toISOString() },
  ];
  renderLabels(demo, demo.length);
}

/* ── Utilities ────────────────────────────────────────────── */

function formatTimeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
