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
  let faceNotDetectedStartTime = null; // 顔が検出されなくなった時刻
  let lastStatusSentTime = 0;

  // 設定
  let settings = {
    dashboardUrl: "",
    sessionId: "",
    anonymousId: "",
    studentName: "",
    alertMode: "sound",
    volume: 70,
    eyeClosedThreshold: 2.0, // 2秒間目を閉じ続けたら居眠り判定
    headDownThreshold: 30, // 30度以上下を向いたら（より敏感に）
    faceNotDetectedThreshold: 5.0, // 5秒間顔が検出されなかったら居眠り判定
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

      const MODEL_URL = chrome.runtime.getURL("models");

      console.log("📂 Model URL:", MODEL_URL);

      // 必要なモデルを順番に読み込み
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ]);

      modelsLoaded = true;
      console.log("✅ Face-API models loaded successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to load models:", error);
      console.error("   Error details:", error.message);
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
      // 検出感度を上げる（scoreThresholdを下げる）
      const detections = await faceapi
        .detectSingleFace(
          videoElement,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 416, // 大きいサイズで精度向上
            scoreThreshold: 0.3, // 低い閾値で検出しやすく（デフォルト: 0.5）
          })
        )
        .withFaceLandmarks();

      return detections;
    } catch (error) {
      console.error("❌ Face detection error:", error);
      return null;
    }
  }

  // ============================================
  // 頭の角度検知（修正版）
  // ============================================

  function calculateHeadPitch(landmarks) {
    // より正確な角度計算
    const noseTip = landmarks[30]; // 鼻先
    const noseBridge = landmarks[27]; // 鼻梁
    const chin = landmarks[8]; // 顎
    const forehead = landmarks[21]; // 額の代替点（眉の中心）

    // 顔の中心軸の垂直方向の変化を計算
    const faceVerticalDistance = chin.y - noseBridge.y;
    const normalFaceHeight = 100; // 正常時の顔の高さの基準値

    // 角度を計算（アークタンジェントを使用）
    const dy = chin.y - noseTip.y;
    const dx = Math.abs(chin.x - noseTip.x);

    // 角度（度）
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // 90度から引いて、下向きの角度を取得
    angle = Math.abs(90 - angle);

    return angle;
  }

  function isHeadDown(landmarks, threshold) {
    const pitch = calculateHeadPitch(landmarks);

    // より緩い判定（頭を下げても検出しやすく）
    const down = pitch > threshold;

    // デバッグログ
    if (pitch > threshold - 10) {
      console.log(
        `👤 Head pitch: ${pitch.toFixed(1)}° (threshold: ${threshold}°) - ${
          down ? "🙇 DOWN" : "⚠️ 警戒中"
        }`
      );
    }

    return down;
  }

  // ============================================
  // EAR (Eye Aspect Ratio) 計算
  // ============================================

  function calculateEAR(eye) {
    // 縦方向の距離（2箇所）
    const A = Math.sqrt(
      Math.pow(eye[1].x - eye[5].x, 2) + Math.pow(eye[1].y - eye[5].y, 2)
    );
    const B = Math.sqrt(
      Math.pow(eye[2].x - eye[4].x, 2) + Math.pow(eye[2].y - eye[4].y, 2)
    );

    // 横方向の距離
    const C = Math.sqrt(
      Math.pow(eye[0].x - eye[3].x, 2) + Math.pow(eye[0].y - eye[3].y, 2)
    );

    // EAR計算（縦の平均 / 横）
    const ear = (A + B) / (2.0 * C);
    return ear;
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

    // しっかりと目の閉じを判定（閾値を上げて敏感に）
    const threshold = 0.25; // 0.20 → 0.25 に上げてより確実に検出
    const closed = avgEAR < threshold;

    // デバッグログ - 常に表示して状態を確認
    console.log(
      `👁️ Left EAR: ${leftEAR.toFixed(3)}, Right EAR: ${rightEAR.toFixed(
        3
      )}, Avg EAR: ${avgEAR.toFixed(3)} (threshold: ${threshold}) - ${
        closed ? "😪 CLOSED" : "✅ OPEN"
      }`
    );

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

      // 目の開閉チェック
      const currentlyEyesClosed = areEyesClosed(landmarks);

      if (currentlyEyesClosed) {
        if (!eyesClosed) {
          eyesClosed = true;
          eyesClosedStartTime = Date.now();
          notifyPopup("EYES_CLOSED");
          console.log("👁️ Eyes closed started");
        } else {
          const duration = (Date.now() - eyesClosedStartTime) / 1000;
          console.log(`👁️ Eyes closed for ${duration.toFixed(1)}s`);

          // 3秒以上閉じている場合のみ居眠りと判定
          if (duration >= settings.eyeClosedThreshold) {
            console.log("🚨 Drowsiness detected: eyes closed too long");
            await handleDrowsiness("eyes_closed", duration);
          }
        }
      } else {
        if (eyesClosed) {
          console.log("👁️ Eyes opened");
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
          console.log("🙇 Head down started");
        } else {
          const duration = (Date.now() - headDownStartTime) / 1000;
          console.log(`🙇 Head down for ${duration.toFixed(1)}s`);

          // 3秒以上下を向いている場合のみ居眠りと判定（2秒→3秒に変更）
          if (duration >= 3.0) {
            console.log("🚨 Drowsiness detected: head down too long");
            await handleDrowsiness("head_down", duration);
          }
        }
      } else {
        if (headDown) {
          console.log("👤 Head up");
          headDown = false;
          headDownStartTime = null;
          if (!eyesClosed) {
            notifyPopup("FOCUSED");
          }
        }
      }

      // 顔が検出されているので、未検出時間をリセット
      faceNotDetectedStartTime = null;

      // 顔検出の描画
      drawDetections(detections);

      // 正常状態の通知
      if (!eyesClosed && !headDown) {
        notifyPopup("FACE_DETECTED");
      }
    } else {
      // 顔が検出されない
      if (faceDetected) {
        console.log("❌ Face lost");
        faceDetected = false;
        faceNotDetectedStartTime = Date.now(); // 未検出開始時刻を記録
        notifyPopup("FACE_LOST");
      } else if (faceNotDetectedStartTime) {
        // 顔が検出されない状態が継続している
        const duration = (Date.now() - faceNotDetectedStartTime) / 1000;
        console.log(`❌ Face not detected for ${duration.toFixed(1)}s`);

        // 設定した秒数以上顔が検出されない場合、居眠りと判定
        if (duration >= settings.faceNotDetectedThreshold) {
          console.log("🚨 Drowsiness detected: face not detected too long");
          await handleDrowsiness("face_not_detected", duration);
          // 一度判定したらリセット（連続アラートを防ぐ）
          faceNotDetectedStartTime = Date.now();
        }
      }

      // 状態をリセット
      eyesClosed = false;
      headDown = false;
      eyesClosedStartTime = null;
      headDownStartTime = null;

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
    let message = "";
    switch (type) {
      case "eyes_closed":
        message = `目を閉じている状態が${duration.toFixed(1)}秒間続いています`;
        break;
      case "head_down":
        message = `頭を下げている状態が${duration.toFixed(1)}秒間続いています`;
        break;
      case "face_not_detected":
        message = `顔が検出されない状態が${duration.toFixed(
          1
        )}秒間続いています`;
        break;
    }

    console.log(
      `😴 Drowsiness detected! Type: ${type}, Duration: ${duration.toFixed(1)}s`
    );
    console.log(`📢 Message: ${message}`);

    notifyPopup("DROWSINESS_DETECTED");

    // サーバーに送信
    await sendStatusToServer("sleeping", true, true, duration);

    // アラート実行（アラートモードに応じた処理）
    await executeAlert();
  }

  // ============================================
  // スマホに撮影トリガーを送信（Pusher経由）
  // ============================================

  async function triggerSmartphoneCapture() {
    try {
      console.log("📸 スマホに撮影トリガーを送信中...");
      console.log("📋 Session ID:", settings.sessionId);
      console.log("👤 Student ID:", settings.anonymousId);

      // Background script経由でPusherイベントを送信
      const response = await chrome.runtime.sendMessage({
        action: "TRIGGER_SMARTPHONE",
        sessionId: settings.sessionId,
        studentId: settings.anonymousId,
      });

      console.log("📡 Response from background:", response);

      if (response?.success) {
        console.log("✅ スマホに撮影トリガーを送信しました");
      } else {
        console.error("❌ 撮影トリガー送信失敗:", response);
      }
    } catch (error) {
      // Extension context invalidated エラーを無視
      if (
        error.message &&
        error.message.includes("Extension context invalidated")
      ) {
        console.warn("⚠️ 拡張機能のコンテキストが無効化されています");
        return;
      }
      console.error("❌ 撮影トリガーエラー:", error);
    }
  }

  // ============================================
  // ステータスをサーバーに送信（デバッグ強化）
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
      console.debug("⏭️ Skipping status update (rate limit)");
      return;
    }
    lastStatusSentTime = now;

    try {
      const url = `${settings.dashboardUrl}/api/update-status`;

      const data = {
        sessionId: settings.sessionId,
        student: {
          id: settings.anonymousId,
          name: settings.studentName || "匿名学生",
          status: status,
          eyesClosed: eyesClosed,
          headDown: headDown,
          sleepDuration: sleepDuration,
          lastUpdate: Date.now(),
        },
      };

      console.log("📤 Sending status to server:");
      console.log("   URL:", url);
      console.log("   Session ID:", settings.sessionId);
      console.log("   Student ID:", settings.anonymousId);
      console.log("   Status:", status);

      // Background経由でfetchを実行（CORS/CSP回避）
      const response = await chrome.runtime.sendMessage({
        action: "SEND_STATUS",
        url: url,
        data: data,
      });

      if (response?.success) {
        console.log("✅ Status sent successfully:", response.data);
        console.log(
          "   Total students in session:",
          response.data?.totalStudents
        );
      } else {
        console.error("❌ Failed to send status:", response?.error);
      }
    } catch (error) {
      // Extension context invalidated エラーをキャッチ
      if (
        error.message &&
        error.message.includes("Extension context invalidated")
      ) {
        console.error(
          "❌ 拡張機能が無効化されました。ページをリロードしてください。"
        );
        // 検知を停止
        stopDetection();
        // ユーザーに通知
        alert("拡張機能が更新されました。ページをリロードしてください。");
      } else {
        console.error("❌ Status send error:", error);
      }
    }
  }

  // ============================================
  // 定期的なステータス送信（修正版）
  // ============================================
  function startStatusUpdates() {
    statusUpdateInterval = setInterval(async () => {
      if (!isDetecting) return;

      let status = "active";
      let duration = 0;

      // より厳格なステータス判定
      if (!faceDetected) {
        status = "absent";
      } else if (eyesClosed && headDown) {
        // 両方の条件を満たす場合のみsleeping
        const eyesDuration = eyesClosedStartTime
          ? (Date.now() - eyesClosedStartTime) / 1000
          : 0;
        const headDuration = headDownStartTime
          ? (Date.now() - headDownStartTime) / 1000
          : 0;

        if (
          eyesDuration >= settings.eyeClosedThreshold &&
          headDuration >= 3.0
        ) {
          status = "sleeping";
          duration = Math.max(eyesDuration, headDuration);
        } else {
          status = "active"; // まだ継続時間が足りない
        }
      } else if (eyesClosed) {
        const eyesDuration = eyesClosedStartTime
          ? (Date.now() - eyesClosedStartTime) / 1000
          : 0;

        if (eyesDuration >= settings.eyeClosedThreshold) {
          status = "drowsy";
          duration = eyesDuration;
        } else {
          status = "active"; // まだ継続時間が足りない
        }
      } else if (headDown) {
        const headDuration = headDownStartTime
          ? (Date.now() - headDownStartTime) / 1000
          : 0;

        if (headDuration >= 3.0) {
          status = "drowsy";
          duration = headDuration;
        } else {
          status = "active"; // まだ継続時間が足りない
        }
      } else {
        status = "active";
      }

      console.log(
        `📤 Sending status: ${status} (duration: ${duration.toFixed(1)}s)`
      );
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

    // 状態変数をリセット
    faceDetected = false;
    eyesClosed = false;
    headDown = false;
    eyesClosedStartTime = null;
    headDownStartTime = null;
    faceNotDetectedStartTime = null;
    lastStatusSentTime = 0;
    console.log("🔄 Detection state variables reset");

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
    // アラートモードを最新の設定から取得
    const currentSettings = await chrome.storage.local.get(["alertMode"]);
    const alertMode = currentSettings.alertMode || "sound";

    // settingsオブジェクトも更新
    settings.alertMode = alertMode;

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔔 Executing alert mode:", alertMode);
    console.log("   Storage value:", currentSettings);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    switch (alertMode) {
      case "sound":
        console.log("🔊 Playing sound alert");
        await playSoundAlert();
        break;

      case "wallpaper":
        console.log("🖼️ Changing wallpaper");
        await changeWallpaper();
        break;

      case "smartphone":
        console.log("📱 Triggering smartphone capture");
        await triggerSmartphoneCapture();
        break;

      default:
        console.warn("⚠️ Unknown alert mode:", alertMode);
        // デフォルトは音声アラート
        await playSoundAlert();
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
  // Pusher接続（Background経由でCSP回避）
  // ============================================

  async function connectToPusher() {
    try {
      console.log("🔌 Connecting to Pusher via background...");

      // Pusher設定を取得
      const response = await fetch(
        `${settings.dashboardUrl}/api/pusher-config`
      );

      if (!response.ok) {
        throw new Error(`Failed to get Pusher config: ${response.status}`);
      }

      const config = await response.json();
      console.log("🔑 Pusher config:", {
        key: config.key,
        cluster: config.cluster,
      });

      // Background scriptにPusher接続を依頼
      const result = await chrome.runtime.sendMessage({
        action: "CONNECT_PUSHER",
        config: config,
        sessionId: settings.sessionId,
      });

      if (result?.success) {
        console.log("✅ Connected to Pusher via background");
        notifyPopup("CONNECTION_ESTABLISHED", {
          sessionId: settings.sessionId,
        });
        return true;
      } else {
        throw new Error("Failed to connect via background");
      }
    } catch (error) {
      console.error("❌ Pusher connection error:", error);
      return false;
    }
  }

  function disconnectFromPusher() {
    // Background scriptにPusher切断を依頼
    chrome.runtime
      .sendMessage({
        action: "DISCONNECT_PUSHER",
      })
      .catch((err) => {
        console.error("❌ Failed to disconnect Pusher:", err);
      });

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

      case "TEACHER_COMMAND":
        // Background経由で先生からのコマンドを受信
        console.log("📨 Teacher command received:", message.command);
        handleTeacherCommand(message.command);
        sendResponse({ success: true });
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
