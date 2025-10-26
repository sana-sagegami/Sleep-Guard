// ============================================
// ClassGuard Popup Script - 完全版
// 顔認識・居眠り検知システム
// ============================================

let socket = null;
let isDetecting = false;
let currentTab = null;

// DOM要素
const elements = {
  // メッセージ
  message: document.getElementById("message"),

  // ステータス
  connectionIndicator: document.getElementById("connectionIndicator"),
  connectionStatus: document.getElementById("connectionStatus"),
  detectionIndicator: document.getElementById("detectionIndicator"),
  detectionStatus: document.getElementById("detectionStatus"),
  faceDetectionStatus: document.getElementById("faceDetectionStatus"),

  // 顔検出状態
  faceStatus: document.getElementById("faceStatus"),
  faceStatusIcon: document.getElementById("faceStatusIcon"),
  faceStatusText: document.getElementById("faceStatusText"),
  faceStatusDetail: document.getElementById("faceStatusDetail"),

  // セッション情報
  sessionInfo: document.getElementById("sessionInfo"),
  currentSessionId: document.getElementById("currentSessionId"),

  // タブ
  tabButtons: document.querySelectorAll(".tab-button"),
  connectionTab: document.getElementById("connection-tab"),
  alertTab: document.getElementById("alert-tab"),
  detectionTab: document.getElementById("detection-tab"),

  // 接続設定
  sessionUrl: document.getElementById("sessionUrl"),
  extractButton: document.getElementById("extractButton"),
  dashboardUrl: document.getElementById("dashboardUrl"),
  sessionId: document.getElementById("sessionId"),
  anonymousId: document.getElementById("anonymousId"),

  // アラート設定
  alertCards: document.querySelectorAll(".alert-card"),
  volumeGroup: document.getElementById("volumeGroup"),
  volume: document.getElementById("volume"),
  volumeValue: document.getElementById("volumeValue"),

  // 検知設定
  eyeClosedThreshold: document.getElementById("eyeClosedThreshold"),
  eyeClosedValue: document.getElementById("eyeClosedValue"),
  headDownThreshold: document.getElementById("headDownThreshold"),
  headDownValue: document.getElementById("headDownValue"),
  detectionInterval: document.getElementById("detectionInterval"),
  detectionIntervalValue: document.getElementById("detectionIntervalValue"),

  // ボタン
  saveButton: document.getElementById("saveButton"),
  testButton: document.getElementById("testButton"),
  startButton: document.getElementById("startButton"),
  stopButton: document.getElementById("stopButton"),
};

// ============================================
// 初期化
// ============================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 ClassGuard Popup 起動");

  // 設定を読み込み
  await loadSettings();

  // 匿名IDを生成/読み込み
  await initAnonymousId();

  // イベントリスナー設定
  setupEventListeners();

  // 接続状態を確認
  await checkConnectionStatus();

  console.log("✅ 初期化完了");
});

// ============================================
// イベントリスナー設定
// ============================================

function setupEventListeners() {
  // タブ切り替え
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  // URL自動抽出
  elements.extractButton.addEventListener("click", extractUrlInfo);

  // アラートモード選択
  elements.alertCards.forEach((card) => {
    card.addEventListener("click", () => selectAlertMode(card.dataset.mode));
  });

  // スライダー値変更
  elements.volume.addEventListener("input", (e) => {
    elements.volumeValue.textContent = e.target.value;
  });

  elements.eyeClosedThreshold.addEventListener("input", (e) => {
    elements.eyeClosedValue.textContent = `${e.target.value}s`;
  });

  elements.headDownThreshold.addEventListener("input", (e) => {
    elements.headDownValue.textContent = `${e.target.value}°`;
  });

  elements.detectionInterval.addEventListener("input", (e) => {
    elements.detectionIntervalValue.textContent = `${e.target.value}ms`;
  });

  // ボタン
  elements.saveButton.addEventListener("click", saveSettings);
  elements.testButton.addEventListener("click", testConnection);
  elements.startButton.addEventListener("click", startDetection);
  elements.stopButton.addEventListener("click", stopDetection);
}

// ============================================
// タブ切り替え
// ============================================

function switchTab(tabName) {
  // ボタンのアクティブ状態
  elements.tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  // コンテンツの表示/非表示
  elements.connectionTab.classList.toggle("active", tabName === "connection");
  elements.alertTab.classList.toggle("active", tabName === "alert");
  elements.detectionTab.classList.toggle("active", tabName === "detection");

  currentTab = tabName;
  console.log("🔄 Tab switched to:", tabName);
}

// ============================================
// アラートモード選択
// ============================================

function selectAlertMode(mode) {
  // すべてのカードから選択を解除
  elements.alertCards.forEach((card) => {
    card.classList.remove("selected");
  });

  // 選択されたカードをハイライト
  const selectedCard = document.querySelector(`[data-mode="${mode}"]`);
  if (selectedCard) {
    selectedCard.classList.add("selected");
  }

  // 音量調整の表示/非表示
  elements.volumeGroup.style.display = mode === "sound" ? "block" : "none";

  console.log("🔔 Alert mode changed to:", mode);
}

// ============================================
// URL自動抽出
// ============================================

function extractUrlInfo() {
  const url = elements.sessionUrl.value.trim();

  if (!url) {
    showMessage("URLを入力してください", "error");
    return;
  }

  try {
    const urlObj = new URL(url);

    // ダッシュボードURL（オリジン）を抽出
    const dashboardUrl = urlObj.origin;

    // セッションIDをクエリパラメータから抽出
    const sessionId = urlObj.searchParams.get("session");

    if (!sessionId) {
      showMessage("セッションIDが見つかりません", "error");
      return;
    }

    // フォームに設定
    elements.dashboardUrl.value = dashboardUrl;
    elements.sessionId.value = sessionId;

    // 自動保存
    saveSettings();

    showMessage("✅ URLから設定を抽出しました！", "success");
    console.log("📋 Extracted:", { dashboardUrl, sessionId });
  } catch (error) {
    console.error("❌ URL解析エラー:", error);
    showMessage("無効なURLです", "error");
  }
}

// ============================================
// 設定の保存
// ============================================

async function saveSettings() {
  // 選択されているアラートモード
  const selectedCard = document.querySelector(".alert-card.selected");
  const alertMode = selectedCard ? selectedCard.dataset.mode : "sound";

  const settings = {
    dashboardUrl: elements.dashboardUrl.value,
    sessionId: elements.sessionId.value,
    alertMode: alertMode,
    volume: parseInt(elements.volume.value),
    eyeClosedThreshold: parseFloat(elements.eyeClosedThreshold.value),
    headDownThreshold: parseInt(elements.headDownThreshold.value),
    detectionInterval: parseInt(elements.detectionInterval.value),
  };

  try {
    await chrome.storage.local.set(settings);
    console.log("💾 Settings saved:", settings);
    showMessage("✅ 設定を保存しました", "success");
  } catch (error) {
    console.error("❌ Save error:", error);
    showMessage("保存に失敗しました", "error");
  }
}

// ============================================
// 設定の読み込み
// ============================================

async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get([
      "dashboardUrl",
      "sessionId",
      "alertMode",
      "volume",
      "eyeClosedThreshold",
      "headDownThreshold",
      "detectionInterval",
    ]);

    // 接続設定
    if (settings.dashboardUrl) {
      elements.dashboardUrl.value = settings.dashboardUrl;
    }

    if (settings.sessionId) {
      elements.sessionId.value = settings.sessionId;
    }

    // アラートモード
    const alertMode = settings.alertMode || "sound";
    selectAlertMode(alertMode);

    // 音量
    const volume = settings.volume || 70;
    elements.volume.value = volume;
    elements.volumeValue.textContent = volume;

    // 検知パラメータ
    const eyeClosedThreshold = settings.eyeClosedThreshold || 3.0;
    elements.eyeClosedThreshold.value = eyeClosedThreshold;
    elements.eyeClosedValue.textContent = `${eyeClosedThreshold}s`;

    const headDownThreshold = settings.headDownThreshold || 25;
    elements.headDownThreshold.value = headDownThreshold;
    elements.headDownValue.textContent = `${headDownThreshold}°`;

    const detectionInterval = settings.detectionInterval || 500;
    elements.detectionInterval.value = detectionInterval;
    elements.detectionIntervalValue.textContent = `${detectionInterval}ms`;

    console.log("📂 Settings loaded:", settings);
  } catch (error) {
    console.error("❌ Load error:", error);
  }
}

// ============================================
// 匿名ID
// ============================================

async function initAnonymousId() {
  try {
    let { anonymousId } = await chrome.storage.local.get("anonymousId");

    if (!anonymousId) {
      // 新規生成
      anonymousId = generateAnonymousId();
      await chrome.storage.local.set({ anonymousId });
      console.log("🆔 Generated new anonymous ID:", anonymousId);
    } else {
      console.log("🆔 Loaded anonymous ID:", anonymousId);
    }

    elements.anonymousId.textContent = anonymousId;
  } catch (error) {
    console.error("❌ Anonymous ID error:", error);
    elements.anonymousId.textContent = "エラー";
  }
}

function generateAnonymousId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `student_${timestamp}_${random}`;
}

// ============================================
// 接続テスト
// ============================================

async function testConnection() {
  const dashboardUrl = elements.dashboardUrl.value;
  const sessionId = elements.sessionId.value;

  if (!dashboardUrl || !sessionId) {
    showMessage("ダッシュボードURLとセッションIDを設定してください", "error");
    return;
  }

  showMessage("🔍 接続テスト中...", "info");

  try {
    // 簡易的な接続確認
    const response = await fetch(dashboardUrl, {
      method: "HEAD",
      mode: "no-cors",
    });

    showMessage("✅ サーバーに到達できます", "success");
    console.log("✅ Connection test passed");
  } catch (error) {
    console.error("❌ Connection test failed:", error);
    showMessage("❌ サーバーに接続できません", "error");
  }
}

// ============================================
// 検知開始
// ============================================

async function startDetection() {
  const dashboardUrl = elements.dashboardUrl.value;
  const sessionId = elements.sessionId.value;

  if (!dashboardUrl || !sessionId) {
    showMessage("ダッシュボードURLとセッションIDを設定してください", "error");
    return;
  }

  try {
    // 設定を保存
    await saveSettings();

    // content scriptに検知開始を通知
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      showMessage("アクティブなタブが見つかりません", "error");
      return;
    }

    // content scriptに設定を送信
    const settings = await chrome.storage.local.get([
      "dashboardUrl",
      "sessionId",
      "alertMode",
      "volume",
      "eyeClosedThreshold",
      "headDownThreshold",
      "detectionInterval",
      "anonymousId",
    ]);

    chrome.tabs.sendMessage(
      tab.id,
      {
        action: "START_DETECTION",
        settings: settings,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("❌ Start detection failed:", chrome.runtime.lastError);
          showMessage("検知開始に失敗しました", "error");
          return;
        }

        if (response?.success) {
          isDetecting = true;
          updateDetectionUI(true);
          showMessage("✅ 検知を開始しました", "success");
          console.log("▶️ Detection started");
        } else {
          showMessage("検知開始に失敗しました", "error");
        }
      }
    );
  } catch (error) {
    console.error("❌ Start detection error:", error);
    showMessage("エラーが発生しました: " + error.message, "error");
  }
}

// ============================================
// 検知停止
// ============================================

async function stopDetection() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      showMessage("アクティブなタブが見つかりません", "error");
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      {
        action: "STOP_DETECTION",
      },
      (response) => {
        isDetecting = false;
        updateDetectionUI(false);
        showMessage("⏹️ 検知を停止しました", "info");
        console.log("⏹️ Detection stopped");
      }
    );
  } catch (error) {
    console.error("❌ Stop detection error:", error);
    showMessage("停止に失敗しました", "error");
  }
}

// ============================================
// 検知UI更新
// ============================================

function updateDetectionUI(detecting) {
  // ボタンの有効/無効
  elements.startButton.disabled = detecting;
  elements.stopButton.disabled = !detecting;

  // インジケーター
  if (detecting) {
    elements.detectionIndicator.className = "indicator detecting";
    elements.detectionStatus.textContent = "検知中";
    elements.faceStatus.style.display = "block";
  } else {
    elements.detectionIndicator.className = "indicator inactive";
    elements.detectionStatus.textContent = "停止中";
    elements.faceStatus.style.display = "none";
    elements.faceDetectionStatus.textContent = "待機中";
  }
}

// ============================================
// 接続状態確認
// ============================================

async function checkConnectionStatus() {
  try {
    const { isConnected, sessionId } = await chrome.storage.local.get([
      "isConnected",
      "sessionId",
    ]);

    if (isConnected && sessionId) {
      updateConnectionUI(true, sessionId);
    }
  } catch (error) {
    console.error("❌ Check connection error:", error);
  }
}

// ============================================
// 接続UI更新
// ============================================

function updateConnectionUI(connected, sessionId = null) {
  if (connected) {
    elements.connectionIndicator.className = "indicator active";
    elements.connectionStatus.textContent = "接続中";

    if (sessionId) {
      elements.sessionInfo.style.display = "block";
      elements.currentSessionId.textContent = sessionId;
    }
  } else {
    elements.connectionIndicator.className = "indicator inactive";
    elements.connectionStatus.textContent = "未接続";
    elements.sessionInfo.style.display = "none";
  }
}

// ============================================
// 顔検出状態更新
// ============================================

function updateFaceStatus(status) {
  switch (status) {
    case "detecting":
      elements.faceStatusIcon.textContent = "👤";
      elements.faceStatusText.textContent = "顔検出中";
      elements.faceStatusDetail.textContent = "正常に顔を検出しています";
      elements.faceDetectionStatus.textContent = "✅ 顔検出中";
      break;

    case "no_face":
      elements.faceStatusIcon.textContent = "❌";
      elements.faceStatusText.textContent = "顔が見つかりません";
      elements.faceStatusDetail.textContent = "カメラの前に顔を向けてください";
      elements.faceDetectionStatus.textContent = "❌ 顔なし";
      break;

    case "eyes_closed":
      elements.faceStatusIcon.textContent = "😪";
      elements.faceStatusText.textContent = "目を閉じています";
      elements.faceStatusDetail.textContent = "目を開けてください";
      elements.faceDetectionStatus.textContent = "😪 目を閉じています";
      break;

    case "head_down":
      elements.faceStatusIcon.textContent = "😴";
      elements.faceStatusText.textContent = "頭が下がっています";
      elements.faceStatusDetail.textContent = "居眠りの可能性";
      elements.faceDetectionStatus.textContent = "😴 頭が下がっています";
      break;

    case "drowsy":
      elements.faceStatusIcon.textContent = "🚨";
      elements.faceStatusText.textContent = "居眠り検出！";
      elements.faceStatusDetail.textContent = "アラートを発信しています";
      elements.faceDetectionStatus.textContent = "🚨 居眠り検出";
      break;

    case "focused":
      elements.faceStatusIcon.textContent = "✅";
      elements.faceStatusText.textContent = "集中中";
      elements.faceStatusDetail.textContent = "良好な状態です";
      elements.faceDetectionStatus.textContent = "✅ 集中中";
      break;
  }
}

// ============================================
// メッセージ表示
// ============================================

function showMessage(text, type = "info") {
  elements.message.textContent = text;
  elements.message.className = `message ${type} show`;

  // 5秒後に自動非表示
  setTimeout(() => {
    elements.message.classList.remove("show");
  }, 5000);
}

// ============================================
// メッセージリスナー（content scriptからの通知）
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 Message received:", message);

  switch (message.action) {
    case "FACE_DETECTED":
      updateFaceStatus("detecting");
      break;

    case "FACE_LOST":
      updateFaceStatus("no_face");
      break;

    case "EYES_CLOSED":
      updateFaceStatus("eyes_closed");
      break;

    case "HEAD_DOWN":
      updateFaceStatus("head_down");
      break;

    case "DROWSINESS_DETECTED":
      updateFaceStatus("drowsy");
      showMessage("🚨 居眠りを検出しました！", "error");
      break;

    case "FOCUSED":
      updateFaceStatus("focused");
      break;

    case "CONNECTION_ESTABLISHED":
      updateConnectionUI(true, message.sessionId);
      showMessage("✅ サーバーに接続しました", "success");
      break;

    case "CONNECTION_LOST":
      updateConnectionUI(false);
      updateDetectionUI(false);
      showMessage("❌ 接続が切れました", "error");
      break;
  }

  sendResponse({ received: true });
  return true;
});

console.log("✅ Popup script loaded - 完全版");
