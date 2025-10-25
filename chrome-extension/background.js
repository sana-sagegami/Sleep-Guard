// ============================================
// ClassGuard Chrome拡張 - Background Script
// HTTP通信版（Socket.ioなし）- デバッグ版
// ============================================

console.log("🔧 ClassGuard Background Script 開始");

// デフォルトのサーバーURL
const DEFAULT_SERVER_URL =
  "https://epicedian-torrie-subturriculated.ngrok-free.dev";

// グローバル変数
let settings = {};
let detectionActive = false;
let currentStatus = "awake";
let lastSentStatus = "";
let faceNotDetectedTime = 0;
let detectionInterval = null;
let faceDetectionInterval = null;
let currentSessionId = null;
let monitoringTabId = null; // 監視対象のタブID

console.log("📋 変数初期化完了");

// 拡張機能インストール時
chrome.runtime.onInstalled.addListener(() => {
  console.log("🔧 拡張機能インストール処理開始");
  chrome.storage.sync.set({
    serverUrl: DEFAULT_SERVER_URL,
    alertMode: "sound",
    volume: 70,
    anonymousId: "anon_" + Math.random().toString(36).substr(2, 9),
    sessionId: "",
  });

  console.log("✅ デフォルト設定保存完了:", DEFAULT_SERVER_URL);
});

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 メッセージ受信:", message.type);

  // 非同期処理用のハンドラ
  (async () => {
    try {
      switch (message.type) {
        case "SETTINGS_UPDATED":
          // 設定を完全に更新（anonymousIdも含む）
          const newSettings = message.settings;

          // anonymousIdがない場合はストレージから取得
          if (!newSettings.anonymousId) {
            const result = await chrome.storage.sync.get(["anonymousId"]);
            newSettings.anonymousId = result.anonymousId;
          }

          settings = newSettings;
          currentSessionId = settings.sessionId || null;

          console.log("⚙️ 設定更新完了:", settings);
          console.log("   serverUrl:", settings.serverUrl);
          console.log("   sessionId:", currentSessionId);
          console.log("   anonymousId:", settings.anonymousId);

          // セッションIDが設定されていて、まだ検知が開始されていない場合は自動開始
          if (currentSessionId && !detectionActive) {
            console.log("🚀 セッションID検出 - 自動検知開始");
            setTimeout(() => {
              startDetection();
            }, 1000);
          }

          sendResponse({ success: true });
          break;

        case "CHECK_CONNECTION":
          console.log("🔍 接続確認開始...");
          const result = await testServerConnection();
          console.log("✅ 接続確認結果:", result);
          sendResponse(result);
          break;

        case "START_DETECTION":
          console.log("🚀 検知開始指示");
          startDetection();
          sendResponse({ success: true });
          break;

        case "STOP_DETECTION":
          console.log("⏹️ 検知停止指示");
          stopDetection();
          sendResponse({ success: true });
          break;

        case "FACE_DETECTED":
          handleFaceDetection(message.detected);
          sendResponse({ success: true });
          break;

        case "SET_SESSION_ID":
          currentSessionId = message.sessionId;
          await chrome.storage.sync.set({ sessionId: message.sessionId });
          console.log("📋 セッションID設定:", currentSessionId);
          sendResponse({ success: true });
          break;

        case "GET_DETECTION_STATUS":
          console.log("📊 検知ステータス要求受信");
          console.log("   detectionActive:", detectionActive);
          console.log("   currentStatus:", currentStatus);
          console.log("   faceNotDetectedTime:", faceNotDetectedTime);
          console.log("   currentSessionId:", currentSessionId);

          const statusResponse = {
            active: detectionActive,
            status: currentStatus,
            notDetectedTime: faceNotDetectedTime,
            sessionId: currentSessionId,
          };

          console.log("✅ 返信データ:", statusResponse);
          sendResponse(statusResponse);
          break;

        default:
          console.warn("⚠️ 未知のメッセージ:", message.type);
          sendResponse({ success: false, error: "未知のメッセージタイプ" });
      }
    } catch (err) {
      console.error("❌ メッセージ処理エラー:", err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true;
});

// 設定を読み込み
async function loadSettings() {
  console.log("📖 設定読み込み開始...");

  try {
    const result = await chrome.storage.sync.get([
      "serverUrl",
      "sessionId",
      "alertMode",
      "volume",
      "anonymousId",
    ]);

    settings = result;

    // デフォルトサーバーURL設定
    if (!settings.serverUrl) {
      settings.serverUrl = DEFAULT_SERVER_URL;
      await chrome.storage.sync.set({ serverUrl: DEFAULT_SERVER_URL });
      console.log("🔧 デフォルトURL設定:", DEFAULT_SERVER_URL);
    }

    currentSessionId = settings.sessionId || null;
    console.log("✅ 設定読み込み完了:", {
      serverUrl: settings.serverUrl,
      sessionId: currentSessionId || "未設定",
      anonymousId: settings.anonymousId,
    });
  } catch (err) {
    console.error("❌ 設定読み込みエラー:", err);
  }
}

// サーバー接続テスト（改良版）
async function testServerConnection() {
  console.log("🧪 サーバー接続テスト開始");

  if (!settings.serverUrl) {
    console.warn("⚠️ サーバーURL未設定");
    return {
      connected: false,
      sessionId: currentSessionId,
      error: "サーバーURL未設定",
    };
  }

  try {
    console.log("🌐 接続先:", settings.serverUrl);

    // CORSとngrok対応の改善
    const response = await fetch(settings.serverUrl, {
      method: "GET",
      headers: {
        "ngrok-skip-browser-warning": "true",
        Accept: "application/json, text/html, */*",
      },
      // タイムアウトを追加
      signal: AbortSignal.timeout(10000), // 10秒
    });

    console.log("📊 レスポンス状態:", response.status, response.statusText);

    const result = {
      connected: response.ok,
      sessionId: currentSessionId,
      serverStatus: response.status,
      serverUrl: settings.serverUrl,
    };

    console.log("✅ 接続テスト結果:", result);
    return result;
  } catch (err) {
    console.error("❌ 接続テストエラー:", err.message);

    // より詳細なエラー情報
    let errorMessage = err.message;
    if (err.name === "TimeoutError") {
      errorMessage = "接続タイムアウト（サーバーが応答しません）";
    } else if (err.name === "TypeError") {
      errorMessage = "ネットワークエラー（サーバーURLを確認してください）";
    }

    return {
      connected: false,
      sessionId: currentSessionId,
      error: errorMessage,
      serverUrl: settings.serverUrl,
    };
  }
}

// ...existing code...

// 検知開始
function startDetection() {
  console.log("🚀 検知開始処理");

  if (detectionActive) {
    console.log("ℹ️ 既に検知中");
    return;
  }

  if (!currentSessionId) {
    console.warn("⚠️ セッションID未設定");
    return;
  }

  if (!settings.serverUrl) {
    console.warn("⚠️ サーバーURL未設定");
    return;
  }

  console.log("👁️ 居眠り検知開始");
  console.log("   サーバー:", settings.serverUrl);
  console.log("   セッションID:", currentSessionId);
  console.log("   学生ID:", settings.anonymousId);

  detectionActive = true;
  faceNotDetectedTime = 0;
  lastSentStatus = "";

  // Content Scriptに通知（注入も試行）
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (tabs[0]?.id) {
      const tab = tabs[0];

      // 監視対象のタブIDを保存
      monitoringTabId = tab.id;
      console.log("📋 監視対象タブID保存:", monitoringTabId);

      // 特殊ページはスキップ
      if (
        tab.url &&
        (tab.url.startsWith("chrome://") ||
          tab.url.startsWith("edge://") ||
          tab.url.startsWith("about:"))
      ) {
        console.warn("⚠️ 特殊ページのため検知をスキップ:", tab.url);
        return;
      }

      try {
        // まずメッセージ送信を試行
        await chrome.tabs.sendMessage(tab.id, { type: "START_DETECTION" });
        console.log("✅ Content Scriptに検知開始通知成功");
      } catch (err) {
        console.warn("⚠️ Content Script未読み込み、注入を試行");

        try {
          // Content Scriptを注入（face-api.jsも含める）
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["face-api.js", "content.js"], // ← ここを修正！
          });
          console.log("✅ Content Script注入成功");

          // 3秒待って初期化を待つ（face-api.jsの読み込みに時間がかかる）
          await new Promise((resolve) => setTimeout(resolve, 3000)); // ← 2秒→3秒に変更

          // 再度検知開始を送信
          await chrome.tabs.sendMessage(tab.id, { type: "START_DETECTION" });
          console.log("✅ 検知開始メッセージ送信成功");
        } catch (injectErr) {
          console.error("❌ Content Script注入失敗:", injectErr.message);
        }
      }
    }
  });

  // 10秒ごとに定期送信
  detectionInterval = setInterval(() => {
    console.log("🔍 定期ステータス送信");
    sendStatusToServer(currentStatus);
  }, 10000);

  // 顔検出を1秒ごとに実行
  faceDetectionInterval = setInterval(() => {
    detectFace();
  }, 1000);

  // 初回ステータス送信（即座に）
  console.log("📤 初回ステータス送信");
  sendStatusToServer("awake");
}

// 検知停止
function stopDetection() {
  console.log("⏹️ 検知停止処理");

  if (!detectionActive) {
    console.log("ℹ️ 検知は既に停止中");
    return;
  }

  detectionActive = false;

  // 定期ステータス送信を停止
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
    console.log("✅ 定期ステータス送信停止");
  }

  // 顔検出を停止
  if (faceDetectionInterval) {
    clearInterval(faceDetectionInterval);
    faceDetectionInterval = null;
    console.log("✅ 顔検出停止");
  }

  // Content Scriptに停止通知
  if (monitoringTabId) {
    chrome.tabs
      .sendMessage(monitoringTabId, { type: "STOP_DETECTION" })
      .catch((err) => console.log("📱 Content Script通信エラー:", err.message));

    // 監視対象タブIDをクリア
    monitoringTabId = null;
    console.log("✅ 監視対象タブIDクリア");
  }

  console.log("✅ 検知停止完了");
}

// 顔検出を実行
async function detectFace() {
  console.log("🔍 顔検出開始 (経過: " + faceNotDetectedTime + "秒)");

  if (!monitoringTabId) {
    console.warn("⚠️ 監視対象タブIDが設定されていません");
    faceNotDetectedTime += 1;
    checkSleepingStatus();
    return;
  }

  try {
    // タブの存在確認
    const tab = await chrome.tabs.get(monitoringTabId);
    console.log("✅ 監視対象タブ確認:", tab.id, tab.url);

    // 特殊ページのチェック
    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:")
    ) {
      console.warn("⚠️ 特殊ページのため顔検出スキップ:", tab.url);
      faceNotDetectedTime += 1;
      checkSleepingStatus();
      return;
    }

    console.log("📤 顔検出メッセージ送信:", monitoringTabId);

    // タイムアウト付きでメッセージ送信
    const response = await Promise.race([
      chrome.tabs.sendMessage(monitoringTabId, {
        type: "DETECT_FACE",
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("タイムアウト")), 5000)
      ),
    ]);

    console.log("📥 顔検出レスポンス:", response);

    if (response && response.faceDetected) {
      console.log("✅ 顔検出: あり");
      faceNotDetectedTime = 0;
      updateStatus("awake");

      // sleeping状態から復帰
      if (currentStatus !== "awake") {
        console.log("😊 顔検出により起床状態に復帰");
        updateStatus("awake");
      }
    } else {
      console.log(
        "❌ 顔検出: なし (カウント: " + (faceNotDetectedTime + 1) + "秒)"
      );
      faceNotDetectedTime += 1;
      checkSleepingStatus();
    }
  } catch (err) {
    console.error("❌ 顔検出エラー:", err.message);

    // エラーの種類を判定
    if (err.message === "タイムアウト") {
      console.error("   Content Scriptが応答しません。カメラ初期化中の可能性があります。");
      // タイムアウト時はカウントを増やさない（初期化待ち）
      return;
    } else if (err.message.includes("Receiving end does not exist")) {
      console.error("   Content Scriptが読み込まれていません。注入を試行します。");
      
      // Content Scriptを注入
      try {
        await chrome.scripting.executeScript({
          target: { tabId: monitoringTabId },
          files: ["face-api.min.js", "content.js"],
        });
        console.log("✅ Content Script注入成功");
        
        // 2秒待ってからSTART_DETECTIONを送信
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        await chrome.tabs.sendMessage(monitoringTabId, {
          type: "START_DETECTION",
        });
        console.log("✅ 検知開始メッセージ送信成功");
        
        // さらに1秒待ってから顔検出を再試行
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return; // この回の顔検出はスキップ
      } catch (injectErr) {
        console.error("❌ Content Script注入失敗:", injectErr);
      }
    }

    // その他のエラー時はカウント増加
    faceNotDetectedTime += 1;
    console.log("⚠️ エラーによりカウント増加:", faceNotDetectedTime + "秒");
    checkSleepingStatus();
  }
}


// 居眠り状態をチェック
function checkSleepingStatus() {
  console.log("📊 居眠りチェック:", {
    faceNotDetectedTime: faceNotDetectedTime,
    閾値: 10,
    判定: faceNotDetectedTime >= 10 ? "居眠り" : "起きている",
  });

  if (faceNotDetectedTime >= 10) {
    console.log(`🚨 ${faceNotDetectedTime}秒間顔未検出 → 居眠り判定`);
    updateStatus("sleeping");
  }
}

// ステータス更新
function updateStatus(newStatus) {
  const oldStatus = currentStatus;
  currentStatus = newStatus;
  console.log(`📊 ステータス更新: ${oldStatus} → ${newStatus}`);

  // サーバーへ送信（ステータスが変わった場合のみ）
  if (newStatus !== lastSentStatus) {
    console.log("📤 サーバーへステータス送信準備");
    sendStatusToServer(newStatus);
  }
}

// 顔検出結果処理
function handleFaceDetection(detected) {
  if (!detectionActive) return;

  if (!detected) {
    faceNotDetectedTime++;
    console.log("😴 顔未検出:", faceNotDetectedTime + "秒");

    if (faceNotDetectedTime >= 10 && currentStatus !== "sleeping") {
      console.log("💤 居眠り判定");
      currentStatus = "sleeping";
      onSleepingDetected();
    }
  } else {
    if (faceNotDetectedTime > 0) {
      console.log("👀 顔検出復帰");
    }
    faceNotDetectedTime = 0;

    if (currentStatus !== "awake") {
      console.log("😊 起床判定");
      currentStatus = "awake";
      onAwakeDetected();
    }
  }
}

// 状態チェック
function checkStatus() {
  console.log("📊 状態チェック:", currentStatus, "前回送信:", lastSentStatus);

  if (currentStatus !== lastSentStatus && currentSessionId) {
    console.log("📤 ステータス変更検出、送信開始");
    sendStatusToServer(currentStatus);
  } else {
    console.log("ℹ️ ステータス変更なし、送信スキップ");
  }
}

// サーバーにステータス送信
async function sendStatusToServer(status) {
  console.log("📤 ステータス送信開始:", status);

  if (!settings.serverUrl || !currentSessionId) {
    console.warn("⚠️ 送信に必要な情報が不足");
    console.warn("   serverUrl:", settings.serverUrl);
    console.warn("   sessionId:", currentSessionId);
    return;
  }

  // anonymousIdが未設定の場合は取得
  if (!settings.anonymousId) {
    console.warn("⚠️ anonymousId未設定 - 設定を再読み込み");
    await loadSettings();
    if (!settings.anonymousId) {
      console.error("❌ anonymousIdの取得に失敗");
      return;
    }
  }

  try {
    const url = `${settings.serverUrl}/api/status`;
    const data = {
      sessionId: currentSessionId,
      studentId: settings.anonymousId,
      status: status,
      timestamp: Date.now(),
    };

    console.log("🌐 送信先:", url);
    console.log("📋 送信データ:", data);
    console.log("   sessionId:", data.sessionId, "型:", typeof data.sessionId);
    console.log("   studentId:", data.studentId, "型:", typeof data.studentId);
    console.log("   status:", data.status, "型:", typeof data.status);
    console.log("   timestamp:", data.timestamp, "型:", typeof data.timestamp);

    // データ検証
    if (!data.sessionId || !data.studentId || !data.status) {
      console.error("❌ 送信データが不完全です！");
      console.error("   sessionId:", data.sessionId);
      console.error("   studentId:", data.studentId);
      console.error("   status:", data.status);
      return;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(data),
    });

    console.log("📊 送信レスポンス:", response.status, response.statusText);

    if (response.ok) {
      const result = await response.json();
      lastSentStatus = status;
      console.log("✅ ステータス送信成功:", result);
    } else {
      const errorText = await response.text();
      console.error("❌ ステータス送信失敗:", response.status);
      console.error("   エラー詳細:", errorText);

      // エラー内容をパース
      try {
        const errorJson = JSON.parse(errorText);
        console.error("   エラーメッセージ:", errorJson.error);

        // 404エラー（セッション未発見）の場合
        if (response.status === 404) {
          console.error("⚠️ セッションが見つかりません！");
          console.error("   使用したセッションID:", data.sessionId);
          console.error(
            "   利用可能なセッション:",
            errorJson.availableSessions
          );
          console.error(
            "💡 対処法: 教師が授業を開始しているか確認してください"
          );

          // 検知を一時停止
          if (detectionActive) {
            console.log("⏸️ 検知を一時停止します");
            stopDetection();
          }
        }
      } catch (e) {
        // HTMLエラーページの場合（ngrokエラーなど）
        if (
          errorText.includes("ngrok") &&
          errorText.includes("connection refused")
        ) {
          console.error("❌ サーバーが起動していません！");
          console.error("💡 対処法: サーバーを起動してください (npm start)");
        } else {
          console.error("   レスポンステキスト:", errorText.substring(0, 200));
        }
      }
    }
  } catch (err) {
    console.error("❌ ステータス送信エラー:", err.message);
    console.error("   スタックトレース:", err.stack);
  }
}

// 居眠り検知時の処理
function onSleepingDetected() {
  console.log("😴💤 居眠り検知！");
  sendStatusToServer("sleeping");

  // 簡易アラート
  chrome.notifications.create({
    type: "basic",
    iconUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    title: "ClassGuard",
    message: "⚠️ 居眠りを検知しました！",
    priority: 2,
  });
}

// 起床検知時の処理
function onAwakeDetected() {
  console.log("😊 起床検知");
  sendStatusToServer("awake");
}

// 初期化
console.log("🚀 初期化開始");
loadSettings()
  .then(() => {
    console.log("✅ Background Script初期化完了");
  })
  .catch((err) => {
    console.error("❌ 初期化エラー:", err);
  });
