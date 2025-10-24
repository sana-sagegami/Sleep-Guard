// ============================================
// ClassGuard Chrome拡張 - Content Script
// 顔検出とカメラ処理（視覚的フィードバック付き）
// ============================================

// 重複読み込みを防止
if (window.classguardLoaded) {
  console.log("⚠️ ClassGuard Content Script は既に読み込まれています");
} else {
  window.classguardLoaded = true;
  console.log("✅ ClassGuard Content Script 初期化開始");
}

let video = null;
let canvas = null;
let detectionInterval = null;
let isDetecting = false;
let statusIndicator = null;
let faceDetected = false;

// 顔検出ライブラリ（face-api.js）を動的に読み込み
async function loadFaceAPI() {
  return new Promise((resolve, reject) => {
    // 既に読み込まれているかチェック
    if (typeof faceapi !== "undefined") {
      console.log("✅ face-api.js は既に読み込まれています");
      resolve();
      return;
    }

    // manifest.jsonのcontent_scriptsで既に読み込まれているはず
    // 少し待ってから確認
    setTimeout(() => {
      if (typeof faceapi !== "undefined") {
        console.log("✅ face-api.js 読み込み確認");
        resolve();
      } else {
        console.error("❌ face-api.js が読み込まれていません");
        reject(
          new Error(
            "face-api.jsが見つかりません。拡張機能を再読み込みしてください。"
          )
        );
      }
    }, 500);
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
function updateStatus(detected, elapsedTime = 0, statusMessage = "") {
  if (!statusIndicator) return;

  const dot = document.getElementById("classguard-status-dot");
  const label = document.getElementById("classguard-status-label");
  const counter = document.getElementById("classguard-counter");

  if (detected) {
    // 正常状態（顔検出、目開き、頭正面）
    dot.style.background = "#34c759";
    dot.style.boxShadow = "0 0 15px #34c759";
    label.textContent = "✅ 正常";
    label.style.color = "#34c759";
    counter.style.display = "none";
    faceDetected = true;
  } else {
    // 異常状態（顔未検出、目閉じ、頭下向き）
    dot.style.background = "#ff3b30";
    dot.style.boxShadow = "0 0 15px #ff3b30";
    label.textContent = `❌ ${statusMessage || "異常検出"}`;
    label.style.color = "#ff3b30";

    if (elapsedTime > 0) {
      counter.style.display = "block";
      counter.textContent = `⏱️ ${statusMessage}: ${elapsedTime}秒`;

      // 警告レベルに応じて色を変更
      if (elapsedTime >= 10) {
        counter.style.background = "rgba(255, 59, 48, 0.3)";
        counter.style.fontWeight = "bold";
      } else if (elapsedTime >= 5) {
        counter.style.background = "rgba(255, 149, 0, 0.2)";
        counter.style.color = "#ff9500";
      }
    }
    faceDetected = false;
  }
}

// EAR（Eye Aspect Ratio）計算関数
// 目の縦横比を計算して目の開閉を判定
function calculateEAR(eye) {
  // 目のランドマークから6点を取得
  const p1 = eye[1];
  const p2 = eye[2];
  const p3 = eye[3];
  const p4 = eye[4];
  const p5 = eye[5];
  const p0 = eye[0];

  // 縦方向の距離2つ
  const vertical1 = Math.sqrt(
    Math.pow(p1.x - p5.x, 2) + Math.pow(p1.y - p5.y, 2)
  );
  const vertical2 = Math.sqrt(
    Math.pow(p2.x - p4.x, 2) + Math.pow(p2.y - p4.y, 2)
  );

  // 横方向の距離
  const horizontal = Math.sqrt(
    Math.pow(p0.x - p3.x, 2) + Math.pow(p0.y - p3.y, 2)
  );

  // EAR = (vertical1 + vertical2) / (2 * horizontal)
  const ear = (vertical1 + vertical2) / (2 * horizontal);

  return ear;
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
    console.log("========================================");
    console.log("📹 カメラ初期化プロセス開始");
    console.log("========================================");

    // ステップ1: 利用可能なカメラデバイスを確認
    console.log("📹 ステップ1: カメラデバイスの確認");
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(
      (device) => device.kind === "videoinput"
    );

    console.log("   利用可能なデバイス数:", devices.length);
    console.log("   カメラデバイス数:", videoDevices.length);

    videoDevices.forEach((device, index) => {
      console.log(`   カメラ ${index + 1}:`, {
        deviceId: device.deviceId,
        label: device.label || "不明（権限が必要）",
        groupId: device.groupId,
      });
    });

    if (videoDevices.length === 0) {
      console.error("❌ カメラデバイスが見つかりません");
      alert(
        "カメラが検出されませんでした。\n\n" +
          "確認事項:\n" +
          "1. カメラが物理的に接続されているか\n" +
          "2. 他のアプリがカメラを使用していないか\n" +
          "3. システム環境設定でカメラが有効か"
      );
      return false;
    }

    // 既存のビデオ要素を削除
    if (video) {
      console.log("📹 ステップ2: 既存のビデオ要素をクリーンアップ");
      const stream = video.srcObject;
      if (stream) {
        console.log("   既存のストリームを停止");
        stream.getTracks().forEach((track) => {
          console.log(`   トラック停止: ${track.kind} (${track.label})`);
          track.stop();
        });
      }
      video.remove();
      video = null;
    }

    // 新しいビデオ要素を作成
    console.log("📹 ステップ3: 新しいビデオ要素を作成");
    video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // ミュート設定を追加

    // デバッグ用に一時的に表示
    video.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 320px;
      height: 240px;
      border: 3px solid #00ff00;
      border-radius: 8px;
      z-index: 999999;
      background: black;
    `;

    document.body.appendChild(video);
    console.log("✅ ビデオ要素をDOMに追加");

    // カメラストリームを取得
    console.log("📹 ステップ4: カメラストリーム取得開始");
    console.log("   制約条件:", {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      },
    });

    let stream;
    try {
      // まず基本的な設定で試行
      console.log("   試行1: 標準設定でカメラアクセス");
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
      console.log("✅ 試行1成功");
    } catch (err1) {
      console.warn("⚠️ 試行1失敗:", err1.message);

      try {
        // より緩い設定で再試行
        console.log("   試行2: 緩い設定でカメラアクセス");
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        console.log("✅ 試行2成功");
      } catch (err2) {
        console.error("❌ 試行2失敗:", err2.message);
        throw err2;
      }
    }

    console.log("✅ カメラストリーム取得成功");
    console.log("   stream ID:", stream.id);
    console.log("   active:", stream.active);

    // トラック情報を詳細に表示
    const tracks = stream.getTracks();
    console.log("   トラック数:", tracks.length);
    tracks.forEach((track, index) => {
      console.log(`   トラック ${index + 1}:`, {
        kind: track.kind,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: track.getSettings(),
      });
    });

    // ビデオ要素にストリームを設定
    console.log("📹 ステップ5: ビデオ要素にストリームを設定");
    video.srcObject = stream;

    // ビデオの準備ができるまで待機
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => {
        console.log("✅ ビデオメタデータ読み込み完了");
        resolve();
      };

      video.onerror = (err) => {
        console.error("❌ ビデオ読み込みエラー:", err);
        reject(err);
      };

      // タイムアウト設定（10秒）
      setTimeout(() => {
        reject(new Error("ビデオ読み込みタイムアウト"));
      }, 10000);
    });

    // ビデオ再生
    console.log("📹 ステップ6: ビデオ再生開始");
    await video.play();
    console.log("✅ ビデオ再生中");

    // ビデオの状態を確認
    console.log("📹 ステップ7: ビデオ状態確認");
    console.log("   video.videoWidth:", video.videoWidth);
    console.log("   video.videoHeight:", video.videoHeight);
    console.log("   video.readyState:", video.readyState);
    console.log("   video.paused:", video.paused);
    console.log("   video.currentTime:", video.currentTime);

    if (video.readyState < 2) {
      console.warn("⚠️ ビデオの準備が不完全です");
      // 少し待ってから再確認
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("   再確認 - video.readyState:", video.readyState);
    }

    // 緑のライトが点灯しているか確認を促す
    const cameraStatus = document.createElement("div");
    cameraStatus.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 30px;
      border-radius: 12px;
      z-index: 9999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-align: center;
      max-width: 400px;
    `;

    cameraStatus.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 20px;">📹</div>
      <div style="font-size: 18px; font-weight: 600; margin-bottom: 15px;">
        カメラを確認してください
      </div>
      <div style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
        Macの画面上部にある<br>
        <span style="color: #00ff00; font-weight: 600;">🟢 緑のライト</span>が<br>
        点灯していますか？
      </div>
      <button id="cameraConfirmYes" style="
        background: #00ff00;
        color: black;
        border: none;
        padding: 12px 30px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin: 0 10px;
      ">はい、点灯しています</button>
      <button id="cameraConfirmNo" style="
        background: #ff3b30;
        color: white;
        border: none;
        padding: 12px 30px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin: 0 10px;
      ">いいえ、点灯していません</button>
    `;

    document.body.appendChild(cameraStatus);

    return new Promise((resolve) => {
      document.getElementById("cameraConfirmYes").onclick = () => {
        console.log("✅ ユーザー確認: カメラライト点灯");
        cameraStatus.remove();

        // ビデオを非表示に戻す
        video.style.display = "none";

        console.log("========================================");
        console.log("✅ カメラ初期化完了！");
        console.log("========================================");
        resolve(true);
      };

      document.getElementById("cameraConfirmNo").onclick = () => {
        console.error("❌ ユーザー確認: カメラライト未点灯");
        cameraStatus.remove();

        // トラブルシューティング情報を表示
        const troubleshoot = document.createElement("div");
        troubleshoot.style.cssText = cameraStatus.style.cssText;
        troubleshoot.innerHTML = `
          <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
          <div style="font-size: 18px; font-weight: 600; margin-bottom: 15px;">
            カメラが起動していません
          </div>
          <div style="font-size: 14px; line-height: 1.8; text-align: left; margin-bottom: 20px;">
            <strong>確認事項:</strong><br><br>
            1️⃣ <strong>システム環境設定</strong>を開く<br>
            2️⃣ <strong>セキュリティとプライバシー</strong>をクリック<br>
            3️⃣ <strong>カメラ</strong>タブを選択<br>
            4️⃣ <strong>Google Chrome</strong>にチェックが入っているか確認<br><br>
            5️⃣ 他のアプリ（Zoom、FaceTimeなど）がカメラを使用していないか確認<br><br>
            6️⃣ ブラウザを再起動してみる
          </div>
          <button id="closeTroubleshoot" style="
            background: #007aff;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          ">閉じる</button>
        `;

        document.body.appendChild(troubleshoot);

        document.getElementById("closeTroubleshoot").onclick = () => {
          troubleshoot.remove();
        };

        // ストリームを停止
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        if (video) {
          video.remove();
          video = null;
        }

        resolve(false);
      };
    });
  } catch (err) {
    console.error("========================================");
    console.error("❌ カメラ初期化エラー");
    console.error("========================================");
    console.error("   エラー名:", err.name);
    console.error("   エラーメッセージ:", err.message);
    console.error("   エラースタック:", err.stack);

    // エラーの種類に応じたメッセージ
    let errorMessage = "カメラの起動に失敗しました。\n\n";

    if (err.name === "NotAllowedError") {
      errorMessage +=
        "原因: カメラへのアクセスが拒否されました\n\n" +
        "対処法:\n" +
        "1. ブラウザのアドレスバー左側のアイコンをクリック\n" +
        "2. カメラの権限を「許可」に変更\n" +
        "3. ページを再読み込み";
    } else if (err.name === "NotFoundError") {
      errorMessage +=
        "原因: カメラが見つかりませんでした\n\n" +
        "対処法:\n" +
        "1. カメラが物理的に接続されているか確認\n" +
        "2. システム環境設定でカメラが有効か確認";
    } else if (err.name === "NotReadableError") {
      errorMessage +=
        "原因: カメラが他のアプリで使用中です\n\n" +
        "対処法:\n" +
        "1. Zoom、FaceTime、Skypeなどを終了\n" +
        "2. ブラウザを再起動";
    } else {
      errorMessage += `エラー: ${err.message}`;
    }

    alert(errorMessage);
    return false;
  }
}

// 顔検出を実行（拡張版：目の開閉と頭の角度も検出）
async function detectFace() {
  if (!video) {
    console.error("❌ videoオブジェクトが存在しません");
    return;
  }

  if (!isDetecting) {
    console.warn("⚠️ 検知が停止中です");
    return;
  }

  try {
    console.log("🔍 顔検出実行開始...");
    console.log("   video要素:", video);
    console.log("   video.videoWidth:", video.videoWidth);
    console.log("   video.videoHeight:", video.videoHeight);
    console.log("   video.readyState:", video.readyState);

    // videoが準備できているか確認
    if (video.readyState < 2) {
      console.warn(
        "⚠️ ビデオがまだ準備できていません (readyState:",
        video.readyState,
        ")"
      );
      return;
    }

    // face-api.jsで顔検出 + ランドマーク検出
    console.log("   face-api.js検出開始...");
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();

    console.log("   検出結果:", detections);
    console.log("   検出数:", detections ? detections.length : 0);

    // グローバル変数を更新
    faceDetected = detections && detections.length > 0;
    let eyesClosed = false;
    let headDown = false;

    if (faceDetected && detections[0].landmarks) {
      const landmarks = detections[0].landmarks;

      // 1. 目の開閉検出（EAR: Eye Aspect Ratio）
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();

      const leftEAR = calculateEAR(leftEye);
      const rightEAR = calculateEAR(rightEye);
      const avgEAR = (leftEAR + rightEAR) / 2;

      // EARが0.2以下なら目を閉じていると判定
      eyesClosed = avgEAR < 0.2;

      // 2. 頭の角度検出（鼻と顎の位置関係）
      const nose = landmarks.getNose();
      const jawline = landmarks.getJawOutline();

      // 鼻の先端と顎の中央のY座標差
      const noseY = nose[3].y; // 鼻の先端
      const chinY = jawline[8].y; // 顎の中央

      // 顎が鼻より大きく下にある場合、頭が下を向いている
      const headAngle = chinY - noseY;
      headDown = headAngle > 50; // しきい値：50ピクセル以上なら下向き

      console.log(
        "👁️ 目の開閉度 (EAR):",
        avgEAR.toFixed(3),
        eyesClosed ? "閉じている" : "開いている"
      );
      console.log(
        "📐 頭の角度:",
        headAngle.toFixed(1),
        headDown ? "下向き" : "正面"
      );
    }

    // 総合判定：顔未検出 OR 目を閉じている OR 頭が下向き
    const isSleeping = !faceDetected || eyesClosed || headDown;

    // 未検出/居眠り時間を計算
    if (isSleeping) {
      // 初回検出時に開始時刻を記録
      if (!window.lastDetectedTime) {
        window.lastDetectedTime = Date.now();
      }
      const currentTime = Date.now();
      const elapsedSeconds = Math.floor(
        (currentTime - window.lastDetectedTime) / 1000
      );

      let statusMessage = "";
      if (!faceDetected) {
        statusMessage = "顔未検出";
      } else if (eyesClosed) {
        statusMessage = "目を閉じている";
      } else if (headDown) {
        statusMessage = "頭が下向き";
      }

      updateStatus(false, elapsedSeconds, statusMessage);
    } else {
      // 正常状態：時刻をリセット
      window.lastDetectedTime = Date.now();
      updateStatus(true);
    }

    // Background Scriptに結果を送信
    chrome.runtime
      .sendMessage({
        type: "FACE_DETECTED",
        detected: !isSleeping,
        eyesClosed: eyesClosed,
        headDown: headDown,
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
  console.log("========================================");
  console.log("🔍 顔検出開始プロセス");
  console.log("========================================");

  if (isDetecting) {
    console.log("⚠️ 既に検知中です");
    return;
  }

  console.log("👁️ ステップ1: 顔検出を開始します...");

  // ステータスインジケーターを作成
  console.log("👁️ ステップ2: ステータスインジケーター作成");
  createStatusIndicator();
  console.log("✅ ステータスインジケーター作成完了");

  // face-api.jsを読み込み
  try {
    console.log("👁️ ステップ3: face-api.js確認開始");
    await loadFaceAPI();
    console.log("✅ face-api.js 確認完了");

    // face-api.jsが正しく読み込まれたか確認
    if (typeof faceapi === "undefined") {
      throw new Error(
        "face-api.jsオブジェクトが見つかりません。拡張機能を再読み込みしてください。"
      );
    }
    console.log("✅ face-api.js オブジェクト確認OK");

    // モデルを読み込み（顔検出 + ランドマーク検出）
    console.log("👁️ ステップ4: モデル読み込み開始");

    // 拡張機能のmodelsフォルダから読み込み
    const modelPath = chrome.runtime.getURL("models");
    console.log("   モデルパス:", modelPath);

    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
        faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
      ]);
      console.log("✅ 顔検出モデル読み込み完了");
      console.log("✅ ランドマーク検出モデル読み込み完了");
    } catch (modelErr) {
      console.error("❌ モデル読み込みエラー:", modelErr);
      throw new Error(
        "顔検出モデルの読み込みに失敗しました: " + modelErr.message
      );
    }
  } catch (err) {
    console.error("❌ face-api.js初期化エラー:", err);
    console.error("❌ エラー名:", err.name);
    console.error("❌ エラーメッセージ:", err.message);
    console.error("❌ エラースタック:", err.stack);

    alert(
      "顔検出システムの初期化に失敗しました\n\n" +
        "エラー: " +
        (err.message || "不明なエラー") +
        "\n\n" +
        "対処法:\n" +
        "1. 拡張機能を再読み込みしてください（chrome://extensions/）\n" +
        "2. ページを再読み込みしてください\n" +
        "3. ブラウザを再起動してみてください"
    );
    return;
  }

  // カメラを初期化
  console.log("👁️ ステップ5: カメラ初期化開始");
  const cameraReady = await initCamera();
  if (!cameraReady) {
    console.error("❌ カメラ初期化失敗");
    return;
  }
  console.log("✅ カメラ初期化完了");

  // 検知開始
  console.log("👁️ ステップ6: 検知状態の設定");
  isDetecting = true;
  window.lastDetectedTime = Date.now();
  console.log("   isDetecting:", isDetecting);
  console.log("   lastDetectedTime:", window.lastDetectedTime);

  // 1秒ごとに顔検出を実行
  console.log("👁️ ステップ7: 顔検出インターバル設定");
  detectionInterval = setInterval(detectFace, 1000);
  console.log("   detectionInterval ID:", detectionInterval);

  console.log("========================================");
  console.log("✅ 顔検出開始完了！");
  console.log("========================================");
  updateStatus(true);

  // 初回顔検出をすぐに実行
  console.log("👁️ 初回顔検出を実行");
  detectFace();
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

    case "DETECT_FACE":
      // 顔検出を即座に実行
      console.log("🔍 顔検出リクエスト受信 - 検出を実行");
      (async () => {
        await detectFace();
        // detectFace内でグローバル変数faceDetectedが更新される
        console.log("   検出結果:", faceDetected);
        sendResponse({ faceDetected: faceDetected });
      })();
      return true; // 非同期レスポンスを示す
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
