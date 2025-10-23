// ============================================
// ClassGuard Chrome拡張 - Popup Script
// セッションID対応版
// ============================================

// 設定を読み込んで表示
async function loadSettings() {
  const result = await chrome.storage.sync.get([
    "serverUrl",
    "sessionId",
    "alertMode",
    "volume",
    "anonymousId",
  ]);

  // フォームに値を設定
  document.getElementById("serverUrl").value = result.serverUrl || "";
  document.getElementById("sessionId").value = result.sessionId || "";
  document.getElementById("alertMode").value = result.alertMode || "sound";
  document.getElementById("volume").value = result.volume || 70;
  document.getElementById("anonymousId").textContent =
    result.anonymousId || "未設定";

  // URLパラメータからセッションIDを自動取得
  await checkUrlParameters();

  // クリップボードからセッションIDを自動検出
  await checkClipboard();

  // 接続状態を確認
  checkConnectionStatus();
}

// URLパラメータからセッションIDを取得
async function checkUrlParameters() {
  try {
    // 現在のタブを取得
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (tab && tab.url) {
      const url = new URL(tab.url);
      const sessionId = url.searchParams.get("session");

      if (sessionId && sessionId.startsWith("cls_")) {
        console.log("📋 URLからセッションID検出:", sessionId);
        document.getElementById("sessionId").value = sessionId;

        // 自動保存するか確認
        showAutoFillNotification(
          "URLからセッションIDを検出しました",
          sessionId
        );
      }
    }
  } catch (err) {
    console.log("URLパラメータチェック:", err.message);
  }
}

// クリップボードからセッションIDを検出
async function checkClipboard() {
  try {
    const text = await navigator.clipboard.readText();

    // セッションIDのパターン: cls_数字_英数字
    const sessionIdPattern = /cls_\d+_[a-z0-9]+/i;
    const match = text.match(sessionIdPattern);

    if (match) {
      const sessionId = match[0];
      const currentSessionId = document.getElementById("sessionId").value;

      // 既に入力されていない場合のみ提案
      if (!currentSessionId || currentSessionId !== sessionId) {
        console.log("📋 クリップボードからセッションID検出:", sessionId);
        showAutoFillNotification(
          "クリップボードからセッションIDを検出しました",
          sessionId
        );
      }
    }
  } catch (err) {
    console.log("クリップボードチェック:", err.message);
  }
}

// 自動入力通知を表示
function showAutoFillNotification(message, sessionId) {
  const notification = document.getElementById("autoFillNotification");
  const messageEl = document.getElementById("autoFillMessage");
  const sessionIdEl = document.getElementById("autoFillSessionId");

  messageEl.textContent = message;
  sessionIdEl.textContent = sessionId;
  notification.style.display = "block";

  // 適用ボタンのイベント
  document.getElementById("applySessionId").onclick = () => {
    document.getElementById("sessionId").value = sessionId;
    notification.style.display = "none";
    showStatus("✅ セッションIDを適用しました", "success");
  };

  // キャンセルボタンのイベント
  document.getElementById("cancelSessionId").onclick = () => {
    notification.style.display = "none";
  };
}

// 接続状態を確認
async function checkConnectionStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "CHECK_CONNECTION",
    });
    const statusElement = document.getElementById("connectionStatus");
    const sessionElement = document.getElementById("currentSession");

    if (response.connected) {
      statusElement.textContent = "✅ 接続中";
      statusElement.style.color = "#34c759";

      if (response.sessionId) {
        sessionElement.textContent = `セッション: ${response.sessionId}`;
        sessionElement.style.display = "block";
      } else {
        sessionElement.textContent = "⚠️ セッションID未設定";
        sessionElement.style.color = "#ff9500";
        sessionElement.style.display = "block";
      }
    } else {
      statusElement.textContent = "❌ 未接続";
      statusElement.style.color = "#ff3b30";
      sessionElement.style.display = "none";
    }
  } catch (err) {
    console.error("接続状態確認エラー:", err);
  }
}

// 設定を保存
async function saveSettings() {
  const serverUrl = document.getElementById("serverUrl").value;
  const sessionId = document.getElementById("sessionId").value;
  const alertMode = document.getElementById("alertMode").value;
  const volume = document.getElementById("volume").value;

  // 入力チェック
  if (!serverUrl) {
    alert("サーバーURLを入力してください");
    return;
  }

  // 保存
  await chrome.storage.sync.set({
    serverUrl,
    sessionId,
    alertMode,
    volume: parseInt(volume),
  });

  // Background Scriptに通知
  await chrome.runtime.sendMessage({
    type: "SETTINGS_UPDATED",
    settings: {
      serverUrl,
      sessionId,
      alertMode,
      volume: parseInt(volume),
    },
  });

  // 保存完了メッセージ
  const saveBtn = document.getElementById("saveBtn");
  const originalText = saveBtn.textContent;
  saveBtn.textContent = "✅ 保存完了";
  saveBtn.disabled = true;

  setTimeout(() => {
    saveBtn.textContent = originalText;
    saveBtn.disabled = false;
    checkConnectionStatus();
  }, 1500);
}

// ステータス表示
function showStatus(message, type = "info") {
  const statusEl = document.getElementById("statusMessage");
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = "status-message " + type;
  statusEl.style.display = "block";

  setTimeout(() => {
    statusEl.style.display = "none";
  }, 3000);
}

// QRコード生成
async function generateQRCode() {
  const sessionId = document.getElementById("sessionId").value.trim();
  const serverUrl = document.getElementById("serverUrl").value.trim();

  if (!sessionId) {
    alert("先にセッションIDを入力してください");
    return;
  }

  if (!serverUrl) {
    alert("先にサーバーURLを入力してください");
    return;
  }

  const qrContainer = document.getElementById("qrcode");
  qrContainer.innerHTML = ""; // クリア

  try {
    // 匿名IDを取得
    const result = await chrome.storage.sync.get(["anonymousId"]);
    const anonymousId =
      result.anonymousId || "anon_" + Math.random().toString(36).substr(2, 9);

    // スマホPWA用のペアリング情報を生成
    const pairingInfo = {
      serverUrl: serverUrl,
      anonymousId: anonymousId,
      sessionId: sessionId,
      timestamp: Date.now(),
    };

    // JSON文字列に変換
    const qrData = JSON.stringify(pairingInfo);

    console.log("📱 QRコード生成データ:", pairingInfo);

    // QRコードを生成
    new QRCode(qrContainer, {
      text: qrData,
      width: 200,
      height: 200,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });

    console.log("✅ QRコード生成成功");

    // QRコードの説明を追加
    const description = document.createElement("p");
    description.style.marginTop = "10px";
    description.style.fontSize = "12px";
    description.style.color = "#666";
    description.style.textAlign = "center";
    description.textContent = "スマホでこのQRコードをスキャンしてください";
    qrContainer.appendChild(description);

    document.getElementById("qrSection").style.display = "block";
  } catch (err) {
    console.error("❌ QRコード生成エラー:", err);
    alert("QRコード生成に失敗しました");
  }
}

// ボリューム値の表示を更新
function updateVolumeDisplay() {
  const volume = document.getElementById("volume").value;
  document.getElementById("volumeValue").textContent = volume + "%";
}

// イベントリスナー設定
document.addEventListener("DOMContentLoaded", () => {
  // 設定を読み込み
  loadSettings();

  // 保存ボタン
  document.getElementById("saveBtn").addEventListener("click", saveSettings);

  // QRコード生成ボタン
  document
    .getElementById("generateQR")
    .addEventListener("click", generateQRCode);

  // ボリュームスライダー
  document
    .getElementById("volume")
    .addEventListener("input", updateVolumeDisplay);

  // 定期的に接続状態を確認
  setInterval(checkConnectionStatus, 5000);
});
