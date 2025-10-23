// ============================================
// ClassGuard Chrome拡張 - Popup Script
// 自動保存版
// ============================================

// 自動保存のデバウンスタイマー
let autoSaveTimer = null;

// 設定を読み込んで表示
async function loadSettings() {
  const result = await chrome.storage.sync.get([
    "serverUrl",
    "sessionId",
    "alertMode",
    "volume",
    "anonymousId",
  ]);

  // フォームに値を設定（イベントを発火させないように）
  document.getElementById("serverUrl").value = result.serverUrl || "";
  document.getElementById("sessionId").value = result.sessionId || "";
  document.getElementById("alertMode").value = result.alertMode || "sound";
  document.getElementById("volume").value = result.volume || 70;
  document.getElementById("volumeValue").textContent =
    (result.volume || 70) + "%";
  document.getElementById("anonymousId").textContent =
    result.anonymousId || "未設定";

  // アラートモードに対して音量スライダーの表示切り替え
  toggleVolumeSlider(result.alertMode || "sound");

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
    const sessionIdPattern = /cls_\d+_[a-z0-9]+/i;
    const match = text.match(sessionIdPattern);

    if (match) {
      const sessionId = match[0];
      const currentSessionId = document.getElementById("sessionId").value;

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

  document.getElementById("applySessionId").onclick = async () => {
    document.getElementById("sessionId").value = sessionId;
    notification.style.display = "none";
    showStatus("✅ セッションIDを適用しました", "success");
    // 自動保存を実行
    await autoSaveSettings();
  };

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

    // 検知ステータスも更新
    await updateDetectionStatus();
  } catch (err) {
    console.error("接続状態確認エラー:", err);
  }
}

// 検知ステータスを更新
async function updateDetectionStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_DETECTION_STATUS",
    });

    const detectionStatusEl = document.getElementById("detectionStatus");
    const detectionIconEl = document.getElementById("detectionIcon");
    const detectionTextEl = document.getElementById("detectionText");
    const detectionDetailEl = document.getElementById("detectionDetail");

    // 要素が存在しない場合はスキップ
    if (
      !detectionStatusEl ||
      !detectionIconEl ||
      !detectionTextEl ||
      !detectionDetailEl
    ) {
      console.warn("⚠️ 検知ステータス表示要素が見つかりません");
      return;
    }

    if (!response || !response.active) {
      detectionStatusEl.style.display = "none";
      return;
    }

    detectionStatusEl.style.display = "block";

    // ステータスに応じて表示を変更
    if (response.status === "sleeping") {
      detectionStatusEl.style.background = "#ffebee";
      detectionStatusEl.style.border = "2px solid #ef5350";
      detectionIconEl.textContent = "😴";
      detectionTextEl.textContent = "居眠り検知中";
      detectionTextEl.style.color = "#c62828";
      detectionDetailEl.textContent = `${response.notDetectedTime}秒間顔が検出されていません`;
    } else {
      detectionStatusEl.style.background = "#e8f5e9";
      detectionStatusEl.style.border = "2px solid #66bb6a";
      detectionIconEl.textContent = "😊";
      detectionTextEl.textContent = "起きています";
      detectionTextEl.style.color = "#2e7d32";
      detectionDetailEl.textContent = "正常に監視中";
    }
  } catch (err) {
    console.error("検知ステータス取得エラー:", err);
  }
}

// 自動保存（デバウンス付き）
function scheduleAutoSave() {
  // 既存のタイマーをクリア
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  // 1秒後に保存（連続入力時は保存を遅延）
  autoSaveTimer = setTimeout(() => {
    autoSaveSettings();
  }, 1000);

  // 入力中の表示
  showStatus("💾 入力中...", "info");
}

// 自動保存実行
async function autoSaveSettings() {
  const serverUrl = document.getElementById("serverUrl").value;
  const sessionId = document.getElementById("sessionId").value;
  const alertMode = document.getElementById("alertMode").value;
  const volume = document.getElementById("volume").value;

  // サーバーURLのチェック（必須）
  if (!serverUrl) {
    showStatus("⚠️ サーバーURLを入力してください", "warning");
    return;
  }

  try {
    // 既存の設定を取得（anonymousIdを保持）
    const existingSettings = await chrome.storage.sync.get(["anonymousId"]);

    // 保存
    await chrome.storage.sync.set({
      serverUrl,
      sessionId,
      alertMode,
      volume: parseInt(volume),
    });

    // Background Scriptに通知（anonymousIdも含める）
    await chrome.runtime.sendMessage({
      type: "SETTINGS_UPDATED",
      settings: {
        serverUrl,
        sessionId,
        alertMode,
        volume: parseInt(volume),
        anonymousId: existingSettings.anonymousId,
      },
    });

    console.log("✅ 設定を自動保存しました");
    showStatus("✅ 保存完了", "success");

    // セッションIDが設定されている場合、自動的に検知を開始
    if (sessionId && sessionId.trim() !== "") {
      console.log("🚀 セッションID設定検出 - 検知自動開始");
      await chrome.runtime.sendMessage({
        type: "START_DETECTION",
      });
      showStatus("✅ 保存完了 - 監視開始", "success");
    }

    // 接続状態を更新
    setTimeout(() => {
      checkConnectionStatus();
    }, 500);
  } catch (err) {
    console.error("❌ 自動保存エラー:", err);
    showStatus("❌ 保存に失敗しました", "error");
  }
}

// ステータス表示
function showStatus(message, type = "info") {
  const statusEl = document.getElementById("statusMessage");
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = "status-message " + type;
  statusEl.style.display = "block";

  // 成功メッセージは3秒後に消す
  if (type === "success") {
    setTimeout(() => {
      statusEl.style.display = "none";
    }, 3000);
  }
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
  qrContainer.innerHTML = "";

  try {
    const result = await chrome.storage.sync.get(["anonymousId"]);
    const anonymousId =
      result.anonymousId || "anon_" + Math.random().toString(36).substr(2, 9);

    const pairingInfo = {
      serverUrl: serverUrl,
      anonymousId: anonymousId,
      sessionId: sessionId,
      timestamp: Date.now(),
    };

    const qrData = JSON.stringify(pairingInfo);

    console.log("📱 QRコード生成データ:", pairingInfo);

    new QRCode(qrContainer, {
      text: qrData,
      width: 200,
      height: 200,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });

    console.log("✅ QRコード生成成功");

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
  // 音量変更時も自動保存
  scheduleAutoSave();
}
// アラートモード変更時に音量スライダーの表示を切り替え
function handleAlertModeChange() {
  const alertMode = document.getElementById("alertMode").value;
  toggleVolumeSlider(alertMode);
  autoSaveSettings();
}

// 音量スライダーの表示切替
function toggleVolumeSlider(alertMode) {
  const volumeGroup = document.getElementById("volumeGroup");
  if (alertMode === "sound") {
    volumeGroup.style.display = "block";
  } else {
    volumeGroup.style.display = "none";
  }
}

// イベントリスナー設定
document.addEventListener("DOMContentLoaded", () => {
  // 設定を読み込み
  loadSettings();

  // 入力フィールドの変更を監視して自動保存
  document
    .getElementById("serverUrl")
    .addEventListener("input", scheduleAutoSave);
  document
    .getElementById("sessionId")
    .addEventListener("input", scheduleAutoSave);
  document
    .getElementById("alertMode")
    .addEventListener("change", handleAlertModeChange);
  document
    .getElementById("volume")
    .addEventListener("input", updateVolumeDisplay);

  // QRコード生成ボタン
  document
    .getElementById("generateQR")
    .addEventListener("click", generateQRCode);

  // 定期的に接続状態を確認（10秒ごと）
  setInterval(checkConnectionStatus, 10000);

  // 検知ステータスを定期的に更新（2秒ごと）
  setInterval(updateDetectionStatus, 2000);
});
