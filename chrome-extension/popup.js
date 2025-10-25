// ============================================
// ClassGuard Chrome拡張 - Popup Script
// Pusher版（Vercelダッシュボード連携）
// ============================================

console.log("🎨 Popup Script 開始");

// DOM要素
let elements = {};

// 初期化
document.addEventListener("DOMContentLoaded", async () => {
  console.log("📄 DOM読み込み完了");

  // DOM要素を取得
  elements = {
    dashboardUrl: document.getElementById("dashboardUrl"),
    sessionId: document.getElementById("sessionId"),
    studentName: document.getElementById("studentName"),
    anonymousId: document.getElementById("anonymousId"),
    alertMode: document.getElementById("alertMode"),
    volume: document.getElementById("volume"),
    volumeValue: document.getElementById("volumeValue"),
    saveButton: document.getElementById("saveSettings"),
    testButton: document.getElementById("testConnection"),
    startButton: document.getElementById("startDetection"),
    stopButton: document.getElementById("stopDetection"),
    status: document.getElementById("status"),
    currentStatus: document.getElementById("currentStatus"),
    connectionStatus: document.getElementById("connectionStatus"),
  };

  // 設定を読み込み
  await loadSettings();

  // イベントリスナーを設定
  setupEventListeners();

  // ステータスを更新
  updateStatus();
});

// 設定を読み込み
async function loadSettings() {
  const result = await chrome.storage.sync.get([
    "dashboardUrl",
    "sessionId",
    "studentName",
    "anonymousId",
    "alertMode",
    "volume",
  ]);

  if (result.dashboardUrl) {
    elements.dashboardUrl.value = result.dashboardUrl;
  }

  if (result.sessionId) {
    elements.sessionId.value = result.sessionId;
  }

  if (result.studentName) {
    elements.studentName.value = result.studentName;
  }

  if (result.anonymousId) {
    elements.anonymousId.value = result.anonymousId;
    elements.anonymousId.readOnly = true;
  }

  if (result.alertMode) {
    elements.alertMode.value = result.alertMode;
  }

  if (result.volume !== undefined) {
    elements.volume.value = result.volume;
    elements.volumeValue.textContent = result.volume;
  }

  console.log("✅ 設定読み込み完了");
}

// イベントリスナー設定
function setupEventListeners() {
  // 音量スライダー
  elements.volume.addEventListener("input", (e) => {
    elements.volumeValue.textContent = e.target.value;
  });

  // 保存ボタン
  elements.saveButton.addEventListener("click", saveSettings);

  // 接続テストボタン
  elements.testButton.addEventListener("click", testConnection);

  // 検知開始ボタン
  elements.startButton.addEventListener("click", startDetection);

  // 検知停止ボタン
  elements.stopButton.addEventListener("click", stopDetection);

  console.log("✅ イベントリスナー設定完了");
}

// 設定を保存
async function saveSettings() {
  console.log("💾 設定保存開始");

  const settings = {
    dashboardUrl: elements.dashboardUrl.value.trim(),
    sessionId: elements.sessionId.value.trim(),
    studentName: elements.studentName.value.trim() || "匿名",
    anonymousId: elements.anonymousId.value,
    alertMode: elements.alertMode.value,
    volume: parseInt(elements.volume.value),
  };

  // バリデーション
  if (!settings.dashboardUrl) {
    showMessage("ダッシュボードURLを入力してください", "error");
    return;
  }

  if (!settings.sessionId) {
    showMessage("セッションIDを入力してください", "error");
    return;
  }

  // Chromeストレージに保存
  await chrome.storage.sync.set(settings);

  // Backgroundスクリプトに通知
  chrome.runtime.sendMessage(
    {
      type: "SETTINGS_UPDATED",
      settings: settings,
    },
    (response) => {
      if (response && response.success) {
        console.log("✅ 設定保存完了");
        showMessage("設定を保存しました！", "success");
      } else {
        console.error("❌ 設定保存失敗");
        showMessage("設定の保存に失敗しました", "error");
      }
    }
  );
}

// 接続テスト
async function testConnection() {
  console.log("🔍 接続テスト開始");

  elements.testButton.disabled = true;
  elements.testButton.textContent = "テスト中...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CHECK_CONNECTION",
    });

    if (response && response.success) {
      console.log("✅ 接続成功");
      showMessage("ダッシュボードに接続できました！", "success");
      elements.connectionStatus.textContent = "✅ 接続OK";
      elements.connectionStatus.className = "connection-status connected";
    } else {
      console.error("❌ 接続失敗:", response.message);
      showMessage("接続に失敗: " + response.message, "error");
      elements.connectionStatus.textContent = "❌ 接続失敗";
      elements.connectionStatus.className = "connection-status disconnected";
    }
  } catch (error) {
    console.error("❌ 接続テストエラー:", error);
    showMessage("接続テストでエラーが発生しました", "error");
    elements.connectionStatus.textContent = "❌ エラー";
    elements.connectionStatus.className = "connection-status disconnected";
  } finally {
    elements.testButton.disabled = false;
    elements.testButton.textContent = "接続テスト";
  }
}

// 検知開始
async function startDetection() {
  console.log("🚀 検知開始");

  elements.startButton.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "START_DETECTION",
    });

    if (response && response.success) {
      console.log("✅ 検知開始成功");
      showMessage("居眠り検知を開始しました！", "success");
      updateStatus();
    } else {
      console.error("❌ 検知開始失敗");
      showMessage("検知の開始に失敗しました", "error");
    }
  } catch (error) {
    console.error("❌ 検知開始エラー:", error);
    showMessage("エラーが発生しました", "error");
  } finally {
    elements.startButton.disabled = false;
  }
}

// 検知停止
async function stopDetection() {
  console.log("⏹️ 検知停止");

  elements.stopButton.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "STOP_DETECTION",
    });

    if (response && response.success) {
      console.log("✅ 検知停止成功");
      showMessage("居眠り検知を停止しました", "success");
      updateStatus();
    } else {
      console.error("❌ 検知停止失敗");
      showMessage("検知の停止に失敗しました", "error");
    }
  } catch (error) {
    console.error("❌ 検知停止エラー:", error);
    showMessage("エラーが発生しました", "error");
  } finally {
    elements.stopButton.disabled = false;
  }
}

// ステータス更新
async function updateStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_STATUS",
    });

    if (response) {
      const statusText = response.active ? "🟢 検知中" : "⚫ 停止中";
      elements.status.textContent = statusText;

      if (response.active) {
        let displayStatus = "✅ 集中中";
        if (response.status === "drowsy") {
          displayStatus = "😪 眠そう";
        } else if (response.status === "sleeping") {
          displayStatus = "😴 居眠り";
        }
        elements.currentStatus.textContent = `現在の状態: ${displayStatus}`;
        elements.startButton.disabled = true;
        elements.stopButton.disabled = false;
      } else {
        elements.currentStatus.textContent = "現在の状態: 停止中";
        elements.startButton.disabled = false;
        elements.stopButton.disabled = true;
      }
    }
  } catch (error) {
    console.error("❌ ステータス更新エラー:", error);
  }
}

// メッセージ表示
function showMessage(message, type = "info") {
  const messageElement = document.getElementById("message");
  if (!messageElement) return;

  messageElement.textContent = message;
  messageElement.className = `message ${type}`;
  messageElement.style.display = "block";

  setTimeout(() => {
    messageElement.style.display = "none";
  }, 3000);
}

// 定期的にステータス更新
setInterval(updateStatus, 2000);

console.log("✅ Popup Script 初期化完了");
