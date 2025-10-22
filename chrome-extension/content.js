// ============================================
// ClassGuard Chrome拡張 - Content Script
// 顔検出とカメラ処理（視覚的フィードバック付き）
// ============================================

let video = null;
let canvas = null;
let detectionInterval = null;
let isDetecting = false;
let statusIndicator = null;
let faceDetected = false;

// 顔検出ライブラリ（face-api.js）を動的に読み込み
async function loadFaceAPI() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// 検知状態インジケーターを作成
function createStatusIndicator() {
  if (statusIndicator) return;

  // メインコンテナ
  const container = document.createElement("div");
  container.id = "classguard-status";
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    background: rgba(0, 0, 0, 0.85);
    border-radius: 12px;
    padding: 16px 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    min-width: 200px;
    backdrop-filter: blur(10px);
  `;

  // タイトル
  const title = document.createElement("div");
  title.style.cssText = `
    color: #ffffff;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  title.innerHTML = "👁️ ClassGuard";

  // ステータス表示
  const status = document.createElement("div");
  status.id = "classguard-status-text";
  status.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
  `;

  // ステータスドット
  const dot = document.createElement("div");
  dot.id = "classguard-status-dot";
  dot.style.cssText = `
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #888;
    transition: all 0.3s ease;
    box-shadow: 0 0 10px currentColor;
  `;

  // ステータステキスト
  const text = document.createElement("div");
  text.id = "classguard-status-label";
  text.style.cssText = `
    color: #ffffff;
    font-size: 13px;
    flex: 1;
  `;
  text.textContent = "待機中...";

  status.appendChild(dot);
  status.appendChild(text);
  container.appendChild(title);
  container.appendChild(status);

  // カウンター（顔未検出時間）
  const counter = document.createElement("div");
  counter.id = "classguard-counter";
  counter.style.cssText = `
    margin-top: 8px;
    padding: 8px;
    border-radius: 6px;
    background: rgba(255, 59, 48, 0.15);
    color: #ff3b30;
    font-size: 12px;
    text-align: center;
    display: none;
  `;
  counter.textContent = "未検出: 0秒";
  container.appendChild(counter);

  document.body.appendChild(container);
  statusIndicator = container;
}

// ステータスを更新
function updateStatus(detected, elapsedTime = 0) {
  if (!statusIndicator) return;

  const dot = document.getElementById("classguard-status-dot");
  const label = document.getElementById("classguard-status-label");
  const counter = document.getElementById("classguard-counter");

  if (detected) {
    // 顔検出中
    dot.style.background = "#34c759";
    dot.style.boxShadow = "0 0 15px #34c759";
    label.textContent = "✅ 顔検出中";
    label.style.color = "#34c759";
    counter.style.display = "none";
    faceDetected = true;
  } else {
    // 顔未検出
    dot.style.background = "#ff3b30";
    dot.style.boxShadow = "0 0 15px #ff3b30";
    label.textContent = "❌ 顔未検出";
    label.style.color = "#ff3b30";

    if (elapsedTime > 0) {
      counter.style.display = "block";
      counter.textContent = `⏱️ 未検出: ${elapsedTime}秒`;

      // 警告レベルに応じて色を変更
      if (elapsedTime >= 45) {
        counter.style.background = "rgba(255, 59, 48, 0.3)";
        counter.style.fontWeight = "bold";
      } else if (elapsedTime >= 30) {
        counter.style.background = "rgba(255, 149, 0, 0.2)";
        counter.style.color = "#ff9500";
      }
    }
    faceDetected = false;
  }
}

// 検知停止時のステータス
function setIdleStatus() {
  if (!statusIndicator) return;

  const dot = document.getElementById("classguard-status-dot");
  const label = document.getElementById("classguard-status-label");
  const counter = document.getElementById("classguard-counter");

  dot.style.background = "#888";
  dot.style.boxShadow = "0 0 10px #888";
  label.textContent = "待機中...";
  label.style.color = "#aaa";
  counter.style.display = "none";
}

// カメラを初期化
async function initCamera() {
  try {
    // 既存のビデオ要素を削除
    if (video) {
      const stream = video.srcObject;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      video.remove();
    }

    // 新しいビデオ要素を作成（非表示）
    video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.style.display = "none";
    document.body.appendChild(video);

    // カメラストリームを取得
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 640,
        height: 480,
        facingMode: "user", // フロントカメラを使用
      },
    });

    video.srcObject = stream;
    await video.play();

    console.log("✅ カメラ初期化成功");
    return true;
  } catch (err) {
    console.error("❌ カメラ初期化エラー:", err);
    alert(
      "カメラへのアクセスが拒否されました。ブラウザの設定でカメラを許可してください。"
    );
    return false;
  }
}

// 顔検出を実行
async function detectFace() {
  if (!video || !isDetecting) return;

  try {
    // face-api.jsで顔を検出
    const detections = await faceapi.detectAllFaces(
      video,
      new faceapi.TinyFaceDetectorOptions()
    );

    const detected = detections && detections.length > 0;

    // 未検出時間を計算
    if (!detected) {
      const currentTime = Date.now();
      const elapsedSeconds = Math.floor(
        (currentTime - (window.lastDetectedTime || currentTime)) / 1000
      );
      updateStatus(false, elapsedSeconds);
    } else {
      window.lastDetectedTime = Date.now();
      updateStatus(true);
    }

    // Background Scriptに結果を送信
    chrome.runtime
      .sendMessage({
        type: "FACE_DETECTED",
        detected: detected,
      })
      .catch((err) => {
        console.log("Background Scriptへの送信エラー:", err.message);
      });
  } catch (err) {
    console.error("顔検出エラー:", err);
  }
}

// 検知を開始
async function startDetection() {
  if (isDetecting) {
    console.log("既に検知中です");
    return;
  }

  console.log("👁️ 顔検出を開始します...");

  // ステータスインジケーターを作成
  createStatusIndicator();

  // face-api.jsを読み込み
  try {
    await loadFaceAPI();
    console.log("✅ face-api.js 読み込み完了");

    // モデルを読み込み
    await faceapi.nets.tinyFaceDetector.loadFromUri(
      "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model"
    );
    console.log("✅ 顔検出モデル読み込み完了");
  } catch (err) {
    console.error("❌ face-api.js読み込みエラー:", err);
    alert("顔検出ライブラリの読み込みに失敗しました。");
    return;
  }

  // カメラを初期化
  const cameraReady = await initCamera();
  if (!cameraReady) return;

  // 検知開始
  isDetecting = true;
  window.lastDetectedTime = Date.now();

  // 1秒ごとに顔検出を実行
  detectionInterval = setInterval(detectFace, 1000);

  console.log("✅ 顔検出開始");
  updateStatus(true);
}

// 検知を停止
function stopDetection() {
  if (!isDetecting) return;

  console.log("⏹️ 顔検出を停止");

  isDetecting = false;

  // インターバルをクリア
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }

  // カメラストリームを停止
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
    video.remove();
    video = null;
  }

  // ステータスを待機中に
  setIdleStatus();
}

// 音声アラートを再生
function playSound(volume = 70) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 880; // A5音
  oscillator.type = "sine";
  gainNode.gain.value = volume / 100;

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.5);
}

// Background Scriptからのメッセージを受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content Script メッセージ受信:", message);

  switch (message.type) {
    case "START_DETECTION":
      startDetection();
      sendResponse({ success: true });
      break;

    case "STOP_DETECTION":
      stopDetection();
      sendResponse({ success: true });
      break;

    case "PLAY_SOUND":
      playSound(message.volume || 70);
      sendResponse({ success: true });
      break;
  }

  return true;
});

// ページ読み込み完了時
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ ClassGuard Content Script 読み込み完了");
    checkForSessionId();
  });
} else {
  console.log("✅ ClassGuard Content Script 読み込み完了");
  checkForSessionId();
}

// URLからセッションIDを自動検出
function checkForSessionId() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get("session");

  if (sessionId) {
    console.log("📋 URLからセッションID検出:", sessionId);

    // Background Scriptに送信
    chrome.runtime
      .sendMessage({
        type: "SET_SESSION_ID",
        sessionId: sessionId,
      })
      .then(() => {
        console.log("✅ セッションID設定完了");

        // 通知を表示
        showNotification(
          "セッションに参加しました",
          `セッションID: ${sessionId.substring(0, 20)}...`
        );
      })
      .catch((err) => {
        console.error("セッションID設定エラー:", err);
      });
  }
}

// 通知を表示
function showNotification(title, message) {
  // 画面上部に通知を表示
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999999;
    background: rgba(52, 199, 89, 0.95);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    animation: slideDown 0.3s ease-out;
  `;

  notification.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
    <div style="font-size: 12px; opacity: 0.9;">${message}</div>
  `;

  document.body.appendChild(notification);

  // 3秒後に削除
  setTimeout(() => {
    notification.style.animation = "slideUp 0.3s ease-out";
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// アニメーション用CSS
const style = document.createElement("style");
style.textContent = `
  @keyframes slideDown {
    from {
      transform: translate(-50%, -100px);
      opacity: 0;
    }
    to {
      transform: translate(-50%, 0);
      opacity: 1;
    }
  }
  
  @keyframes slideUp {
    from {
      transform: translate(-50%, 0);
      opacity: 1;
    }
    to {
      transform: translate(-50%, -100px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
