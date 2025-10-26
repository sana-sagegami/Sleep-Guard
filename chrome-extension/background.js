// ============================================
// ClassGuard Chrome拡張 - Background Script
// Pusher版（Vercelダッシュボード連携）
// ============================================

console.log("🔧 ClassGuard Background Script 開始 (Pusher版)");

// ⚠️ 重要: あなたのVercelダッシュボードURLに変更してください
const DASHBOARD_URL = "https://dashboard-inky-iota-87.vercel.app";

// グローバル変数
let settings = {};
let detectionActive = false;
let currentStatus = "active";
let faceNotDetectedTime = 0;
let detectionIntervalRef = null;
let currentSessionId = null;
let monitoringTabId = null;
let pusher = null;
let channel = null;

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
  console.log("📨 メッセージ受信:", message.action || message.type);

  // Pusher接続リクエスト
  if (message.action === "CONNECT_PUSHER") {
    console.log("🔌 CONNECT_PUSHER request received");
    connectPusher(message.config, message.sessionId)
      .then((success) => {
        console.log("✅ Pusher connection result:", success);
        sendResponse({ success: success });
      })
      .catch((error) => {
        console.error("❌ Pusher connection error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 非同期レスポンスを有効にする
  }

  // Pusher切断リクエスト
  if (message.action === "DISCONNECT_PUSHER") {
    console.log("🔌 DISCONNECT_PUSHER request received");
    disconnectPusher();
    sendResponse({ success: true });
    return true;
  }

  // ステータス送信リクエスト（CORS回避）
  if (message.action === "SEND_STATUS") {
    console.log("📤 SEND_STATUS request received");
    fetch(message.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.data),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("✅ Status sent successfully:", data);
        sendResponse({ success: true, data: data });
      })
      .catch((error) => {
        console.error("❌ Fetch error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 非同期レスポンスを有効にする
  }

  // スマホに撮影トリガーを送信（Pusher経由）
  if (message.action === "TRIGGER_SMARTPHONE") {
    console.log("📸 TRIGGER_SMARTPHONE request received");
    triggerSmartphoneCapture(message.sessionId, message.studentId)
      .then((success) => {
        console.log("✅ Smartphone trigger result:", success);
        sendResponse({ success: success });
      })
      .catch((error) => {
        console.error("❌ Smartphone trigger error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 非同期レスポンスを有効にする
  }

  // 既存のメッセージハンドラー
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
          // 未知のメッセージタイプは無視（エラーにしない）
          console.debug("⚠️ Unknown message type:", message.type);
          sendResponse({ success: false, error: "Unknown message type" });
      }
    } catch (error) {
      console.error("❌ エラー:", error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // 非同期レスポンスを有効にする
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

// ============================================
// Pusher接続（Background経由）
// ============================================

async function connectPusher(config, sessionId) {
  try {
    console.log("🔌 Connecting to Pusher in background...");
    console.log("   Config:", { key: config.key, cluster: config.cluster });
    console.log("   Session ID:", sessionId);

    // Pusherスクリプトを動的に読み込み
    if (!self.Pusher) {
      await loadPusherScript();
    }

    pusher = new Pusher(config.key, {
      cluster: config.cluster,
    });

    const channelName = `session-${sessionId}`;
    console.log("📡 Subscribing to channel:", channelName);

    channel = pusher.subscribe(channelName);

    return new Promise((resolve) => {
      channel.bind("pusher:subscription_succeeded", () => {
        console.log("✅ Pusher connected in background");
        resolve(true);
      });

      channel.bind("pusher:subscription_error", (error) => {
        console.error("❌ Pusher subscription error:", error);
        resolve(false);
      });

      // 先生からのコマンドを受信
      channel.bind("teacher-command", (data) => {
        console.log("📨 Teacher command received:", data);
        // Content scriptに転送
        if (monitoringTabId) {
          chrome.tabs
            .sendMessage(monitoringTabId, {
              action: "TEACHER_COMMAND",
              command: data,
            })
            .catch((err) => {
              console.error("❌ Failed to send command to content:", err);
            });
        }
      });

      // タイムアウト設定
      setTimeout(() => {
        if (!channel.subscribed) {
          console.error("❌ Pusher connection timeout");
          resolve(false);
        }
      }, 10000);
    });
  } catch (error) {
    console.error("❌ Pusher connection error:", error);
    return false;
  }
}

function disconnectPusher() {
  if (channel) {
    channel.unbind_all();
    if (pusher) {
      pusher.unsubscribe(channel.name);
    }
    channel = null;
  }
  if (pusher) {
    pusher.disconnect();
    pusher = null;
  }
  console.log("🔌 Pusher disconnected");
}

// ============================================
// スマホに撮影トリガーを送信
// ============================================

async function triggerSmartphoneCapture(sessionId, studentId) {
  try {
    if (!channel || !channel.subscribed) {
      console.error("❌ Pusher未接続");
      return false;
    }

    console.log("📸 スマホに撮影トリガー送信:", { sessionId, studentId });

    // Pusherでスマホに直接通知（サーバー経由なし）
    // 注意: client-events機能が有効な場合のみ動作
    // client-eventsが無効な場合は、サーバー経由で送信する必要があります

    // サーバー経由で送信（推奨）
    const dashboardUrl =
      settings?.dashboardUrl || "https://dashboard-inky-iota-87.vercel.app";
    const response = await fetch(
      `${dashboardUrl}/api/trigger-smartphone-capture`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId,
          studentId: studentId,
          timestamp: Date.now(),
        }),
      }
    );

    if (response.ok) {
      console.log("✅ 撮影トリガーを送信しました");
      return true;
    } else {
      console.error("❌ 撮影トリガー送信失敗:", response.status);
      return false;
    }
  } catch (error) {
    console.error("❌ 撮影トリガーエラー:", error);
    return false;
  }
}

async function loadPusherScript() {
  return new Promise((resolve, reject) => {
    if (self.Pusher) {
      resolve();
      return;
    }

    try {
      importScripts("https://js.pusher.com/8.2.0/pusher.min.js");

      if (self.Pusher) {
        console.log("✅ Pusher script loaded in background");
        resolve();
      } else {
        reject(new Error("Failed to load Pusher"));
      }
    } catch (error) {
      console.error("❌ Failed to import Pusher script:", error);
      reject(error);
    }
  });
}

console.log("✅ Background Script 初期化完了");
console.log("📡 ダッシュボードURL:", DASHBOARD_URL);
