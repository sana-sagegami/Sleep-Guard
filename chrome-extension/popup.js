// ============================================
// ClassGuard Chrome拡張 - Popup Script
// シンプル版（セッションURL自動抽出）
// ============================================

console.log("🎨 Popup Script 開始");

// DOM要素
let elements = {};

// 初期化
document.addEventListener("DOMContentLoaded", async () => {
  console.log("📄 DOM読み込み完了");

  // DOM要素を取得
  elements = {
    sessionUrl: document.getElementById("sessionUrl"),
    extractButton: document.getElementById("extractButton"),
    dashboardUrl: document.getElementById("dashboardUrl"),
    sessionId: document.getElementById("sessionId"),
    studentName: document.getElementById("studentName"),
    anonymousId: document.getElementById("anonymousId"),
    alertMode: document.getElementById("alertMode"),
    volume: document.getElementById("volume"),
    volumeValue: document.getElementById("volumeValue"),
    saveButton: document.getElementById("saveButton"),
    testButton: document.getElementById("testButton"),
    startButton: document.getElementById("startButton"),
    stopButton: document.getElementById("stopButton"),
    connectionStatus: document.getElementById("connectionStatus"),
    detectionStatus: document.getElementById("detectionStatus"),
    currentStatus: document.getElementById("currentStatus"),
    currentStatusRow: document.getElementById("currentStatusRow"),
    sessionInfo: document.getElementById("sessionInfo"),
    currentSessionId: document.getElementById("currentSessionId"),
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
    elements.currentSessionId.textContent = result.sessionId;
    elements.sessionInfo.style.display = "block";
  }

  if (result.studentName) {
    elements.studentName.value = result.studentName;
  }

  if (result.anonymousId) {
    elements.anonymousId.textContent = result.anonymousId;
  } else {
    // 匿名ID生成
    const newId =
      "student_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    await chrome.storage.sync.set({ anonymousId: newId });
    elements.anonymousId.textContent = newId;
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
  // URL抽出ボタン
  elements.extractButton.addEventListener("click", extractFromUrl);

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

// URLから自動抽出
function extractFromUrl() {
  const url = elements.sessionUrl.value.trim();

  if (!url) {
    showMessage("URLを入力してください", "error");
    return;
  }

  try {
    const urlObj = new URL(url);

    // ダッシュボードURL抽出
    const dashboardUrl = `${urlObj.protocol}//${urlObj.host}`;

    // セッションID抽出
    let sessionId = urlObj.searchParams.get("session");

    if (!sessionId) {
      // パスから抽出を試みる
      const pathMatch = urlObj.pathname.match(/\/session\/([^\/]+)/);
      if (pathMatch) {
        sessionId = pathMatch[1];
      }
    }

    if (!dashboardUrl || !sessionId) {
      showMessage("URLからセッションIDを抽出できませんでした", "error");
      return;
    }

    // フィールドに設定
    elements.dashboardUrl.value = dashboardUrl;
    elements.sessionId.value = sessionId;

    console.log("✅ URL抽出成功:", { dashboardUrl, sessionId });
    showMessage(
      `✅ 抽出成功！\nダッシュボード: ${dashboardUrl}\nセッションID: ${sessionId}`,
      "success"
    );

    // 自動保存
    setTimeout(() => {
      saveSettings();
    }, 500);
  } catch (error) {
    console.error("❌ URL抽出エラー:", error);
    showMessage("無効なURLです。正しいURLを入力してください", "error");
  }
}

// 設定を保存
async function saveSettings() {
  console.log("💾 設定保存開始");

  const settings = {
    dashboardUrl: elements.dashboardUrl.value.trim(),
    sessionId: elements.sessionId.value.trim(),
    studentName: elements.studentName.value.trim() || "匿名",
    anonymousId: elements.anonymousId.textContent,
    alertMode: elements.alertMode.value,
    volume: parseInt(elements.volume.value),
  };

  // バリデーション
  if (!settings.dashboardUrl) {
    showMessage("ダッシュボードURLが設定されていません", "error");
    return;
  }

  if (!settings.sessionId) {
    showMessage("セッションIDが設定されていません", "error");
    return;
  }

  try {
    // Chromeストレージに保存
    await chrome.storage.sync.set(settings);

    // Backgroundスクリプトに通知
    const response = await chrome.runtime.sendMessage({
      type: "SETTINGS_UPDATED",
      settings: settings,
    });

    if (response && response.success) {
      console.log("✅ 設定保存完了");
      showMessage("✅ 設定を保存しました！", "success");

      // セッション情報を表示
      elements.currentSessionId.textContent = settings.sessionId;
      elements.sessionInfo.style.display = "block";

      // 接続状態を更新
      updateStatus();
    } else {
      console.error("❌ 設定保存失敗");
      showMessage("設定の保存に失敗しました", "error");
    }
  } catch (error) {
    console.error("❌ 保存エラー:", error);
    showMessage("エラーが発生しました: " + error.message, "error");
  }
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
      showMessage("✅ ダッシュボードに接続できました！", "success");
      updateConnectionStatus(true);
    } else {
      console.error("❌ 接続失敗:", response?.message);
      showMessage(
        "❌ 接続失敗: " + (response?.message || "不明なエラー"),
        "error"
      );
      updateConnectionStatus(false);
    }
  } catch (error) {
    console.error("❌ 接続テストエラー:", error);
    showMessage("❌ 接続テストでエラーが発生しました", "error");
    updateConnectionStatus(false);
  } finally {
    elements.testButton.disabled = false;
    elements.testButton.textContent = "🔍 接続テスト";
  }
}

// 接続ステータス更新
function updateConnectionStatus(connected) {
  const html = connected
    ? '<span class="status-indicator active"></span> 接続OK'
    : '<span class="status-indicator inactive"></span> 未接続';
  elements.connectionStatus.innerHTML = html;
}

// 検知開始
async function startDetection() {
  console.log("🚀 検知開始");

  if (!elements.sessionId.value) {
    showMessage("❌ セッションIDが設定されていません", "error");
    return;
  }

  elements.startButton.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "START_DETECTION",
    });

    if (response && response.success) {
      console.log("✅ 検知開始成功");
      showMessage("✅ 居眠り検知を開始しました！", "success");
      updateStatus();
    } else {
      console.error("❌ 検知開始失敗");
      showMessage("❌ 検知の開始に失敗しました", "error");
      elements.startButton.disabled = false;
    }
  } catch (error) {
    console.error("❌ 検知開始エラー:", error);
    showMessage("❌ エラーが発生しました: " + error.message, "error");
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
      showMessage("⏹️ 居眠り検知を停止しました", "info");
      updateStatus();
    } else {
      console.error("❌ 検知停止失敗");
      showMessage("❌ 検知の停止に失敗しました", "error");
      elements.stopButton.disabled = false;
    }
  } catch (error) {
    console.error("❌ 検知停止エラー:", error);
    showMessage("❌ エラーが発生しました: " + error.message, "error");
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
      // 検知ステータス更新
      if (response.active) {
        elements.detectionStatus.innerHTML =
          '<span class="status-indicator detecting"></span> 検知中';
        elements.startButton.disabled = true;
        elements.stopButton.disabled = false;
        elements.currentStatusRow.style.display = "flex";

        // 現在の状態を表示
        let statusText = "✅ 集中中";
        if (response.status === "drowsy") {
          statusText = "😪 眠そう";
        } else if (response.status === "sleeping") {
          statusText = "😴 居眠り検出";
        }
        elements.currentStatus.textContent = statusText;
      } else {
        elements.detectionStatus.innerHTML =
          '<span class="status-indicator inactive"></span> 停止中';
        elements.startButton.disabled = false;
        elements.stopButton.disabled = true;
        elements.currentStatusRow.style.display = "none";
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
  }, 5000);
}

// 定期的にステータス更新（2秒ごと）
setInterval(updateStatus, 2000);

console.log("✅ Popup Script 初期化完了");
