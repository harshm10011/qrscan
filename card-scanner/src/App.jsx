import { useState, useRef, useEffect } from "react";

export default function App() {
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [videoReady, setVideoReady] = useState(false);
  const [apiError, setApiError] = useState("");
  const [modelUsed, setModelUsed] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // CHANGE THESE TWO LINES ONLY
  const GEMINI_API_KEY = "AIzaSyDtMevBXfNHPF3yl_-Grd7ey7nJotGp8ik";                    // ← put your key
  const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbzG0GYDKokcSfpJ15lw0LTiepkkniEiO61qbb9L2UNNO6XqulrHCDoNBXWHbNtXuFGRBA/exec"; // ← your Apps Script URL

  // Start camera (works on phone + desktop)
  const startCamera = async () => {
    setCameraError("");
    setCameraLoading(true);
    setVideoReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // back camera on phone
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        // If metadata already loaded, mark ready; otherwise listen for loadedmetadata
        if (videoRef.current.videoWidth > 0 || videoRef.current.readyState >= 2) {
          setVideoReady(true);
        } else {
          const handler = () => setVideoReady(true);
          videoRef.current.addEventListener("loadedmetadata", handler, { once: true });
        }
      }
      setCameraOpen(true);
      setCameraLoading(false);
    } catch (err) {
      const msg = "Camera error: " + (err?.message || err) + "\nMake sure you're on HTTPS or localhost";
      setCameraError(msg);
      setCameraLoading(false);
      setCameraOpen(false);
      console.error(msg);
    }
  };

  // Take photo
  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video) return;
    // Ensure metadata is loaded so videoWidth/videoHeight are set
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      await new Promise((resolve) => {
        const handler = () => {
          video.removeEventListener("loadedmetadata", handler);
          resolve();
        };
        video.addEventListener("loadedmetadata", handler);
      });
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setImage(dataUrl);
    stopCamera();
    extractWithGemini(dataUrl);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraOpen(false);
    setVideoReady(false);
    setCameraLoading(false);
    // Clear video srcObject to release the camera in some browsers
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // Call Gemini 1.5 Flash
  const extractWithGemini = async (dataUrl) => {
    setLoading(true);
    setApiError("");
    setModelUsed("");
    const base64 = dataUrl.split(",")[1];

    const body = {
      contents: [{
        parts: [
          { text: `Extract only this JSON from the business card (no extra text, no markdown):

{
  "name": "",
  "email": "",
  "mobile": "",
  "website": "",
  "address": ""
}

Rules:
- Return only valid JSON
- mobile with country code
- email lowercase
- add https:// to website if missing
- empty string if not found`},
          { inline_data: { mime_type: "image/jpeg", data: base64 }}
        ]
      }]
    };

    try {
      // Helper: try generate with a model name and return parsed JSON if available
      const tryGenerate = async (modelName) => {
        const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const raw = await r.text();
        if (!r.ok) {
          // Return r.ok false as part of failure, caller will handle
          const parsed = (() => { try { return JSON.parse(raw); } catch (e) { return raw; }})();
          const msg = parsed?.error?.message || `HTTP ${r.status} - ${raw}`;
          const e = new Error(msg);
          e.status = r.status;
          e.raw = raw;
          throw e;
        }
        return JSON.parse(raw);
      };

      // First try the preferred model in older code if present
      const preferredModels = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5", "gemini-1.0", "models/text-bison-001"];
      let data = null;
      let tried = [];
      for (const candidate of preferredModels) {
        try {
          data = await tryGenerate(candidate.replace(/^models\//, ""));
          setModelUsed(candidate);
          break;
        } catch (err) {
          console.warn(`Model ${candidate} failed:`, err?.message ?? err);
          tried.push(candidate);
          // If no more candidates, fallthrough
        }
      }

      // If none of the preferred models worked, try listing models from API and pick gemini-like ones
      if (!data) {
        try {
          const listRes = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`);
          const listText = await listRes.text();
          const listJson = (() => { try { return JSON.parse(listText); } catch (e) { return null; }})();
          const models = listJson?.models || [];
          // pick a model with name containing gemini or a model that looks supported
          const candidates = models.map(m => m.name).filter(Boolean).filter(n => /gemini|bison|t5|ul2/i.test(n));
          for (const candidate of candidates) {
            try {
              data = await tryGenerate(candidate.replace(/^models\//, ""));
              setModelUsed(candidate);
              break;
            } catch (err) {
              console.warn(`Model ${candidate} from ListModels failed:`, err?.message ?? err);
              tried.push(candidate);
            }
          }
        } catch (err) {
          console.warn("ListModels attempt failed:", err);
        }
      }

      if (!data) {
        throw new Error(`No supported model worked. Tried: ${tried.join(", ")}. Call ListModels to inspect models available for your API key.`);
      }

      // If response is not OK, show helpful information
      // Validate structure before reading fields
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        console.error("Gemini response missing candidates/content:", data);
        throw new Error("Gemini response format changed or contained no candidate text. See console for details.");
      }

      // Remove code fences if present
      const cleaned = text.trim().replace(/```json|```/g, "");
      let json;
      try {
        json = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error("Failed to parse JSON returned by Gemini:", cleaned);
        throw new Error("Could not parse JSON from Gemini output. Raw: " + cleaned.slice(0, 500));
      }
      setResult(json);
    } catch (err) {
      // Show inline API error instead of alert
      const msg = err?.message || String(err);
      setApiError("Gemini error: " + msg);
      console.error("Gemini error:", err);
    }
    setLoading(false);
  };

  // Save to Google Sheet
  const save = async () => {
    await fetch(SHEET_WEBHOOK, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
    });
    alert("Saved to Google Sheet!");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: 20, textAlign: "center" }}>
      <h1>Visiting Card Scanner</h1>

      {!image ? (
        <>
          <button onClick={() => (cameraOpen ? stopCamera() : startCamera())} style={{ padding: 15, fontSize: 20 }} disabled={cameraLoading}>
            {cameraLoading ? "Opening..." : (cameraOpen ? "Close Camera" : "Open Camera")}
          </button>
          {cameraLoading && <p style={{ marginTop: 12 }}>Opening camera... 🔒</p>}
          {cameraError && (
            <div style={{ marginTop: 12, background: "#fee", padding: 10, borderRadius: 8, color: "#900" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ textAlign: "left" }}>{cameraError}</div>
                <div>
                  <button onClick={() => setCameraError("")} style={{ padding: "4px 8px" }}>Dismiss</button>
                </div>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            playsInline
            style={{ width: "100%", marginTop: 20, borderRadius: 12, display: cameraOpen ? "block" : "none" }}
          />

          {cameraOpen && (
            <div style={{ marginTop: 20 }}>
              <button onClick={capture} disabled={cameraLoading || loading || !videoReady} style={{ padding: "16px 32px", fontSize: 24, background: cameraLoading || loading || !videoReady ? "#ccc" : "#0f0", border: "none", borderRadius: 50 }}>
                {cameraLoading ? "..." : (loading ? "Reading..." : "Capture")}
              </button>
            </div>
          )}

          {/* Show API error messages below the camera (if any) */}
          {apiError && (
            <div style={{ marginTop: 12, background: "#fee", padding: 10, borderRadius: 8, color: "#900" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ textAlign: "left" }}>{apiError}</div>
                <div>
                  <button onClick={() => setApiError("")} style={{ padding: "4px 8px" }}>Dismiss</button>
                </div>
              </div>
            </div>
          )}
          {modelUsed && (
            <div style={{ marginTop: 12, background: "#eef", padding: 8, borderRadius: 8, color: "#033" }}>
              Using model: <strong>{modelUsed}</strong>
            </div>
          )}
        </>
      ) : (
        <>
          <img src={image} alt="card" style={{ width: "100%", border: "3px solid #333", borderRadius: 12 }} />
          {loading ? <p>AI reading card...</p> : (
            <div style={{ marginTop: 20, textAlign: "left" }}>
              <p><strong>Name:</strong> {result?.name || "-"}</p>
              <p><strong>Email:</strong> {result?.email || "-"}</p>
              <p><strong>Mobile:</strong> {result?.mobile || "-"}</p>
              <p><strong>Website:</strong> {result?.website || "-"}</p>
              <p><strong>Address:</strong> {result?.address || "-"}</p>

              <div style={{ marginTop: 30 }}>
                <button onClick={save} style={{ padding: 15, fontSize: 18, background: "#0f0", color: "#000", marginRight: 10 }}>
                  Save to Google Sheet
                </button>
                <button onClick={() => { setImage(null); setResult(null); }} style={{ padding: 15 }}>
                  Scan New Card
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}