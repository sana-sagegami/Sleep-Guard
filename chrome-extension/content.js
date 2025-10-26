// ============================================
// ClassGuard Content Script - Pusher版
// 顔認識・居眠り検知システム
// ============================================

(async function () {
  ("use strict");

  console.log("🚀 ClassGuard Content Script 起動 (Pusher版)");

  // ============================================
  // グローバル変数
  // ============================================

  let pusher = null;
  let channel = null;
  let videoElement = null;
  let canvasElement = null;
  let detectionInterval = null;
  let statusUpdateInterval = null;
  let isDetecting = false;
  let faceDetected = false;
  let eyesClosed = false;
  let headDown = false;
  let eyesClosedStartTime = null;
  let headDownStartTime = null;
  let lastStatusSentTime = 0;

  // 設定
  let settings = {
    dashboardUrl: "",
    sessionId: "",
    anonymousId: "",
    studentName: "",
    alertMode: "sound",
    volume: 70,
    eyeClosedThreshold: 3.0, // 3秒間目を閉じ続けたら
    headDownThreshold: 35, // 35度以上下を向いたら（25→35に変更）
    detectionInterval: 500,
    statusUpdateInterval: 5000,
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

    const leftEAR = calculateEAR(leftEye);
    const rightEAR = calculateEAR(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2.0;

    const threshold = 0.2;
    const closed = avgEAR < threshold;

    if (closed) {
      console.log(`👁️ Eyes closed (EAR: ${avgEAR.toFixed(3)})`);
    }

    return closed;
  }

  // ============================================
  // 頭の角度検知（修正版）
  // ============================================

  function calculateHeadPitch(landmarks) {
    // 鼻先と顎の位置から角度を計算
    const noseTip = landmarks[30]; // 鼻先
    const chin = landmarks[8]; // 顎
    const noseBridge = landmarks[27]; // 鼻梁

    // 垂直方向の距離
    const verticalDistance = chin.y - noseBridge.y;

    // 基準となる顔の高さ（正面を向いている時の値）
    const faceHeight = Math.abs(landmarks[8].y - landmarks[27].y);

    // 角度を計算（より正確に）
    const angle =
      Math.atan2(chin.y - noseTip.y, Math.abs(noseTip.x - chin.x)) *
      (180 / Math.PI);

    return Math.abs(angle);
  }

  function isHeadDown(landmarks, threshold) {
    const pitch = calculateHeadPitch(landmarks);

    // より厳格に判定（閾値を超えた場合のみ）
    const down = pitch > threshold;

    if (down) {
      console.log(
        `🙇 Head down detected (Pitch: ${pitch.toFixed(1)}° > ${threshold}°)`
      );
    } else {
      // デバッグ用
      if (pitch > 25) {
        console.debug(`👤 Head angle: ${pitch.toFixed(1)}° (OK)`);
      }
    }

    return down;
  }

  // ============================================
  // 目の開閉検知
  // ============================================

  function areEyesClosed(landmarks) {
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

    const leftEAR = calculateEAR(leftEye);
    const rightEAR = calculateEAR(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2.0;

    // 閾値を調整（0.2 → 0.18にして、より厳格に判定）
    const threshold = 0.18;
    const closed = avgEAR < threshold;

    if (closed) {
      console.log(
        `👁️ Eyes closed detected (EAR: ${avgEAR.toFixed(3)} < ${threshold})`
      );
    }

    return closed;
  }

  // ============================================
  // 検出ループ（継続時間のチェックを追加）
  // ============================================

  async function runDetectionLoop() {
    if (!isDetecting || !videoElement) {
      return;
    }

    const detections = await detectFace();

    if (detections) {
      faceDetected = true;
      const landmarks = detections.landmarks.positions;

      // 目の開閉チェック（継続時間を厳格に）
      const currentlyEyesClosed = areEyesClosed(landmarks);

      if (currentlyEyesClosed) {
        if (!eyesClosed) {
          eyesClosed = true;
          eyesClosedStartTime = Date.now();
          notifyPopup("EYES_CLOSED");
        } else {
          const duration = (Date.now() - eyesClosedStartTime) / 1000;
          // 3秒以上閉じている場合のみ居眠りと判定
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

      // 頭の角度チェック（より厳格に）
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
          const duration = (Date.now() - headDownStartTime) / 1000;
          // 2秒以上下を向いている場合のみ居眠りと判定（1秒→2秒に変更）
          if (duration >= 2.0) {
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

    const box = detections.detection.box;
    ctx.strokeStyle =
      faceDetected && !eyesClosed && !headDown ? "#28a745" : "#dc3545";
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

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

    notifyPopup("DROWSINESS_DETECTED");

    // サーバーに送信
    await sendStatusToServer("sleeping", true, true, duration);

    // アラート実行
    await executeAlert();
  }

  // ============================================
  // ステータスをサーバーに送信
  // ============================================

  async function sendStatusToServer(
    status,
    eyesClosed,
    headDown,
    sleepDuration = 0
  ) {
    if (!settings.dashboardUrl || !settings.sessionId) {
      console.error("❌ Missing configuration");
      return;
    }

    // レート制限: 2秒に1回まで
    const now = Date.now();
    if (now - lastStatusSentTime < settings.statusUpdateInterval) {
      return;
    }
    lastStatusSentTime = now;

    try {
      const url = `${settings.dashboardUrl}/api/update-status`;

      const data = {
        sessionId: settings.sessionId,
        student: {
          id: settings.anonymousId,
          name: settings.studentName || "匿名学生", // デフォルト名を追加
          status: status,
          eyesClosed: eyesClosed,
          headDown: headDown,
          sleepDuration: sleepDuration,
          lastUpdate: Date.now(),
        },
      };

      console.log("📤 Sending status to server:", data);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✅ Status sent successfully:", result);
      } else {
        const errorText = await response.text();
        console.error("❌ Failed to send status:", response.status, errorText);
      }
    } catch (error) {
      console.error("❌ Status send error:", error);
    }
  }

  // ============================================
  // 定期的なステータス送信（修正版）
  // ============================================

  function startStatusUpdates() {
    // 2秒ごとに現在のステータスを送信
    statusUpdateInterval = setInterval(async () => {
      if (!isDetecting) return;

      let status = "active";
      let duration = 0;

      // ステータスを正確に判定
      if (eyesClosed && headDown) {
        status = "sleeping";
        duration = eyesClosedStartTime
          ? (Date.now() - eyesClosedStartTime) / 1000
          : 0;
      } else if (eyesClosed) {
        const eyesDuration = eyesClosedStartTime
          ? (Date.now() - eyesClosedStartTime) / 1000
          : 0;

        if (eyesDuration >= settings.eyeClosedThreshold) {
          status = "drowsy";
          duration = eyesDuration;
        }
      } else if (headDown) {
        const headDuration = headDownStartTime
          ? (Date.now() - headDownStartTime) / 1000
          : 0;

        if (headDuration >= 2.0) {
          status = "drowsy";
          duration = headDuration;
        }
      } else if (faceDetected) {
        status = "active";
      } else {
        status = "absent"; // 顔が検出されない場合
      }

      await sendStatusToServer(status, eyesClosed, headDown, duration);
    }, settings.statusUpdateInterval);
  }

  // ============================================
  // 検知開始時に初回ステータスを送信
  // ============================================

  async function startDetection(newSettings) {
    if (isDetecting) {
      console.log("⚠️ Detection already running");
      return { success: false, message: "Already detecting" };
    }

    Object.assign(settings, newSettings);

    console.log("🚀 Starting detection with settings:", settings);

    // モデル読み込み
    const modelsLoadedSuccess = await loadFaceApiModels();
    if (!modelsLoadedSuccess) {
      return { success: false, message: "Failed to load models" };
    }

    // カメラ起動
    const cameraStarted = await startCamera();
    if (!cameraStarted) {
      return { success: false, message: "Failed to start camera" };
    }

    // Pusher接続
    await connectToPusher();

    // 検出ループ開始
    isDetecting = true;
    detectionInterval = setInterval(
      runDetectionLoop,
      settings.detectionInterval
    );

    // ステータス更新開始
    startStatusUpdates();

    // 初期ステータス送信（即座に送信）
    await sendStatusToServer("active", false, false, 0);

    console.log("✅ Detection started");
    console.log(
      "📡 Sending status every",
      settings.statusUpdateInterval / 1000,
      "seconds"
    );

    return { success: true };
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
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      gainNode.gain.value = settings.volume / 100;

      oscillator.start();

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
    try {
      const url = `${settings.dashboardUrl}/api/trigger-capture`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: settings.sessionId,
          studentId: settings.anonymousId,
          timestamp: Date.now(),
        }),
      });

      if (response.ok) {
        console.log("📱 Smartphone capture triggered");
      } else {
        console.error("❌ Failed to trigger capture");
      }
    } catch (error) {
      console.error("❌ Trigger capture error:", error);
    }
  }

  // ============================================
  // Pusher接続（リアルタイム更新受信用）
  // ============================================

  async function connectToPusher() {
    try {
      console.log("🔌 Connecting to Pusher...");

      // Pusherスクリプトを動的に読み込み
      if (!window.Pusher) {
        await loadScript("https://js.pusher.com/8.2.0/pusher.min.js");
      }

      // Pusher APIキーはサーバーから取得
      const response = await fetch(
        `${settings.dashboardUrl}/api/pusher-config`
      );
      const config = await response.json();

      pusher = new Pusher(config.key, {
        cluster: config.cluster,
      });

      // セッション専用チャンネルに接続
      channel = pusher.subscribe(`session-${settings.sessionId}`);

      channel.bind("pusher:subscription_succeeded", () => {
        console.log("✅ Connected to Pusher channel");
        notifyPopup("CONNECTION_ESTABLISHED", {
          sessionId: settings.sessionId,
        });
      });

      // サーバーからのコマンドを受信
      channel.bind("teacher-command", (data) => {
        console.log("📨 Received command:", data);
        handleTeacherCommand(data);
      });

      return true;
    } catch (error) {
      console.error("❌ Pusher connection error:", error);
      return false;
    }
  }

  function disconnectFromPusher() {
    if (channel) {
      channel.unbind_all();
      pusher.unsubscribe(`session-${settings.sessionId}`);
      channel = null;
    }

    if (pusher) {
      pusher.disconnect();
      pusher = null;
    }

    console.log("🔌 Disconnected from Pusher");
  }

  // 先生からのコマンド処理
  function handleTeacherCommand(data) {
    switch (data.command) {
      case "alert":
        executeAlert();
        break;
      case "stop":
        stopDetection();
        break;
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
    const message = {
      action: action,
      ...data,
    };

    chrome.runtime
      .sendMessage(message)
      .then((response) => {
        if (response?.received) {
          console.log("✅ Popup notified:", action);
        }
      })
      .catch((error) => {
        // Popupが開いていない場合はエラーが出るが、無視して良い
        console.debug("⚠️ Popup not available:", error.message);
      });
  }

  // ============================================
  // 検知開始
  // ============================================

  async function startDetection(newSettings) {
    if (isDetecting) {
      console.log("⚠️ Detection already running");
      return { success: false, message: "Already detecting" };
    }

    Object.assign(settings, newSettings);

    console.log("🚀 Starting detection with settings:", settings);

    // モデル読み込み
    const modelsLoadedSuccess = await loadFaceApiModels();
    if (!modelsLoadedSuccess) {
      return { success: false, message: "Failed to load models" };
    }

    // カメラ起動
    const cameraStarted = await startCamera();
    if (!cameraStarted) {
      return { success: false, message: "Failed to start camera" };
    }

    // Pusher接続
    await connectToPusher();

    // 検出ループ開始
    isDetecting = true;
    detectionInterval = setInterval(
      runDetectionLoop,
      settings.detectionInterval
    );

    // ステータス更新開始
    startStatusUpdates();

    // 初期ステータス送信
    await sendStatusToServer("active", false, false, 0);

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

    // ステータス更新停止
    stopStatusUpdates();

    // カメラ停止
    stopCamera();

    // Pusher切断
    disconnectFromPusher();

    // 状態リセット
    isDetecting = false;
    faceDetected = false;
    eyesClosed = false;
    headDown = false;
    eyesClosedStartTime = null;
    headDownStartTime = null;

    notifyPopup("CONNECTION_LOST");

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
        return true;

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

      case "CHECK_FACE":
        sendResponse({
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

  console.log("✅ ClassGuard Content Script loaded - Pusher版");
})();
