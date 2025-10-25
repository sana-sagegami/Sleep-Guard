// ============================================
// ClassGuard Chrome拡張 - Background Script
// Pusher版（Vercelダッシュボード連携）
// ============================================

console.log("🔧 ClassGuard Background Script 開始 (Pusher版)");

// ⚠️ 重要: あなたのVercelダッシュボードURLに変更してください
const DASHBOARD_URL = "https://dashboard-inky-iota-87.vercel.app"; // ← ここを変更！

// グローバル変数
let settings = {};
let detectionActive = false;
let currentStatus = "active";
let faceNotDetectedTime = 0;
let detectionIntervalRef = null;
let currentSessionId = null;
let monitoringTabId = null;

// 拡張機能インストール時
chrome.runtime.onInstalled.addListener(() => {
  console.log("🔧 拡張機能インストール");
  chrome.storage.sync.set({
    dashboardUrl: DASHBOARD_URL,
    anonymousId:
      "student_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    studentName: "",
    sessionId: "",
    alertMode: "sound",
    volume: 70,
  });
  console.log("✅ 初期設定完了");
});

// 設定を読み込み
async function loadSettings() {
  const result = await chrome.storage.sync.get([
    "dashboardUrl",
    "anonymousId",
    "studentName",
    "sessionId",
    "alertMode",
    "volume",
  ]);

  settings = {
    dashboardUrl: result.dashboardUrl || DASHBOARD_URL,
    anonymousId: result.anonymousId,
    studentName: result.studentName || "匿名",
    sessionId: result.sessionId,
    alertMode: result.alertMode || "sound",
    volume: result.volume || 70,
  };

  currentSessionId = settings.sessionId;
  console.log("⚙️ 設定読み込み:", settings);
  return settings;
}

// 初期化
loadSettings();

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 メッセージ:", message.type);

  (async () => {
    try {
      switch (message.type) {
        case "SETTINGS_UPDATED":
          settings = message.settings;
          currentSessionId = settings.sessionId;
          console.log("⚙️ 設定更新:", settings);

          if (currentSessionId && !detectionActive) {
            setTimeout(() => startDetection(), 1000);
          }
          sendResponse({ success: true });
          break;

        case "START_DETECTION":
          await startDetection();
          sendResponse({ success: true });
          break;

        case "STOP_DETECTION":
          stopDetection();
          sendResponse({ success: true });
          break;

        case "GET_STATUS":
          sendResponse({
            active: detectionActive,
            status: currentStatus,
            sessionId: currentSessionId,
          });
          break;

        case "CHECK_CONNECTION":
          const result = await testConnection();
          sendResponse(result);
          break;

        default:
          sendResponse({ success: false, error: "Unknown message type" });
      }
    } catch (error) {
      console.error("❌ エラー:", error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true;
});

// 接続テスト
async function testConnection() {
  try {
    const url = `${settings.dashboardUrl}/api/health`;
    console.log("🔍 接続テスト:", url);

    const response = await fetch(url);

    if (response.ok) {
      console.log("✅ ダッシュボード接続成功");
      return { success: true, message: "ダッシュボードに接続成功！" };
    } else {
      console.error("❌ 接続失敗:", response.status);
      return { success: false, message: "接続失敗: " + response.status };
    }
  } catch (error) {
    console.error("❌ 接続エラー:", error);
    return { success: false, message: error.message };
  }
}

// 検知開始
async function startDetection() {
  console.log("🚀 検知開始");

  if (detectionActive) {
    console.log("⚠️ 既に検知中");
    return;
  }

  if (!currentSessionId) {
    console.error("❌ セッションIDが未設定");
    alert("先生画面からセッションIDを取得して設定してください");
    return;
  }

  await loadSettings();

  // アクティブなタブを取得
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    console.error("❌ タブが見つかりません");
    return;
  }

  monitoringTabId = tab.id;
  console.log("📍 監視タブ:", monitoringTabId);

  // Content Scriptを注入
  try {
    await chrome.scripting.executeScript({
      target: { tabId: monitoringTabId },
      files: ["face-api.js", "content.js"],
    });
    console.log("✅ Content Script注入成功");
  } catch (err) {
    console.error("❌ 注入失敗:", err);
    return;
  }

  // 初期化待ち
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 検知開始メッセージ
  try {
    await chrome.tabs.sendMessage(monitoringTabId, {
      type: "START_DETECTION",
    });
    console.log("✅ 検知開始メッセージ送信");
  } catch (err) {
    console.error("❌ メッセージ送信失敗:", err);
    return;
  }

  detectionActive = true;
  faceNotDetectedTime = 0;

  // 1秒ごとに顔検出チェック
  detectionIntervalRef = setInterval(async () => {
    await performFaceDetection();
  }, 1000);

  console.log("✅ 検知開始完了");

  // 初期ステータス送信
  sendStatusToServer("active", false, false);
}

// 検知停止
function stopDetection() {
  console.log("⏹️ 検知停止");

  detectionActive = false;

  if (detectionIntervalRef) {
    clearInterval(detectionIntervalRef);
    detectionIntervalRef = null;
  }

  if (monitoringTabId) {
    chrome.tabs
      .sendMessage(monitoringTabId, {
        type: "STOP_DETECTION",
      })
      .catch(() => console.log("タブが閉じられています"));
  }

  faceNotDetectedTime = 0;
  currentStatus = "active";
  console.log("✅ 検知停止完了");
}

// 顔検出実行
async function performFaceDetection() {
  if (!detectionActive || !monitoringTabId) return;

  try {
    const response = await chrome.tabs.sendMessage(monitoringTabId, {
      type: "CHECK_FACE",
    });

    if (response && response.faceDetected) {
      // 顔検出成功
      faceNotDetectedTime = 0;

      const eyesClosed = response.eyesClosed || false;
      const headDown = response.headDown || false;

      // ステータス判定
      let newStatus = "active";
      if (eyesClosed && headDown) {
        newStatus = "sleeping";
      } else if (eyesClosed || headDown) {
        newStatus = "drowsy";
      }

      if (newStatus !== currentStatus) {
        currentStatus = newStatus;
        console.log("📊 ステータス変更:", newStatus);
        sendStatusToServer(newStatus, eyesClosed, headDown);

        if (newStatus === "sleeping") {
          playAlertSound();
        }
      }
    } else {
      // 顔未検出
      faceNotDetectedTime++;
      console.log(`❌ 顔未検出: ${faceNotDetectedTime}秒`);

      if (faceNotDetectedTime >= 5 && currentStatus !== "drowsy") {
        currentStatus = "drowsy";
        sendStatusToServer("drowsy", true, false);
      } else if (faceNotDetectedTime >= 10 && currentStatus !== "sleeping") {
        currentStatus = "sleeping";
        sendStatusToServer("sleeping", true, true);
        playAlertSound();
      }
    }
  } catch (err) {
    console.error("❌ 顔検出エラー:", err.message);

    if (err.message.includes("Receiving end does not exist")) {
      console.error("Content Scriptが見つかりません");
      stopDetection();
    }
  }
}

// ステータスをサーバーに送信（Pusher経由）
async function sendStatusToServer(status, eyesClosed, headDown) {
  if (!currentSessionId) return;

  try {
    const url = `${settings.dashboardUrl}/api/update-status`;

    const data = {
      sessionId: currentSessionId,
      student: {
        id: settings.anonymousId,
        name: settings.studentName || "匿名",
        status: status,
        eyesClosed: eyesClosed,
        headDown: headDown,
        sleepDuration: faceNotDetectedTime,
        lastUpdate: Date.now(),
      },
    };

    console.log("📤 送信:", status, "→", url);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      const result = await response.json();
      console.log("✅ 送信成功:", result);
    } else {
      const errorText = await response.text();
      console.error("❌ 送信失敗:", response.status, errorText);

      if (response.status === 404) {
        console.error("⚠️ セッションが見つかりません");
        alert(
          "セッションが見つかりません。先生が授業を開始しているか確認してください。"
        );
      }
    }
  } catch (error) {
    console.error("❌ 送信エラー:", error);
  }
}

// アラート音
function playAlertSound() {
  if (settings.alertMode !== "sound" && settings.alertMode !== "both") {
    return;
  }

  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    gainNode.gain.value = (settings.volume || 70) / 100;

    oscillator.start();
    setTimeout(() => oscillator.stop(), 500);

    console.log("🔔 アラート音再生");
  } catch (err) {
    console.error("❌ アラート音エラー:", err);
  }
}

console.log("✅ Background Script 初期化完了");
console.log("📡 ダッシュボードURL:", DASHBOARD_URL);
