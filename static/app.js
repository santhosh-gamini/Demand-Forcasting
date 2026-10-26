/* ===================================================================
   DEMANDFORECAST AI - Core Frontend Logic & Application Engine
   =================================================================== */

// Global State Store
const STATE = {
  token: localStorage.getItem("df_token") || sessionStorage.getItem("df_token") || "",
  dataset: null,
  processed: null,
  courses: [],
  models: {},
  history: [],
  activePage: "overview"
};

const MODEL_INFO = {
  rf: {
    name: "Random Forest Regressor",
    short: "Random Forest",
    desc: "Ensemble of 300 decision trees utilizing bootstrap aggregation and feature bagging.",
    params: "n_estimators=300, random_state=42, n_jobs=-1",
    tag: "Bagging Ensemble"
  },
  gb: {
    name: "Gradient Boosting Regressor",
    short: "Gradient Boosting",
    desc: "Sequential ensemble building stage-wise regression trees to minimize squared error loss.",
    params: "n_estimators=300, learning_rate=0.05, random_state=42",
    tag: "Boosting Ensemble"
  },
  lstm: {
    name: "LSTM Deep Neural Network",
    short: "LSTM Forecasting",
    desc: "Recurrent neural network with memory cells designed to capture long-term sequential dependencies.",
    params: "Input(1, 9), LSTM(48 units), Dense(1), Adam optimizer",
    tag: "Recurrent Neural Network"
  },
  xgb: {
    name: "XGBoost Regressor",
    short: "XGBoost",
    desc: "Extreme Gradient Boosting with regularized objective function, depth-5 trees, and subsampling.",
    params: "n_estimators=500, learning_rate=0.05, max_depth=5, subsample=0.9",
    tag: "Gradient Boosted Trees"
  }
};

const CHARTS = {};

// Helper: Query Selector
const $ = (id) => document.getElementById(id);

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  checkExistingAuth();
});

// Toast Notification System
function showToast(message, type = "info") {
  const container = $("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast-message ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Global API Request Client
async function api(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (STATE.token) {
    headers["Authorization"] = STATE.token;
  }

  try {
    const response = await fetch(`/api/${path}`, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.detail || `Request failed (${response.status})`;
      showToast(errorMsg, "error");
      throw new Error(errorMsg);
    }
    return data;
  } catch (err) {
    console.error(`API Error [/api/${path}]:`, err);
    throw err;
  }
}

// Chart.js Manager
function renderChart(canvasId, config) {
  const canvas = $(canvasId);
  if (!canvas) return null;

  if (CHARTS[canvasId]) {
    CHARTS[canvasId].destroy();
  }

  // Global styling defaults for clean corporate look
  config.options = config.options || {};
  config.options.responsive = true;
  config.options.maintainAspectRatio = false;
  config.options.plugins = config.options.plugins || {};
  config.options.plugins.legend = config.options.plugins.legend || {
    labels: { font: { family: "Inter", size: 12 }, boxWidth: 12, usePointStyle: true }
  };

  CHARTS[canvasId] = new Chart(canvas, config);
  return CHARTS[canvasId];
}

// ===================================================================
// AUTHENTICATION FLOW
// ===================================================================

function setupEventListeners() {
  // Login form submit
  const loginForm = $("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  // Password visibility toggle
  const pwdToggle = $("toggle-password-btn");
  if (pwdToggle) {
    pwdToggle.addEventListener("click", () => {
      const pwdInput = $("login-password");
      if (pwdInput.type === "password") {
        pwdInput.type = "text";
        pwdToggle.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
      } else {
        pwdInput.type = "password";
        pwdToggle.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
      }
    });
  }

  // Mobile menu drawer
  const menuBtn = $("mobile-menu-btn");
  const sidebar = $("sidebar");
  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  // Navigation Links
  document.querySelectorAll(".sidebar-link[data-page]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(link.dataset.page);
      if (sidebar) sidebar.classList.remove("open");
    });
  });

  // Logout Buttons
  const logoutBtn = $("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }

  // Drag and Drop Dataset Upload
  const dropzone = $("csv-dropzone");
  const fileInput = $("dataset-file-input");
  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files.length) {
        uploadDatasetFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files.length) {
        uploadDatasetFile(fileInput.files[0]);
      }
    });
  }

  // Global Ctrl + K search shortcut
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const s = $("topbar-quick-search");
      if (s) {
        s.focus();
        s.select();
      }
    }
  });
}

async function checkExistingAuth() {
  if (STATE.token) {
    try {
      await syncSessionStatus();
      showDashboardView();
      navigateTo("overview");
      showToast("Session restored", "success");
    } catch {
      handleLogout();
    }
  } else {
    showLoginView();
  }
}

async function handleLogin(e) {
  if (e) e.preventDefault();
  const username = $("login-username").value.trim();
  const password = $("login-password").value.trim();
  const errorBanner = $("login-error-banner");
  const submitBtn = $("btn-submit-login");

  if (!username || !password) {
    errorBanner.textContent = "Please enter both username and password.";
    errorBanner.classList.add("show");
    return;
  }

  errorBanner.classList.remove("show");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<div class="spinner"></div> Authenticating...`;

  try {
    const data = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!data.ok) {
      errorBanner.textContent = "Invalid credentials. Please verify username and password.";
      errorBanner.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Sign In</span> <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
      return;
    }

    const res = await data.json();
    STATE.token = res.token;

    if ($("remember-me-checkbox") && $("remember-me-checkbox").checked) {
      localStorage.setItem("df_token", STATE.token);
    } else {
      sessionStorage.setItem("df_token", STATE.token);
    }

    showDashboardView();
    await syncSessionStatus();
    navigateTo("overview");
    showToast("Welcome to DemandForecast AI!", "success");
  } catch (err) {
    errorBanner.textContent = "Unable to connect to server. Ensure FastAPI is running.";
    errorBanner.classList.add("show");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Sign In</span> <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
  }
}

function handleLogout() {
  STATE.token = "";
  localStorage.removeItem("df_token");
  sessionStorage.removeItem("df_token");
  showLoginView();
  showToast("Logged out successfully", "info");
}

function showLoginView() {
  $("login-screen").style.display = "flex";
  $("app-container").classList.remove("active");
}

function showDashboardView() {
  $("login-screen").style.display = "none";
  $("app-container").classList.add("active");
}

// ===================================================================
// NAVIGATION & PAGE ROUTING
// ===================================================================

const PAGE_NAMES = {
  overview: "Forecasting Overview",
  dataset: "Dataset Management",
  eda: "Data Exploration & EDA",
  compare: "Model Performance Comparison",
  rf: "Random Forest Regressor",
  gb: "Gradient Boosting Regressor",
  lstm: "LSTM Neural Network",
  xgb: "XGBoost Regressor",
  forecast: "Course Demand Forecaster",
  history: "Forecast Audit History"
};

function navigateTo(pageId) {
  STATE.activePage = pageId;

  // Toggle page visibility
  document.querySelectorAll(".dashboard-page").forEach((p) => {
    p.classList.toggle("active", p.id === `page-${pageId}`);
  });

  // Toggle sidebar active link
  document.querySelectorAll(".sidebar-link[data-page]").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === pageId);
  });

  // Update Topbar
  if ($("topbar-page-title")) {
    $("topbar-page-title").textContent = PAGE_NAMES[pageId] || "Dashboard";
  }
  if ($("topbar-breadcrumb-current")) {
    $("topbar-breadcrumb-current").textContent = PAGE_NAMES[pageId] || "Dashboard";
  }

  // Trigger page-specific data loader
  if (pageId === "forecast") loadCoursesDropdown();
  if (pageId === "history") loadForecastHistory();
  if (pageId === "compare") refreshComparisonTable();
  if (["rf", "gb", "lstm", "xgb"].includes(pageId)) loadModelPage(pageId);
}

// ===================================================================
// SESSION STATUS SYNCHRONIZATION
// ===================================================================

async function syncSessionStatus() {
  try {
    const status = await api("status");
    updateGlobalStatusBadges(status);
    updateWorkflowStepper(status);

    if (status.dataset_loaded && !STATE.dataset) {
      // Re-fetch courses list
      loadCoursesDropdown();
    }
  } catch (err) {
    console.warn("Could not sync session status:", err);
  }
}

function updateGlobalStatusBadges(status) {
  const dsBadge = $("topbar-status-dataset");
  const splitBadge = $("topbar-status-split");
  const modelBadge = $("topbar-status-model");

  if (dsBadge) {
    if (status.dataset_loaded) {
      dsBadge.className = "top-status-pill success";
      dsBadge.innerHTML = `<span class="status-dot"></span> Dataset: ${status.rows} Rows (${status.courses} Courses)`;
    } else {
      dsBadge.className = "top-status-pill";
      dsBadge.innerHTML = `<span class="status-dot"></span> Dataset: Not Loaded`;
    }
  }

  if (splitBadge) {
    if (status.split_ready) {
      splitBadge.className = "top-status-pill success hide-mobile";
      splitBadge.innerHTML = `<span class="status-dot"></span> Split: 80/20 (${status.train_rows}/${status.test_rows})`;
    } else {
      splitBadge.className = "top-status-pill hide-mobile";
      splitBadge.innerHTML = `<span class="status-dot"></span> Split: Pending`;
    }
  }

  if (modelBadge) {
    const trained = status.trained_models || [];
    if (trained.length > 0) {
      modelBadge.className = "top-status-pill primary";
      modelBadge.innerHTML = `<span class="status-dot"></span> Trained: ${trained.length}/4 Models`;
    } else {
      modelBadge.className = "top-status-pill";
      modelBadge.innerHTML = `<span class="status-dot"></span> Models: Untrained`;
    }
  }

  // Overview KPIs
  if ($("kpi-total-rows")) $("kpi-total-rows").textContent = status.rows ? status.rows.toLocaleString() : "—";
  if ($("kpi-total-courses")) $("kpi-total-courses").textContent = status.courses || "—";
  if ($("kpi-history-count")) $("kpi-history-count").textContent = status.history_count || "0";

  // Compute best R2
  const metrics = status.metrics || {};
  const entries = Object.entries(metrics);
  if (entries.length > 0 && $("kpi-best-r2")) {
    const best = entries.sort((a, b) => b[1].r2 - a[1].r2)[0];
    $("kpi-best-r2").textContent = `${best[1].r2} (${MODEL_INFO[best[0]].short})`;
  } else if ($("kpi-best-r2")) {
    $("kpi-best-r2").textContent = "—";
  }
}

function updateWorkflowStepper(status) {
  const setStep = (id, done, isCurrent) => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle("completed", done);
    el.classList.toggle("current", isCurrent);
    const icon = el.querySelector(".step-status-icon");
    if (icon) {
      icon.innerHTML = done
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#16A34A" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>`;
    }
  };

  const hasData = status.dataset_loaded;
  const hasSplit = status.split_ready;
  const hasModels = (status.trained_models || []).length > 0;
  const allModels = (status.trained_models || []).length === 4;
  const hasForecast = (status.history_count || 0) > 0;

  setStep("step-1", hasData, !hasData);
  setStep("step-2", hasSplit, hasData && !hasSplit);
  setStep("step-3", hasModels, hasSplit && !hasModels);
  setStep("step-4", allModels, hasModels && !allModels);
  setStep("step-5", hasForecast, allModels && !hasForecast);
  setStep("step-6", hasForecast, false);
}

// ===================================================================
// MODULE 2: DATASET MANAGEMENT
// ===================================================================

async function loadSyntheticDataset() {
  const btn = $("btn-load-synthetic");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner dark"></div> Loading sample data...`;
  }

  try {
    const data = await api("dataset/synthetic", { method: "POST" });
    displayDatasetInfo(data);
    showToast(`Sample dataset loaded: ${data.rows} records across ${data.courses} courses.`, "success");
    await syncSessionStatus();
  } catch (err) {
    showToast("Failed to generate sample dataset.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg> Use Sample Dataset (Synthetic)`;
    }
  }
}

async function uploadDatasetFile(file) {
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);

  const dropzone = $("csv-dropzone");
  if (dropzone) {
    dropzone.innerHTML = `<div class="spinner dark" style="width:32px;height:32px;margin-bottom:12px"></div><div class="dropzone-title">Uploading & validating ${file.name}...</div>`;
  }

  try {
    const data = await api("dataset/upload", { method: "POST", body: fd });
    displayDatasetInfo(data);
    showToast(`Dataset uploaded: ${data.rows} records validated.`, "success");
    await syncSessionStatus();
  } catch (err) {
    showToast("Dataset upload failed. Ensure CSV has required columns.", "error");
  } finally {
    if (dropzone) {
      dropzone.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <div class="dropzone-title">Drag & drop your course CSV here or click to browse</div>
        <div class="dropzone-desc">Required columns: course, dept, year, term, t, capacity, enrollment, sections</div>
      `;
    }
  }
}

function displayDatasetInfo(d) {
  STATE.dataset = d;

  // Metadata cards
  if ($("meta-ds-rows")) $("meta-ds-rows").textContent = d.rows;
  if ($("meta-ds-courses")) $("meta-ds-courses").textContent = d.courses;
  if ($("meta-ds-depts")) $("meta-ds-depts").textContent = d.depts ? d.depts.join(", ") : Object.keys(d.by_dept).join(", ");
  if ($("meta-ds-years")) $("meta-ds-years").textContent = d.years ? `${d.years[0]} – ${d.years[1]}` : "2016 – 2025";

  // Preview table
  const tbody = $("dataset-preview-tbody");
  if (tbody && d.preview && d.preview.length) {
    tbody.innerHTML = d.preview
      .map(
        (r) => `
        <tr>
          <td><strong style="color:var(--primary-blue)">${r.course}</strong></td>
          <td><span class="pill-badge dept">${r.dept}</span></td>
          <td>${r.year}</td>
          <td><span class="pill-badge term-${r.term.toLowerCase()}">${r.term}</span></td>
          <td>${r.t}</td>
          <td>${r.capacity}</td>
          <td>${r.enrollment}</td>
          <td><strong>${r.sections}</strong></td>
        </tr>
      `
      )
      .join("");
  }

  // Render Charts in EDA and Overview
  renderEDACharts(d);
  renderOverviewCharts(d);
}

async function processDataset() {
  const btn = $("btn-process-data");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Splitting & Normalizing...`;
  }

  try {
    const res = await api("process", { method: "POST" });
    STATE.processed = res;
    showToast(`Preprocessed: ${res.train} training rows, ${res.test} test rows (80/20 Split).`, "success");
    await syncSessionStatus();
  } catch (err) {
    showToast("Processing failed. Please ensure a dataset is loaded first.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6"/></svg> Shuffle, Normalize & Split (80/20)`;
    }
  }
}

// ===================================================================
// MODULE 3: DATA EXPLORATION (EDA) & OVERVIEW VISUALIZATIONS
// ===================================================================

function renderEDACharts(d) {
  if (!d) return;

  // Chart 1: Average sections by term
  const termLabels = Object.keys(d.by_term);
  const termValues = Object.values(d.by_term);

  renderChart("chart-eda-term", {
    type: "bar",
    data: {
      labels: termLabels,
      datasets: [
        {
          label: "Avg Sections Required",
          data: termValues,
          backgroundColor: ["#10B981", "#F59E0B", "#2563EB"],
          borderRadius: 8,
          borderSkipped: false
        }
      ]
    },
    options: {
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "#F1F5F9" },
          title: { display: true, text: "Sections per Course" }
        },
        x: { grid: { display: false } }
      }
    }
  });

  // Chart 2: Average sections by department
  const deptLabels = Object.keys(d.by_dept);
  const deptValues = Object.values(d.by_dept);

  renderChart("chart-eda-dept", {
    type: "bar",
    data: {
      labels: deptLabels,
      datasets: [
        {
          label: "Avg Sections per Course",
          data: deptValues,
          backgroundColor: "#2563EB",
          borderRadius: 8,
          borderSkipped: false
        }
      ]
    },
    options: {
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "#F1F5F9" },
          title: { display: true, text: "Sections" }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderOverviewCharts(d) {
  if (!d) return;

  // Chart 1: Seasonal Section Demand Trajectory
  const termLabels = Object.keys(d.by_term || { "Spring": 0, "Summer": 0, "Fall": 0 });
  const termValues = Object.values(d.by_term || { "Spring": 0, "Summer": 0, "Fall": 0 });

  renderChart("chart-overview-trends", {
    type: "line",
    data: {
      labels: termLabels,
      datasets: [
        {
          label: "Avg Sections Required",
          data: termValues,
          borderColor: "#2563EB",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          fill: true,
          tension: 0.35,
          pointRadius: 6,
          pointBackgroundColor: "#2563EB",
          pointHoverRadius: 8
        }
      ]
    },
    options: {
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "#F1F5F9" },
          title: { display: true, text: "Sections Needed" }
        },
        x: { grid: { display: false } }
      }
    }
  });

  // Chart 2: Department Workload Allocation
  const deptLabels = Object.keys(d.by_dept || {});
  const deptValues = Object.values(d.by_dept || {});

  renderChart("chart-overview-depts", {
    type: "bar",
    data: {
      labels: deptLabels,
      datasets: [
        {
          label: "Avg Sections by Faculty",
          data: deptValues,
          backgroundColor: [
            "#2563EB",
            "#4F46E5",
            "#06B6D4",
            "#10B981",
            "#F59E0B",
            "#8B5CF6"
          ],
          borderRadius: 8
        }
      ]
    },
    options: {
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "#F1F5F9" },
          title: { display: true, text: "Sections Load" }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function handleGlobalSearch(q) {
  if (!q) return;
  const term = q.trim().toLowerCase();

  const matchMap = {
    "over": "overview",
    "data": "dataset",
    "eda": "eda",
    "expl": "eda",
    "comp": "compare",
    "bench": "compare",
    "rf": "rf",
    "forest": "rf",
    "gb": "gb",
    "boost": "gb",
    "lstm": "lstm",
    "neural": "lstm",
    "xgb": "xgb",
    "fore": "forecast",
    "hist": "history",
    "audit": "history"
  };

  if (matchMap[term]) {
    navigateTo(matchMap[term]);
    return;
  }

  if (STATE.courses && STATE.courses.length) {
    const courseMatch = STATE.courses.find(c => c.toLowerCase() === term || c.toLowerCase().includes(term));
    if (courseMatch) {
      navigateTo("forecast");
      const sel = $("forecast-course-select");
      if (sel) {
        sel.value = courseMatch;
        showToast(`Jumped to Forecaster for ${courseMatch}`, "info");
      }
    }
  }
}

// ===================================================================
// MODULES 4-8: MACHINE LEARNING TRAINING & EVALUATION
// ===================================================================

async function trainSingleModel(modelKey) {
  const btn = $(`btn-train-${modelKey}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Training ${MODEL_INFO[modelKey].short}...`;
  }

  showToast(`Training ${MODEL_INFO[modelKey].name}...`, "info");

  try {
    const res = await api(`train/${modelKey}`, { method: "POST" });
    STATE.models[modelKey] = res;

    // Update Model Metric Displays
    updateModelView(modelKey, res);
    showToast(`${MODEL_INFO[modelKey].short} evaluated: R² = ${res.r2}, RMSE = ${res.rmse}`, "success");
    await syncSessionStatus();
    return res;
  } catch (err) {
    showToast(`Failed to train ${MODEL_INFO[modelKey].short}. Ensure data is processed.`, "error");
    throw err;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Train & Evaluate`;
    }
  }
}

async function trainAllModels() {
  const btn = $("btn-train-all-models");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Training Pipeline in Progress...`;
  }

  try {
    for (const key of ["rf", "gb", "lstm", "xgb"]) {
      await trainSingleModel(key);
    }
    await refreshComparisonTable();
    showToast("All 4 models successfully trained & evaluated!", "success");
  } catch (err) {
    showToast("Model pipeline training halted. Check data preprocessing status.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Train All Four Models`;
    }
  }
}

function updateModelView(key, res) {
  // Update KPI metric badges
  if ($(`val-r2-${key}`)) $(`val-r2-${key}`).textContent = res.r2;
  if ($(`val-rmse-${key}`)) $(`val-rmse-${key}`).textContent = res.rmse;

  // LSTM Engine Notification Transparency Check
  if (key === "lstm") {
    const banner = $("lstm-engine-banner");
    if (banner) {
      if (res.is_fallback) {
        banner.className = "engine-notice-box";
        banner.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div class="engine-notice-text">
            <strong>Neural Network Fallback Mode Active:</strong> ${res.engine_name}.<br>
            TensorFlow is not installed in the local environment, so Scikit-Learn Multi-Layer Perceptron Regressor was automatically utilized with equivalent neural architecture (hidden layers: 64, 32 units).
          </div>
        `;
      } else {
        banner.className = "engine-notice-box";
        banner.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <div class="engine-notice-text">
            <strong>Deep Learning Mode:</strong> Executing on genuine ${res.engine_name} with recurrent LSTM memory cells and Adam optimizer.
          </div>
        `;
      }
    }
  }

  // Render True vs Predicted Chart
  const sampleIndices = res.true.map((_, i) => `#${i + 1}`);

  renderChart(`chart-eval-${key}`, {
    type: "line",
    data: {
      labels: sampleIndices,
      datasets: [
        {
          label: "Ground Truth (Actual Sections)",
          data: res.true,
          borderColor: "#0F172A",
          backgroundColor: "rgba(15, 23, 42, 0.05)",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2
        },
        {
          label: `${MODEL_INFO[key].short} Predicted`,
          data: res.pred,
          borderColor: "#06B6D4",
          backgroundColor: "rgba(6, 182, 212, 0.1)",
          borderWidth: 2,
          pointRadius: 2,
          borderDash: [4, 4],
          tension: 0.2
        }
      ]
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} sections`
          }
        }
      },
      scales: {
        y: {
          title: { display: true, text: "Sections Demanded" },
          grid: { color: "#F1F5F9" }
        },
        x: {
          grid: { display: false },
          title: { display: true, text: "Test Split Sample Index" }
        }
      }
    }
  });

  // Sample residual preview table
  const tbody = $(`sample-table-${key}`);
  if (tbody) {
    const rows = res.true.slice(0, 6).map((trueVal, idx) => {
      const predVal = res.pred[idx];
      const diff = Math.abs(trueVal - predVal);
      return `
        <tr>
          <td>Sample #${idx + 1}</td>
          <td><strong>${trueVal}</strong> sections</td>
          <td><strong>${predVal}</strong> sections</td>
          <td><span class="pill-badge ${diff === 0 ? "term-spring" : "dept"}">${diff === 0 ? "Exact Match" : `±${diff} sec`}</span></td>
        </tr>
      `;
    });
    tbody.innerHTML = rows.join("");
  }
}

async function refreshComparisonTable() {
  const metrics = await api("compare");
  const tbody = $("compare-table-tbody");
  if (!tbody) return;

  const entries = Object.entries(metrics);
  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No models evaluated yet. Click "Train All Four Models" to execute pipeline.</td></tr>`;
    return;
  }

  // Find best R2
  const bestKey = entries.sort((a, b) => b[1].r2 - a[1].r2)[0][0];

  tbody.innerHTML = ["rf", "gb", "lstm", "xgb"]
    .map((k) => {
      const m = metrics[k];
      const isBest = k === bestKey;
      if (!m) {
        return `
          <tr>
            <td><strong>${MODEL_INFO[k].name}</strong></td>
            <td>${MODEL_INFO[k].params}</td>
            <td>—</td>
            <td>—</td>
            <td><span class="pill-badge dept">Pending</span></td>
            <td><button class="btn btn-secondary" onclick="navigateTo('${k}')">Train</button></td>
          </tr>
        `;
      }
      return `
        <tr style="${isBest ? "background-color:rgba(37,99,235,0.03)" : ""}">
          <td>
            <strong>${MODEL_INFO[k].name}</strong>
            ${isBest ? `<span class="pill-badge best-model" style="margin-left:8px">★ Best Performer</span>` : ""}
            ${m.is_fallback ? `<br><small style="color:var(--text-muted)">Fallback: MLP Regressor</small>` : ""}
          </td>
          <td><code>${MODEL_INFO[k].params}</code></td>
          <td><strong style="color:${isBest ? "var(--success)" : "var(--primary-blue)"};font-size:15px">${m.r2}</strong></td>
          <td><strong>${m.rmse}</strong></td>
          <td><span class="pill-badge term-spring">Trained</span></td>
          <td><button class="btn btn-outline-blue" onclick="navigateTo('${k}')">Inspect</button></td>
        </tr>
      `;
    })
    .join("");

  // Update comparison bar chart
  const trainedKeys = Object.keys(metrics);
  const chartLabels = trainedKeys.map((k) => MODEL_INFO[k].short);
  const r2Data = trainedKeys.map((k) => metrics[k].r2);
  const rmseData = trainedKeys.map((k) => metrics[k].rmse);

  renderChart("chart-models-comparison", {
    type: "bar",
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: "R² Accuracy Score (Higher is Better)",
          data: r2Data,
          backgroundColor: "#2563EB",
          borderRadius: 6
        },
        {
          label: "RMSE Error (Lower is Better)",
          data: rmseData,
          backgroundColor: "#F59E0B",
          borderRadius: 6
        }
      ]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "#F1F5F9" }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function loadModelPage(key) {
  if (STATE.models[key]) {
    updateModelView(key, STATE.models[key]);
  }
}

// ===================================================================
// MODULE 9: COURSE DEMAND FORECASTING (XGBOOST)
// ===================================================================

async function loadCoursesDropdown() {
  const select = $("forecast-course-select");
  if (!select) return;

  try {
    const list = await api("courses");
    STATE.courses = list;
    if (list.length) {
      select.innerHTML = list.map((c) => `<option value="${c}">${c}</option>`).join("");
    } else {
      select.innerHTML = `<option value="">No courses available (Load dataset first)</option>`;
    }
  } catch (err) {
    select.innerHTML = `<option value="">Failed to load course catalog</option>`;
  }
}

function setHorizon(val) {
  const inp = $("forecast-horizon-input");
  if (inp) inp.value = val;
}

async function generateForecast() {
  const course = $("forecast-course-select").value;
  const horizon = parseInt($("forecast-horizon-input").value, 10) || 3;
  const btn = $("btn-run-forecast");

  if (!course) {
    showToast("Please select a valid course first.", "error");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Forecasting with XGBoost...`;
  }

  showToast(`Generating ${horizon}-semester forecast for ${course}...`, "info");

  try {
    const data = await api("forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course, horizon })
    });

    displayForecastResult(data);
    showToast(`Forecast complete for ${course}: ${data.forecast.length} semesters projected.`, "success");
    await syncSessionStatus();
  } catch (err) {
    showToast("Forecasting requires XGBoost to be trained first.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> Generate Demand Forecast`;
    }
  }
}

function displayForecastResult(r) {
  // Historical vs Forecast Labels and Data
  const histLabels = r.history.map((h) => `Term t-${r.history.length - h.t}`);
  const fcLabels = r.forecast.map((f) => f.semester);

  const histValues = r.history.map((h) => h.sections);
  const fcValues = r.forecast.map((f) => f.sections);

  // Render Dual-Series Chart
  renderChart("chart-forecast-curve", {
    type: "line",
    data: {
      labels: [...histLabels, ...fcLabels],
      datasets: [
        {
          label: "Historical Section Demand",
          data: [...histValues, ...fcLabels.map(() => null)],
          borderColor: "#0F172A",
          backgroundColor: "rgba(15, 23, 42, 0.08)",
          fill: true,
          tension: 0.25,
          pointRadius: 4,
          pointBackgroundColor: "#0F172A"
        },
        {
          label: "XGBoost Projected Sections",
          data: [...histLabels.slice(0, -1).map(() => null), histValues[histValues.length - 1], ...fcValues],
          borderColor: "#06B6D4",
          backgroundColor: "rgba(6, 182, 212, 0.15)",
          borderDash: [6, 4],
          fill: true,
          tension: 0.25,
          pointRadius: 6,
          pointBackgroundColor: "#06B6D4"
        }
      ]
    },
    options: {
      scales: {
        y: {
          title: { display: true, text: "Sections Demanded" },
          grid: { color: "#F1F5F9" },
          beginAtZero: false
        },
        x: { grid: { display: false } }
      }
    }
  });

  // Populate Schedule Table
  const tbody = $("forecast-schedule-tbody");
  if (tbody) {
    tbody.innerHTML = r.forecast
      .map(
        (f) => `
        <tr>
          <td><strong style="color:var(--text-primary)">${f.semester}</strong></td>
          <td><span class="pill-badge ${f.semester.includes("Fall") ? "term-fall" : f.semester.includes("Summer") ? "term-summer" : "term-spring"}">${f.semester.split(" ")[1]}</span></td>
          <td><strong style="font-size:16px;color:var(--primary-blue)">${f.sections}</strong> sections</td>
          <td>~${f.sections * 35} students (est.)</td>
          <td><span class="pill-badge term-spring">Allocated</span></td>
        </tr>
      `
      )
      .join("");
  }
}

// ===================================================================
// MODULE 10: FORECAST HISTORY AUDIT
// ===================================================================

async function loadForecastHistory() {
  const tbody = $("history-table-tbody");
  if (!tbody) return;

  try {
    const list = await api("history");
    STATE.history = list;

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">No forecast records stored in current session. Run a forecast to generate audit logs.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((item, idx) => {
        const forecastText = item.forecast.map((f) => `<span class="pill-badge dept">${f.semester}: <b>${f.sections} sec</b></span>`).join(" ");
        return `
          <tr>
            <td>#${list.length - idx}</td>
            <td><strong style="color:var(--primary-blue);font-size:14px">${item.course}</strong></td>
            <td>${item.forecast.length} Semesters</td>
            <td>${forecastText}</td>
          </tr>
        `;
      })
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--error)">Failed to retrieve forecast history.</td></tr>`;
  }
}

function filterHistory() {
  const query = $("history-search-input").value.toLowerCase();
  const rows = document.querySelectorAll("#history-table-tbody tr");
  rows.forEach((r) => {
    r.style.display = r.textContent.toLowerCase().includes(query) ? "" : "none";
  });
}
