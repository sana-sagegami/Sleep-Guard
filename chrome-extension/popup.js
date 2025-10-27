// ============================================
// SleepGuard Popup Script - 完全版
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

  // 接続設定
  sessionUrl: document.getElementById("sessionUrl"),
  extractButton: document.getElementById("extractButton"),
  anonymousId: document.getElementById("anonymousId"),

  // アラート設定
  alertCards: document.querySelectorAll(".alert-card"),
  volumeGroup: document.getElementById("volumeGroup"),
  volume: document.getElementById("volume"),
  volumeValue: document.getElementById("volumeValue"),

  // ボタン
  testButton: document.getElementById("testButton"),
  toggleDetectionButton: document.getElementById("toggleDetectionButton"),
};

// ============================================
// 初期化
// ============================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 SleepGuard Popup 起動");

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

  // 音量スライダー - 自動保存
  elements.volume.addEventListener("input", (e) => {
    elements.volumeValue.textContent = e.target.value;
  });

  elements.volume.addEventListener("change", () => {
    saveSettings();
  });

  // ボタン
  elements.testButton.addEventListener("click", testConnection);
  elements.toggleDetectionButton.addEventListener("click", toggleDetection);

  console.log("✅ Event listeners setup complete");
}

// ============================================
// タブ切り替え
// ============================================

function switchTab(tabName) {
  // すべてのタブボタンとコンテンツを非アクティブに
  elements.tabButtons.forEach((btn) => btn.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });

  // 選択されたタブをアクティブに
  const selectedButton = document.querySelector(`[data-tab="${tabName}"]`);
  const selectedContent = document.getElementById(`${tabName}-tab`);

  if (selectedButton && selectedContent) {
    selectedButton.classList.add("active");
    selectedContent.classList.add("active");
    console.log("📑 Tab switched to:", tabName);
  }
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

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔔 Alert mode changed to:", mode);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 自動保存
  saveSettings();
}

// ============================================
// 設定の保存
// ============================================

async function saveSettings() {
  try {
    // 選択されているアラートモード
    const selectedCard = document.querySelector(".alert-card.selected");
    const alertMode = selectedCard ? selectedCard.dataset.mode : "sound";

    const settings = {
      alertMode: alertMode,
      volume: parseInt(elements.volume.value),
    };

    // 既存の設定を取得して保持
    const existing = await chrome.storage.local.get([
      "dashboardUrl",
      "sessionId",
    ]);

    if (existing.dashboardUrl) {
      settings.dashboardUrl = existing.dashboardUrl;
    }

    if (existing.sessionId) {
      settings.sessionId = existing.sessionId;
    }

    await chrome.storage.local.set(settings);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💾 Settings auto-saved:");
    console.log("   Alert Mode:", settings.alertMode);
    console.log("   Volume:", settings.volume);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
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
    ]);

    // アラートモード
    const alertMode = settings.alertMode || "sound";
    selectAlertMode(alertMode);

    // 音量
    const volume = settings.volume || 70;
    elements.volume.value = volume;
    elements.volumeValue.textContent = volume;

    console.log("📂 Settings loaded:", settings);
  } catch (error) {
    console.error("❌ Load error:", error);
  }
}

// ============================================
// URL自動抽出
// ============================================

function extractUrlInfo() {
  // URLを取得して、改行・空白をすべて削除
  let url = elements.sessionUrl.value;

  // 改行を削除
  url = url.replace(/\r?\n|\r/g, "");

  // 前後の空白を削除
  url = url.trim();

  // すべての空白を削除(URL内に空白があってはいけない)
  url = url.replace(/\s/g, "");

  console.log("🔍 Processing URL:", url);

  if (!url) {
    showMessage("URLを入力してください", "error");
    return;
  }

  // URLの基本的な検証
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    showMessage(
      "URLは http:// または https:// で始まる必要があります",
      "error"
    );
    return;
  }

  try {
    const urlObj = new URL(url);

    console.log("✅ URL parsed successfully");
    console.log("   Origin:", urlObj.origin);
    console.log("   Pathname:", urlObj.pathname);
    console.log("   Search:", urlObj.search);

    // ダッシュボードURL(オリジン)を抽出
    const dashboardUrl = urlObj.origin;

    // セッションIDをクエリパラメータから抽出
    const sessionId = urlObj.searchParams.get("session");

    console.log("   Session ID:", sessionId);

    if (!sessionId) {
      showMessage(
        "セッションIDが見つかりません。URLに ?session=... が含まれているか確認してください",
        "error"
      );
      return;
    }

    // 自動保存
    saveExtractedSettings(dashboardUrl, sessionId);

    showMessage("✅ URLから設定を抽出しました!", "success");
    console.log("📋 Extracted successfully:", { dashboardUrl, sessionId });
  } catch (error) {
    console.error("❌ URL解析エラー:", error);
    console.error("   URL:", url);
    showMessage("無効なURLです: " + error.message, "error");
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

    if (elements.anonymousId) {
      elements.anonymousId.textContent = anonymousId;
    }
  } catch (error) {
    console.error("❌ Anonymous ID error:", error);
    if (elements.anonymousId) {
      elements.anonymousId.textContent = "エラー";
    }
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
  const settings = await chrome.storage.local.get([
    "dashboardUrl",
    "sessionId",
  ]);

  if (!settings.dashboardUrl || !settings.sessionId) {
    showMessage("URLを設定してください", "error");
    return;
  }

  showMessage("🔍 接続テスト中...", "info");
  console.log("🔍 Testing connection to:", settings.dashboardUrl);
  console.log("🔑 Session ID:", settings.sessionId);

  try {
    // 1. ヘルスチェック
    console.log("📡 Testing /api/health endpoint...");
    const healthUrl = `${settings.dashboardUrl}/api/health`;

    const healthResponse = await fetch(healthUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status}`);
    }

    const healthData = await healthResponse.json();
    console.log("✅ Health check passed:", healthData);

    // 2. Pusher設定取得テスト
    console.log("📡 Testing /api/pusher-config endpoint...");
    const pusherConfigUrl = `${settings.dashboardUrl}/api/pusher-config`;

    const pusherResponse = await fetch(pusherConfigUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!pusherResponse.ok) {
      throw new Error(`Pusher config failed: ${pusherResponse.status}`);
    }

    const pusherData = await pusherResponse.json();
    console.log("✅ Pusher config retrieved:", {
      key: pusherData.key,
      cluster: pusherData.cluster,
    });

    // 3. 接続成功
    await chrome.storage.local.set({
      isConnected: true,
      lastConnected: new Date().toISOString(),
      pusherConfig: pusherData, // Pusher設定を保存
    });

    updateConnectionUI(true, settings.sessionId);
    showMessage("✅ サーバーに接続できました", "success");
    console.log("✅ Connection test completed successfully");
  } catch (error) {
    console.error("❌ Connection test failed:", error);

    // 詳細なエラーメッセージ
    let errorMessage = "サーバーに接続できません";

    if (error.message.includes("Failed to fetch")) {
      errorMessage = "サーバーに到達できません。URLを確認してください";
    } else if (error.message.includes("Health check failed")) {
      errorMessage = "サーバーは動作していますが、ヘルスチェックに失敗しました";
    } else if (error.message.includes("Pusher config failed")) {
      errorMessage = "Pusher設定の取得に失敗しました";
    }

    updateConnectionUI(false);
    await chrome.storage.local.set({ isConnected: false });
    showMessage(`❌ ${errorMessage}`, "error");
  }
}

// ============================================
// 抽出した設定を保存（接続テスト自動実行）
// ============================================

async function saveExtractedSettings(dashboardUrl, sessionId) {
  try {
    // 既存の設定を取得
    const existing = await chrome.storage.local.get(["alertMode", "volume"]);

    // 新しい設定をマージ
    const settings = {
      dashboardUrl: dashboardUrl,
      sessionId: sessionId,
      alertMode: existing.alertMode || "sound",
      volume: existing.volume || 70,
      isConnected: false,
    };

    await chrome.storage.local.set(settings);
    console.log("💾 Extracted settings saved:", settings);

    // UI更新: セッション情報を表示
    if (elements.sessionInfo && elements.currentSessionId) {
      elements.sessionInfo.style.display = "block";
      elements.currentSessionId.textContent = sessionId;
    }

    // 自動的に接続テストを実行
    console.log("🔄 Auto-testing connection...");
    await testConnection();
  } catch (error) {
    console.error("❌ Save extracted settings error:", error);
    throw error;
  }
}

// ============================================
// メッセージ表示
// ============================================

function showMessage(text, type = "info") {
  if (!elements.message) {
    console.warn("⚠️ Message element not found");
    return;
  }

  elements.message.textContent = text;
  elements.message.className = `message ${type} show`;

  // 5秒後に自動非表示
  setTimeout(() => {
    elements.message.classList.remove("show");
  }, 5000);
}

console.log("✅ Popup script loaded - 完全版");

// ============================================
// 抽出した設定を保存
// ============================================

async function saveExtractedSettings(dashboardUrl, sessionId) {
  try {
    // 既存の設定を取得
    const existing = await chrome.storage.local.get(["alertMode", "volume"]);

    // 新しい設定をマージ
    const settings = {
      dashboardUrl: dashboardUrl,
      sessionId: sessionId,
      alertMode: existing.alertMode || "sound",
      volume: existing.volume || 70,
      isConnected: false, // まだ接続していない
    };

    await chrome.storage.local.set(settings);
    console.log("💾 Extracted settings saved:", settings);

    // UI更新: セッション情報を表示
    if (elements.sessionInfo && elements.currentSessionId) {
      elements.sessionInfo.style.display = "block";
      elements.currentSessionId.textContent = sessionId;
    }

    // 接続状態は「未接続」のまま（接続テストまたは検知開始で接続）
    updateConnectionUI(false);
  } catch (error) {
    console.error("❌ Save extracted settings error:", error);
    throw error;
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

    console.log("📊 Current connection status:", { isConnected, sessionId });

    if (isConnected && sessionId) {
      updateConnectionUI(true, sessionId);
    } else {
      updateConnectionUI(false);
    }
  } catch (error) {
    console.error("❌ Check connection error:", error);
  }
}

// ============================================
// 接続UI更新
// ============================================

function updateConnectionUI(connected, sessionId = null) {
  console.log("🔄 Updating connection UI:", { connected, sessionId });

  if (elements.connectionIndicator) {
    if (connected) {
      elements.connectionIndicator.className = "indicator active";
      if (elements.connectionStatus) {
        elements.connectionStatus.textContent = "接続中";
      }

      if (sessionId && elements.sessionInfo && elements.currentSessionId) {
        elements.sessionInfo.style.display = "block";
        elements.currentSessionId.textContent = sessionId;
      }
    } else {
      elements.connectionIndicator.className = "indicator inactive";
      if (elements.connectionStatus) {
        elements.connectionStatus.textContent = "未接続";
      }
      if (elements.sessionInfo) {
        elements.sessionInfo.style.display = "none";
      }
    }
  }
}
// ============================================
// 検知UI更新
// ============================================

function updateDetectionUI(detecting) {
  // トグルボタンの状態を更新
  if (elements.toggleDetectionButton) {
    if (detecting) {
      elements.toggleDetectionButton.textContent = "⏹️ 検知停止";
      elements.toggleDetectionButton.className = "button button-danger";
    } else {
      elements.toggleDetectionButton.textContent = "▶️ 検知開始";
      elements.toggleDetectionButton.className = "button button-success";
    }
  }

  // インジケーター
  if (detecting) {
    if (elements.detectionIndicator) {
      elements.detectionIndicator.className = "indicator detecting";
    }
    if (elements.detectionStatus) {
      elements.detectionStatus.textContent = "検知中";
    }
    if (elements.faceStatus) {
      elements.faceStatus.style.display = "block";
    }
  } else {
    if (elements.detectionIndicator) {
      elements.detectionIndicator.className = "indicator inactive";
    }
    if (elements.detectionStatus) {
      elements.detectionStatus.textContent = "停止中";
    }
    if (elements.faceStatus) {
      elements.faceStatus.style.display = "none";
    }
    if (elements.faceDetectionStatus) {
      elements.faceDetectionStatus.textContent = "待機中";
    }
  }
}

// ============================================
// 顔検出状態更新
// ============================================

function updateFaceStatus(status) {
  if (
    !elements.faceStatusIcon ||
    !elements.faceStatusText ||
    !elements.faceStatusDetail
  ) {
    return;
  }

  switch (status) {
    case "detecting":
      elements.faceStatusIcon.textContent = "👤";
      elements.faceStatusText.textContent = "顔検出中";
      elements.faceStatusDetail.textContent = "正常に顔を検出しています";
      if (elements.faceDetectionStatus) {
        elements.faceDetectionStatus.textContent = "✅ 顔検出中";
      }
      break;

    case "no_face":
      elements.faceStatusIcon.textContent = "❌";
      elements.faceStatusText.textContent = "顔が見つかりません";
      elements.faceStatusDetail.textContent = "カメラの前に顔を向けてください";
      if (elements.faceDetectionStatus) {
        elements.faceDetectionStatus.textContent = "❌ 顔なし";
      }
      break;

    case "eyes_closed":
      elements.faceStatusIcon.textContent = "😪";
      elements.faceStatusText.textContent = "目を閉じています";
      elements.faceStatusDetail.textContent = "目を開けてください";
      if (elements.faceDetectionStatus) {
        elements.faceDetectionStatus.textContent = "😪 目を閉じています";
      }
      break;

    case "head_down":
      elements.faceStatusIcon.textContent = "😴";
      elements.faceStatusText.textContent = "頭が下がっています";
      elements.faceStatusDetail.textContent = "居眠りの可能性";
      if (elements.faceDetectionStatus) {
        elements.faceDetectionStatus.textContent = "😴 頭が下がっています";
      }
      break;

    case "drowsy":
      elements.faceStatusIcon.textContent = "🚨";
      elements.faceStatusText.textContent = "居眠り検出！";
      elements.faceStatusDetail.textContent = "アラートを発信しています";
      if (elements.faceDetectionStatus) {
        elements.faceDetectionStatus.textContent = "🚨 居眠り検出";
      }
      break;

    case "focused":
      elements.faceStatusIcon.textContent = "✅";
      elements.faceStatusText.textContent = "集中中";
      elements.faceStatusDetail.textContent = "良好な状態です";
      if (elements.faceDetectionStatus) {
        elements.faceDetectionStatus.textContent = "✅ 集中中";
      }
      break;
  }
}

// ============================================
// 抽出した設定を保存（自動接続・自動開始）
// ============================================

async function saveExtractedSettings(dashboardUrl, sessionId) {
  try {
    // 既存の設定を取得
    const existing = await chrome.storage.local.get(["alertMode", "volume"]);

    // 新しい設定をマージ
    const settings = {
      dashboardUrl: dashboardUrl,
      sessionId: sessionId,
      alertMode: existing.alertMode || "sound",
      volume: existing.volume || 70,
      isConnected: false,
    };

    await chrome.storage.local.set(settings);
    console.log("💾 Extracted settings saved:", settings);

    // UI更新: セッション情報を表示
    if (elements.sessionInfo && elements.currentSessionId) {
      elements.sessionInfo.style.display = "block";
      elements.currentSessionId.textContent = sessionId;
    }

    // 自動的に接続テストを実行
    console.log("🔄 Auto-testing connection...");
    await testConnection();

    // 接続成功したら自動的に検知開始
    const { isConnected } = await chrome.storage.local.get("isConnected");
    if (isConnected) {
      console.log("🔄 Auto-starting detection...");
      // 1秒待ってから検知開始
      setTimeout(() => {
        startDetection();
      }, 1000);
    }
  } catch (error) {
    console.error("❌ Save extracted settings error:", error);
    throw error;
  }
}

// ============================================
// URLフィールドの値を保持（ポップアップが閉じても保存）
// ============================================

// URL入力時に自動保存
if (elements.sessionUrl) {
  elements.sessionUrl.addEventListener("input", async (e) => {
    const url = e.target.value;
    await chrome.storage.local.set({ lastInputUrl: url });
  });
}

// ポップアップ起動時に前回の入力値を復元
async function restoreLastUrl() {
  try {
    const { lastInputUrl } = await chrome.storage.local.get("lastInputUrl");
    if (lastInputUrl && elements.sessionUrl) {
      elements.sessionUrl.value = lastInputUrl;
      console.log("📝 Restored last URL:", lastInputUrl);
    }
  } catch (error) {
    console.error("❌ Failed to restore URL:", error);
  }
}

// ============================================
// 初期化（修正版）
// ============================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 SleepGuard Popup 起動");

  // 設定を読み込み
  await loadSettings();

  // 匿名IDを生成/読み込み
  await initAnonymousId();

  // 前回入力したURLを復元
  await restoreLastUrl();

  // イベントリスナー設定
  setupEventListeners();

  // 接続状態を確認
  await checkConnectionStatus();

  // 既に検知中かどうかチェック
  await checkDetectionStatus();

  console.log("✅ 初期化完了");
});

// ============================================
// 検知状態の確認（ポップアップ再起動時）
// ============================================

async function checkDetectionStatus() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      return;
    }

    // Content Scriptに現在の状態を問い合わせ
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "CHECK_STATUS",
      });

      if (response?.isDetecting) {
        isDetecting = true;
        updateDetectionUI(true);
        console.log("✅ Detection is already running");

        // 顔の状態も復元
        if (response.faceDetected) {
          if (response.eyesClosed) {
            updateFaceStatus("eyes_closed");
          } else if (response.headDown) {
            updateFaceStatus("head_down");
          } else {
            updateFaceStatus("detecting");
          }
        }
      }
    } catch (error) {
      // Content Scriptがない場合は無視
      console.debug("⚠️ Content script not available");
    }
  } catch (error) {
    console.error("❌ Failed to check detection status:", error);
  }
}

// ============================================
// 検知開始/停止トグル
// ============================================

async function toggleDetection() {
  if (isDetecting) {
    await stopDetection();
  } else {
    await startDetection();
  }
}

// ============================================
// 検知開始（カメラ起動時にポップアップを閉じない）
// ============================================

async function startDetection() {
  // 設定を取得
  const settings = await chrome.storage.local.get([
    "dashboardUrl",
    "sessionId",
    "alertMode",
    "volume",
    "anonymousId",
  ]);

  // 匿名IDがない場合は生成
  if (!settings.anonymousId) {
    settings.anonymousId = `student_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 15)}`;
    await chrome.storage.local.set({ anonymousId: settings.anonymousId });
    console.log("🆔 Generated anonymous ID:", settings.anonymousId);
  }

  // セッションIDがない場合は生成（オフラインモード）
  if (!settings.sessionId) {
    settings.sessionId = `offline_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 15)}`;
    await chrome.storage.local.set({ sessionId: settings.sessionId });
    console.log("📴 Offline mode - Generated session ID:", settings.sessionId);
  }

  // ダッシュボードURLがない場合はデフォルト値を設定
  if (!settings.dashboardUrl) {
    settings.dashboardUrl = "https://dashboard-inky-iota-87.vercel.app";
    console.log("🌐 Using default dashboard URL");
  }

  console.log("▶️ Starting detection with settings:", settings);

  try {
    // アクティブなタブを取得
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      showMessage("アクティブなタブが見つかりません", "error");
      return;
    }

    console.log("📍 Active tab:", tab.url);

    // 制限されたページでの警告
    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://") ||
      tab.url.includes("google.com/search")
    ) {
      showMessage(
        "⚠️ このページでは拡張機能が動作しません。通常のWebページで試してください",
        "error"
      );
      return;
    }

    // 検知開始メッセージを表示
    showMessage("🔄 検知を開始しています...", "info");

    // Content Scriptを手動で注入
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["face-api.js", "content.js"],
      });
      console.log("✅ Content script injected manually");

      // 少し待ってからメッセージ送信
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (injectError) {
      console.warn(
        "⚠️ Manual injection failed (might be already loaded):",
        injectError.message
      );
    }

    // content scriptにメッセージを送信
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "START_DETECTION",
        settings: settings,
      });

      // レスポンスチェック
      if (response?.success) {
        isDetecting = true;
        updateDetectionUI(true);

        await chrome.storage.local.set({ isConnected: true });
        updateConnectionUI(true, settings.sessionId);

        // オンラインモードの場合のみQRコードを生成
        if (!settings.sessionId.startsWith("offline_")) {
          await generateAndShowQRCode();
          console.log("📡 Pusher channel: session-" + settings.sessionId);
        } else {
          console.log("📴 Offline mode - QR code generation skipped");
        }

        const mode = settings.sessionId.startsWith("offline_")
          ? "オフライン"
          : "オンライン";
        showMessage(`✅ 検知を開始しました (${mode}モード)`, "success");
        console.log("▶️ Detection started successfully");

        // ポップアップは閉じない（ユーザーが手動で閉じるまで開いたまま）
      } else {
        console.error("❌ Detection start failed:", response);
        showMessage(
          "検知開始に失敗しました: " + (response?.message || "不明なエラー"),
          "error"
        );
        updateConnectionUI(false);
        await chrome.storage.local.set({ isConnected: false });
      }
    } catch (messageError) {
      console.error("❌ Content script communication error:", messageError);

      showMessage("⚠️ ページをリロードしてから再度お試しください", "error");

      updateConnectionUI(false);
      await chrome.storage.local.set({ isConnected: false });
    }
  } catch (error) {
    console.error("❌ Start detection error:", error);
    showMessage("エラーが発生しました: " + error.message, "error");
    updateConnectionUI(false);
    await chrome.storage.local.set({ isConnected: false });
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

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "STOP_DETECTION",
      });

      isDetecting = false;
      updateDetectionUI(false);

      // QRコードを非表示
      const qrCodeSection = document.getElementById("qrCodeSection");
      if (qrCodeSection) {
        qrCodeSection.style.display = "none";
      }

      showMessage("⏹️ 検知を停止しました", "info");
      console.log("⏹️ Detection stopped");
    } catch (messageError) {
      console.error("❌ Stop detection communication error:", messageError);

      // エラーでも状態をリセット
      isDetecting = false;
      updateDetectionUI(false);

      // QRコードを非表示
      const qrCodeSection = document.getElementById("qrCodeSection");
      if (qrCodeSection) {
        qrCodeSection.style.display = "none";
      }

      showMessage("⏹️ 検知を停止しました", "info");
    }
  } catch (error) {
    console.error("❌ Stop detection error:", error);
    showMessage("停止に失敗しました", "error");
  }
}

// ============================================
// メッセージリスナー（content scriptからの通知）
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 Message received:", message);

  // Background scriptへのメッセージは無視
  if (
    message.action === "TRIGGER_SMARTPHONE" ||
    message.action === "CONNECT_PUSHER" ||
    message.action === "DISCONNECT_PUSHER" ||
    message.action === "SEND_STATUS"
  ) {
    return false; // このリスナーでは処理しない
  }

  try {
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
        showMessage("🚨 居眠りを検出しました!", "error");
        break;

      case "FOCUSED":
        updateFaceStatus("focused");
        break;

      case "CONNECTION_ESTABLISHED":
        // Pusher接続が確立された
        chrome.storage.local.set({
          isConnected: true,
          lastConnected: new Date().toISOString(),
        });
        updateConnectionUI(true, message.sessionId);
        showMessage("✅ サーバーに接続しました", "success");
        console.log("✅ Pusher connection established");
        break;

      case "CONNECTION_LOST":
        // Pusher接続が切れた
        chrome.storage.local.set({ isConnected: false });
        updateConnectionUI(false);
        updateDetectionUI(false);
        showMessage("❌ 接続が切れました", "error");
        console.log("❌ Pusher connection lost");
        break;

      default:
        console.warn("⚠️ Unknown message action:", message.action);
    }

    sendResponse({ received: true });
  } catch (error) {
    console.error("❌ Message handler error:", error);
    sendResponse({ received: false, error: error.message });
  }

  return true; // 非同期レスポンスを有効にする
});

console.log("✅ Popup script loaded - 完全版");

// QRコード生成関数を追加（既存のコードの後ろに追加）

// QRコードを生成して表示
async function generateAndShowQRCode() {
  try {
    // ストレージから設定を取得
    const settings = await chrome.storage.local.get([
      "sessionId",
      "dashboardUrl",
      "anonymousId",
    ]);

    const sessionId = settings.sessionId;
    const dashboardUrl = settings.dashboardUrl;
    const anonymousId = settings.anonymousId;

    if (!sessionId || !dashboardUrl || !anonymousId) {
      console.log("⚠️ QRコード生成: セッション情報が不足");
      return;
    }

    // スマホ用URL生成
    const smartphoneUrl = `${dashboardUrl}/smartphone?session=${sessionId}&studentId=${anonymousId}`;

    // QRコード生成（Google Chart API使用）
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      smartphoneUrl
    )}`;

    console.log("📱 スマホ用URL:", smartphoneUrl);
    console.log("🔗 QRコードURL:", qrCodeUrl);

    // QRコード表示
    const qrCodeSection = document.getElementById("qrCodeSection");
    const qrCodeImage = document.getElementById("qrCodeImage");

    if (qrCodeSection && qrCodeImage) {
      qrCodeImage.src = qrCodeUrl;
      qrCodeSection.style.display = "block";
      showMessage("📱 スマホ用QRコードを生成しました", "success");
    }
  } catch (error) {
    console.error("❌ QRコード生成エラー:", error);
  }
}
