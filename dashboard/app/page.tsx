"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import "./student.css";

export default function StudentPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [name, setName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [status, setStatus] = useState<"active" | "drowsy" | "sleeping">(
    "active"
  );
  const [isDetecting, setIsDetecting] = useState(false);
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);
  const [detectionInfo, setDetectionInfo] = useState({
    eyesClosed: false,
    headDown: false,
    faceDetected: true,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const studentIdRef = useRef<string>("");

  // face-api.jsをロード
  useEffect(() => {
    const loadFaceApi = async () => {
      try {
        console.log("📦 face-api.js読み込み開始");

        // face-api.jsをCDNから読み込み
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js";
        script.async = true;

        script.onload = async () => {
          console.log("✅ face-api.js読み込み完了");

          // @ts-ignore
          const faceapi = window.faceapi;

          if (!faceapi) {
            console.error("❌ face-api.jsが利用できません");
            return;
          }

          // モデルをロード
          console.log("📦 モデル読み込み開始");
          const MODEL_URL =
            "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          ]);

          console.log("✅ モデル読み込み完了");
          setFaceApiLoaded(true);
        };

        script.onerror = () => {
          console.error("❌ face-api.jsの読み込みに失敗");
        };

        document.body.appendChild(script);
      } catch (err) {
        console.error("❌ face-api.js初期化エラー:", err);
      }
    };

    loadFaceApi();
  }, []);

  // 生徒IDを生成（ブラウザごとにユニーク）
  useEffect(() => {
    let id = localStorage.getItem("studentId");
    if (!id) {
      id =
        "student_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("studentId", id);
    }
    studentIdRef.current = id;
  }, []);

  // セッションに参加
  const joinSession = async () => {
    if (!name.trim()) {
      alert("名前を入力してください");
      return;
    }

    if (!sessionId) {
      alert("セッションIDが無効です");
      return;
    }

    if (!faceApiLoaded) {
      alert("顔検出の準備中です。もう少しお待ちください。");
      return;
    }

    setIsJoined(true);

    // カメラを起動
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;

        // ビデオが再生可能になったら検知開始
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play();
            startDetection();
          }
        };
      }
    } catch (err) {
      console.error("カメラエラー:", err);
      alert(
        "カメラの起動に失敗しました。カメラへのアクセスを許可してください。"
      );
      setIsJoined(false);
    }
  };

  // 顔検出を開始
  const startDetection = () => {
    console.log("🚀 顔検出開始");
    setIsDetecting(true);

    // 1秒ごとに顔検出
    detectionIntervalRef.current = setInterval(async () => {
      await detectFace();
    }, 1000);
  };

  // 顔検出実行
  const detectFace = async () => {
    if (!videoRef.current || !canvasRef.current || !faceApiLoaded) {
      return;
    }

    try {
      // @ts-ignore
      const faceapi = window.faceapi;

      if (!faceapi) return;

      // 顔検出
      const detections = await faceapi
        .detectSingleFace(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.5,
          })
        )
        .withFaceLandmarks();

      if (!detections) {
        // 顔が検出されない
        console.log("❌ 顔検出なし");
        updateDetectionInfo({
          eyesClosed: true,
          headDown: true,
          faceDetected: false,
        });
        return;
      }

      // ランドマークを取得
      const landmarks = detections.landmarks;

      // 目の開閉を判定
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();

      const eyesClosed = checkEyesClosed(leftEye, rightEye);

      // 頭の角度を判定
      const nose = landmarks.getNose();
      const headDown = checkHeadDown(nose);

      console.log("✅ 顔検出成功:", { eyesClosed, headDown });

      updateDetectionInfo({
        eyesClosed,
        headDown,
        faceDetected: true,
      });
    } catch (err) {
      console.error("顔検出エラー:", err);
    }
  };

  // 目が閉じているか判定
  const checkEyesClosed = (leftEye: any[], rightEye: any[]): boolean => {
    // 目の上下の距離を計算
    const leftEyeHeight = Math.abs(leftEye[1].y - leftEye[5].y);
    const rightEyeHeight = Math.abs(rightEye[1].y - rightEye[5].y);

    const avgHeight = (leftEyeHeight + rightEyeHeight) / 2;

    // 閾値（小さいほど目が閉じている）
    const threshold = 3;

    return avgHeight < threshold;
  };

  // 頭が下を向いているか判定
  const checkHeadDown = (nose: any[]): boolean => {
    // 鼻のY座標が大きい = 下を向いている
    const noseY = nose[3].y; // 鼻先
    const noseBridgeY = nose[0].y; // 鼻の付け根

    const diff = noseY - noseBridgeY;

    // 閾値
    const threshold = 50;

    return diff > threshold;
  };

  // 検出情報を更新してステータスを判定
  const updateDetectionInfo = (info: typeof detectionInfo) => {
    setDetectionInfo(info);

    // ステータスを判定
    let newStatus: "active" | "drowsy" | "sleeping" = "active";

    if (!info.faceDetected || (info.eyesClosed && info.headDown)) {
      newStatus = "sleeping";
    } else if (info.eyesClosed || info.headDown) {
      newStatus = "drowsy";
    }

    setStatus(newStatus);

    // サーバーに送信
    sendStatus(newStatus, info);
  };

  // ステータスをサーバーに送信
  const sendStatus = async (
    currentStatus: "active" | "drowsy" | "sleeping",
    info: typeof detectionInfo
  ) => {
    if (!sessionId) return;

    try {
      const response = await fetch("/api/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId,
          student: {
            id: studentIdRef.current,
            name: name,
            status: currentStatus,
            eyesClosed: info.eyesClosed,
            headDown: info.headDown,
            sleepDuration: currentStatus === "sleeping" ? 1 : 0,
            lastUpdate: Date.now(),
          },
        }),
      });

      if (!response.ok) {
        console.error("ステータス送信失敗:", response.status);
      }
    } catch (err) {
      console.error("送信エラー:", err);
    }
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  if (!sessionId) {
    return (
      <div className="student-page">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h1>セッションIDが無効です</h1>
          <p>先生から共有されたURLを使用してください</p>
        </div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="student-page">
        <div className="join-form">
          <div className="logo">👨‍🎓</div>
          <h1>ClassGuard</h1>
          <p className="subtitle">授業に参加</p>

          {!faceApiLoaded && (
            <div className="loading-indicator">
              <div className="spinner"></div>
              <p>顔検出システムを準備中...</p>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="name">あなたの名前</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田太郎"
              maxLength={20}
              onKeyPress={(e) => e.key === "Enter" && joinSession()}
              disabled={!faceApiLoaded}
            />
          </div>

          <button
            className="btn-join"
            onClick={joinSession}
            disabled={!faceApiLoaded}
          >
            {faceApiLoaded ? "🚀 参加する" : "準備中..."}
          </button>

          <div className="info-box">
            <p>📷 カメラへのアクセスを許可してください</p>
            <p>🔒 データは一時的に保存され、授業終了後に削除されます</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="student-page active">
      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="video-preview"
        />

        <canvas ref={canvasRef} style={{ display: "none" }} />

        <div className={`status-overlay status-${status}`}>
          <div className="status-icon">
            {status === "active" && "✅"}
            {status === "drowsy" && "😪"}
            {status === "sleeping" && "😴"}
          </div>
          <div className="status-text">
            {status === "active" && "集中中"}
            {status === "drowsy" && "眠そう"}
            {status === "sleeping" && "居眠り検知"}
          </div>
        </div>

        <div className="student-name">{name}</div>

        <div className="detection-info">
          <div className="info-item">
            👁️ {detectionInfo.eyesClosed ? "閉じている" : "開いている"}
          </div>
          <div className="info-item">
            📐 {detectionInfo.headDown ? "下向き" : "正常"}
          </div>
          <div className="info-item">
            {detectionInfo.faceDetected ? "✅ 顔検出中" : "❌ 顔未検出"}
          </div>
        </div>
      </div>
    </div>
  );
}
