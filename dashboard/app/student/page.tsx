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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

    setIsJoined(true);

    // カメラを起動
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }

      setIsDetecting(true);
      startDetection();
    } catch (err) {
      console.error("カメラエラー:", err);
      alert("カメラの起動に失敗しました");
    }
  };

  // 顔検出を開始（簡易版）
  const startDetection = () => {
    setInterval(() => {
      // サーバーに状態を送信
      sendStatus();
    }, 2000);
  };

  // 状態を送信
  const sendStatus = async () => {
    try {
      await fetch("/api/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          student: {
            id: generateStudentId(),
            name,
            status,
            eyesClosed: status !== "active",
            headDown: status === "sleeping",
            sleepDuration: 0,
            lastUpdate: Date.now(),
          },
        }),
      });
    } catch (err) {
      console.error("送信エラー:", err);
    }
  };

  // 生徒IDを生成（ブラウザごとにユニーク）
  const generateStudentId = () => {
    let id = localStorage.getItem("studentId");
    if (!id) {
      id =
        "student_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("studentId", id);
    }
    return id;
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
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
            />
          </div>

          <button className="btn-join" onClick={joinSession}>
            🚀 参加する
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
      </div>

      <div className="controls">
        <h2>👁️ 居眠り検知中</h2>
        <p>顔が画面に映るようにしてください</p>

        {/* デバッグ用：手動でステータスを変更 */}
        <div className="debug-controls">
          <button onClick={() => setStatus("active")}>✅ 集中中</button>
          <button onClick={() => setStatus("drowsy")}>😪 眠そう</button>
          <button onClick={() => setStatus("sleeping")}>😴 居眠り</button>
        </div>
      </div>
    </div>
  );
}
