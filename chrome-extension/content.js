// ============================================
// ClassGuard Content Script - 完全版
// 顔認識・居眠り検知システム
// ============================================

(async function () {
  "use strict";

  console.log("🚀 ClassGuard Content Script 起動");

  // ============================================
  // グローバル変数
  // ============================================

  let socket = null;
  let videoElement = null;
  let canvasElement = null;
  let detectionInterval = null;
  let isDetecting = false;
  let faceDetected = false;
  let eyesClosed = false;
  let headDown = false;
  let eyesClosedStartTime = null;
  let headDownStartTime = null;

  // 設定
  let settings = {
    dashboardUrl: "",
    sessionId: "",
    anonymousId: "",
    alertMode: "sound",
    volume: 70,
    eyeClosedThreshold: 3.0,
    headDownThreshold: 25,
    detectionInterval: 500,
  };

  // モデル読み込み状態
  let modelsLoaded = false;

  // ============================================
  // Face-API.js 初期化
  // ============================================

  async function loadFaceApiModels() {
    if (modelsLoaded) {
      console.log("✅ Models already loaded");
      return true;
    }

    try {
      console.log("📥 Loading face-api.js models...");

      const modelPath = chrome.runtime.getURL("models");

      await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath);
      await faceapi.nets.faceLandmark68Net.loadFromUri(modelPath);

      modelsLoaded = true;
      console.log("✅ Face-API models loaded successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to load models:", error);
      notifyPopup("FACE_LOST");
      return false;
    }
  }

  // ============================================
  // ビデオ要素の作成
  // ============================================

  function createVideoElement() {
    if (videoElement) {
      console.log("✅ Video element already exists");
      return videoElement;
    }

    // ビデオ要素を作成
    videoElement = document.createElement("video");
    videoElement.id = "classguard-video";
    videoElement.autoplay = true;
    videoElement.muted = true;
    videoElement.playsInline = true;

    // スタイル設定（右下に小さく表示）
    videoElement.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 240px;
      height: 180px;
      border: 3px solid #667eea;
      border-radius: 12px;
      z-index: 999999;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      object-fit: cover;
    `;

    // Canvas要素を作成（オーバーレイ表示用）
    canvasElement = document.createElement("canvas");
    canvasElement.id = "classguard-canvas";
    canvasElement.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 240px;
      height: 180px;
      z-index: 1000000;
      pointer-events: none;
    `;

    document.body.appendChild(videoElement);
    document.body.appendChild(canvasElement);

    console.log("✅ Video element created");
    return videoElement;
  }

  // ============================================
  // カメラ起動
  // ============================================

  async function startCamera() {
    try {
      console.log("📷 Starting camera...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });

      const video = createVideoElement();
      video.srcObject = stream;

      // ビデオが再生可能になるまで待機
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      // Canvasサイズをビデオに合わせる
      canvasElement.width = video.videoWidth;
      canvasElement.height = video.videoHeight;

      console.log("✅ Camera started");
      return true;
    } catch (error) {
      console.error("❌ Camera error:", error);
      alert("カメラの起動に失敗しました。カメラ権限を確認してください。");
      return false;
    }
  }

  // ============================================
  // カメラ停止
  // ============================================

  function stopCamera() {
    if (videoElement && videoElement.srcObject) {
      const tracks = videoElement.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      videoElement.srcObject = null;
    }

    if (videoElement) {
      videoElement.remove();
      videoElement = null;
    }

    if (canvasElement) {
      canvasElement.remove();
      canvasElement = null;
    }

    console.log("📷 Camera stopped");
  }

  // ============================================
  // 顔検出
  // ============================================

  async function detectFace() {
    if (!videoElement || !modelsLoaded) {
      return null;
    }

    try {
      const detections = await faceapi
        .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      return detections;
    } catch (error) {
      console.error("❌ Face detection error:", error);
      return null;
    }
  }

  // ============================================
  // 目の開閉検知（EAR - Eye Aspect Ratio）
  // ============================================

  function calculateEAR(eye) {
    // Eye Aspect Ratio計算
    const vertical1 = euclideanDistance(eye[1], eye[5]);
    const vertical2 = euclideanDistance(eye[2], eye[4]);
    const horizontal = euclideanDistance(eye[0], eye[3]);

    const ear = (vertical1 + vertical2) / (2.0 * horizontal);
    return ear;
  }

  function euclideanDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function areEyesClosed(landmarks) {
    // 左目と右目のランドマーク
    const leftEye = [
      landmarks[36],
      landmarks[37],
      landmarks[38],
      landmarks[39],
      landmarks[40],
      landmarks[41],
    ];

    const rightEye = [
      landmarks[42],
      landmarks[43],
      landmarks[44],
      landmarks[45],
      landmarks[46],
      landmarks[47],
    ];

    // EAR計算
    const leftEAR = calculateEAR(leftEye);
    const rightEAR = calculateEAR(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2.0;

    // EARが0.2以下の場合、目を閉じていると判定
    const threshold = 0.2;
    const closed = avgEAR < threshold;

    if (closed) {
      console.log(`👁️ Eyes closed (EAR: ${avgEAR.toFixed(3)})`);
    }

    return closed;
  }

  // ============================================
  // 頭の角度検知（Pitch角度）
  // ============================================

  function calculateHeadPitch(landmarks) {
    // 鼻の先端、顎の位置から頭の角度を推定
    const noseTip = landmarks[30];
    const chin = landmarks[8];
    const foreheadApprox = {
      x: noseTip.x,
      y: noseTip.y - 80, // 概算
    };

    // 角度計算（縦方向）
    const dy = chin.y - foreheadApprox.y;
    const dx = chin.x - foreheadApprox.x;

    // Pitch角度（度）
    const pitch = Math.atan2(dy, Math.abs(dx)) * (180 / Math.PI);

    return Math.abs(pitch);
  }

  function isHeadDown(landmarks, threshold) {
    const pitch = calculateHeadPitch(landmarks);
    const down = pitch > threshold;

    if (down) {
      console.log(`🙇 Head down (Pitch: ${pitch.toFixed(1)}°)`);
    }

    return down;
  }

  // ============================================
  // 検出ループ
  // ============================================

  async function runDetectionLoop() {
    if (!isDetecting || !videoElement) {
      return;
    }

    const detections = await detectFace();

    if (detections) {
      faceDetected = true;
      const landmarks = detections.landmarks.positions;

      // 目の開閉チェック
      const currentlyEyesClosed = areEyesClosed(landmarks);

      if (currentlyEyesClosed) {
        if (!eyesClosed) {
          eyesClosed = true;
          eyesClosedStartTime = Date.now();
          notifyPopup("EYES_CLOSED");
        } else {
          // 閾値時間を超えたか確認
          const duration = (Date.now() - eyesClosedStartTime) / 1000;
          if (duration >= settings.eyeClosedThreshold) {
            handleDrowsiness("eyes_closed", duration);
          }
        }
      } else {
        if (eyesClosed) {
          eyesClosed = false;
          eyesClosedStartTime = null;
          notifyPopup("FOCUSED");
        }
      }

      // 頭の角度チェック
      const currentlyHeadDown = isHeadDown(
        landmarks,
        settings.headDownThreshold
      );

      if (currentlyHeadDown) {
        if (!headDown) {
          headDown = true;
          headDownStartTime = Date.now();
          notifyPopup("HEAD_DOWN");
        } else {
          // 閾値時間を超えたか確認（1秒以上）
          const duration = (Date.now() - headDownStartTime) / 1000;
          if (duration >= 1.0) {
            handleDrowsiness("head_down", duration);
          }
        }
      } else {
        if (headDown) {
          headDown = false;
          headDownStartTime = null;
          if (!eyesClosed) {
            notifyPopup("FOCUSED");
          }
        }
      }

      // 顔検出の描画
      drawDetections(detections);

      // 正常状態の通知
      if (!eyesClosed && !headDown) {
        notifyPopup("FACE_DETECTED");
      }
    } else {
      // 顔が検出されない
      if (faceDetected) {
        faceDetected = false;
        eyesClosed = false;
        headDown = false;
        eyesClosedStartTime = null;
        headDownStartTime = null;
        notifyPopup("FACE_LOST");
      }

      // Canvasをクリア
      if (canvasElement) {
        const ctx = canvasElement.getContext("2d");
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      }
    }
  }

  // ============================================
  // 検出結果の描画
  // ============================================

  function drawDetections(detections) {
    if (!canvasElement) return;

    const ctx = canvasElement.getContext("2d");
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // 顔の枠を描画
    const box = detections.detection.box;
    ctx.strokeStyle =
      faceDetected && !eyesClosed && !headDown ? "#28a745" : "#dc3545";
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    // ランドマークを描画
    const landmarks = detections.landmarks.positions;
    ctx.fillStyle = "#667eea";
    landmarks.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  // ============================================
  // 居眠り検知ハンドラー
  // ============================================

  async function handleDrowsiness(type, duration) {
    console.log(
      `😴 Drowsiness detected! Type: ${type}, Duration: ${duration.toFixed(1)}s`
    );

    // popupに通知
    notifyPopup("DROWSINESS_DETECTED");

    // サーバーに通知
    if (socket && socket.connected) {
      socket.emit("drowsiness_detected", {
        sessionId: settings.sessionId,
        anonymousId: settings.anonymousId,
        type: type,
        duration: duration,
        timestamp: Date.now(),
      });
    }

    // アラート実行
    await executeAlert();
  }

  // ============================================
  // アラート実行
  // ============================================

  async function executeAlert() {
    switch (settings.alertMode) {
      case "sound":
        await playSoundAlert();
        break;

      case "wallpaper":
        await changeWallpaper();
        break;

      case "smartphone":
        await triggerSmartphoneCapture();
        break;
    }
  }

  // 音声アラート
  async function playSoundAlert() {
    try {
      const audio = new Audio();
      audio.volume = settings.volume / 100;

      // シンプルなビープ音を生成
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // 800Hz
      gainNode.gain.value = settings.volume / 100;

      oscillator.start();

      // 1秒後に停止
      setTimeout(() => {
        oscillator.stop();
        audioContext.close();
      }, 1000);

      console.log("🔊 Sound alert played");
    } catch (error) {
      console.error("❌ Sound alert error:", error);
    }
  }

  // 壁紙変更
  async function changeWallpaper() {
    try {
      // ページ全体に警告オーバーレイを表示
      const overlay = document.createElement("div");
      overlay.id = "classguard-wallpaper-overlay";
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
        z-index: 999998;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: fadeIn 0.5s ease;
      `;

      overlay.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 120px; margin-bottom: 20px;">😴</div>
          <div style="font-size: 48px; font-weight: 700; margin-bottom: 16px;">居眠り検出！</div>
          <div style="font-size: 24px; opacity: 0.9;">集中してください</div>
        </div>
      `;

      document.body.appendChild(overlay);

      // 5秒後に自動削除
      setTimeout(() => {
        overlay.style.animation = "fadeOut 0.5s ease";
        setTimeout(() => overlay.remove(), 500);
      }, 5000);

      console.log("🖼️ Wallpaper changed");
    } catch (error) {
      console.error("❌ Wallpaper change error:", error);
    }
  }

  // スマホ撮影トリガー
  async function triggerSmartphoneCapture() {
    if (socket && socket.connected) {
      socket.emit("trigger_smartphone_capture", {
        sessionId: settings.sessionId,
        anonymousId: settings.anonymousId,
        timestamp: Date.now(),
      });

      console.log("📱 Smartphone capture triggered");
    } else {
      console.warn(
        "⚠️ Socket not connected, cannot trigger smartphone capture"
      );
    }
  }

  // ============================================
  // Socket.io接続
  // ============================================

  async function connectToServer() {
    if (!settings.dashboardUrl || !settings.sessionId) {
      console.error("❌ Missing dashboardUrl or sessionId");
      return false;
    }

    try {
      console.log("🔌 Connecting to server:", settings.dashboardUrl);

      // Socket.ioスクリプトを動的に読み込み
      if (!window.io) {
        await loadScript("https://cdn.socket.io/4.5.4/socket.io.min.js");
      }

      socket = io(settings.dashboardUrl, {
        query: {
          type: "pc",
          sessionId: settings.sessionId,
          anonymousId: settings.anonymousId,
        },
        transports: ["websocket", "polling"],
      });

      socket.on("connect", () => {
        console.log("✅ Connected to server");
        notifyPopup("CONNECTION_ESTABLISHED", {
          sessionId: settings.sessionId,
        });
      });

      socket.on("disconnect", () => {
        console.log("❌ Disconnected from server");
        notifyPopup("CONNECTION_LOST");
      });

      socket.on("error", (error) => {
        console.error("❌ Socket error:", error);
      });

      return true;
    } catch (error) {
      console.error("❌ Connection error:", error);
      return false;
    }
  }

  // スクリプト動的読み込み
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ============================================
  // Popup通知
  // ============================================

  function notifyPopup(action, data = {}) {
    chrome.runtime.sendMessage(
      {
        action: action,
        ...data,
      },
      (response) => {
        // エラーを無視（popupが開いていない場合）
        if (chrome.runtime.lastError) {
          return;
        }
      }
    );
  }

  // ============================================
  // 検知開始
  // ============================================

  async function startDetection(newSettings) {
    if (isDetecting) {
      console.log("⚠️ Detection already running");
      return { success: false, message: "Already detecting" };
    }

    // 設定を更新
    Object.assign(settings, newSettings);

    console.log("🚀 Starting detection with settings:", settings);

    // モデル読み込み
    const modelsLoaded = await loadFaceApiModels();
    if (!modelsLoaded) {
      return { success: false, message: "Failed to load models" };
    }

    // カメラ起動
    const cameraStarted = await startCamera();
    if (!cameraStarted) {
      return { success: false, message: "Failed to start camera" };
    }

    // サーバー接続
    await connectToServer();

    // 検出ループ開始
    isDetecting = true;
    detectionInterval = setInterval(
      runDetectionLoop,
      settings.detectionInterval
    );

    console.log("✅ Detection started");
    return { success: true };
  }

  // ============================================
  // 検知停止
  // ============================================

  function stopDetection() {
    if (!isDetecting) {
      console.log("⚠️ Detection not running");
      return { success: false, message: "Not detecting" };
    }

    // 検出ループ停止
    if (detectionInterval) {
      clearInterval(detectionInterval);
      detectionInterval = null;
    }

    // カメラ停止
    stopCamera();

    // Socket切断
    if (socket) {
      socket.disconnect();
      socket = null;
    }

    // 状態リセット
    isDetecting = false;
    faceDetected = false;
    eyesClosed = false;
    headDown = false;
    eyesClosedStartTime = null;
    headDownStartTime = null;

    console.log("⏹️ Detection stopped");
    return { success: true };
  }

  // ============================================
  // メッセージリスナー（popupからの命令）
  // ============================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📨 Message received:", message);

    switch (message.action) {
      case "START_DETECTION":
        startDetection(message.settings).then(sendResponse);
        return true; // 非同期レスポンス

      case "STOP_DETECTION":
        sendResponse(stopDetection());
        break;

      case "CHECK_STATUS":
        sendResponse({
          isDetecting: isDetecting,
          faceDetected: faceDetected,
          eyesClosed: eyesClosed,
          headDown: headDown,
        });
        break;

      default:
        sendResponse({ success: false, message: "Unknown action" });
    }

    return true;
  });

  console.log("✅ ClassGuard Content Script loaded - 完全版");
})();
