import React, { useRef, useEffect, useState } from "react";

const FaceRecognition = ({ onVerify, prisonerFaceDescriptor }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [verificationStatus, setVerificationStatus] = useState(null);
  const intervalRef = useRef(null);
  console.log("Face descriptor: ", prisonerFaceDescriptor)

  useEffect(() => {
    let isMounted = true;
    let stream = null;

    const loadScript = () => {
      return new Promise((resolve, reject) => {
        if (window.faceapi) {
          resolve(true);
          return;
        }

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => reject(new Error("Failed to load face-api.js"));
        document.body.appendChild(script);
      });
    };

    const loadResources = async () => {
      try {
        console.log("Loading face-api.js script...");
        await loadScript();

        if (!isMounted) return;

        console.log("Loading models...");
        const CDN_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

        await Promise.all([
          window.faceapi.nets.tinyFaceDetector.loadFromUri(CDN_URL),
          window.faceapi.nets.faceLandmark68Net.loadFromUri(CDN_URL),
          window.faceapi.nets.faceRecognitionNet.loadFromUri(CDN_URL),
          window.faceapi.nets.ssdMobilenetv1.loadFromUri(CDN_URL),
        ]);

        if (!isMounted) return;
        console.log("Models loaded successfully");

        await startVideo();
      } catch (err) {
        console.error("Error loading resources:", err);
        if (isMounted) {
          setStatus("error");
        }
      }
    };

    const startVideo = async () => {
      try {
        console.log("Starting video...");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (videoRef.current) {
          console.log("Video stream started");
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error starting video:", err);
        if (isMounted) {
          setStatus("error");
        }
      }
    };

    loadResources();

    return () => {
      isMounted = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Restart detection when prisonerFaceDescriptor is loaded
  useEffect(() => {
    if (status === "ready" && prisonerFaceDescriptor && videoRef.current && canvasRef.current) {
      handleVideoOnPlay();
    }
  }, [prisonerFaceDescriptor, status]);

  const handleVideoOnPlay = () => {
    console.log("Video playing");
    setStatus("ready");
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !window.faceapi) return;

    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    window.faceapi.matchDimensions(canvas, displaySize);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(async () => {
      if (!video || !canvas || !window.faceapi || verificationStatus === "verified") return;
      if (!prisonerFaceDescriptor) return; // Wait for prisoner face descriptor

      try {
        const detections = await window.faceapi.detectAllFaces(video, new window.faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptors();

        const resizedDetections = window.faceapi.resizeResults(detections, displaySize);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        if (prisonerFaceDescriptor && resizedDetections.length > 0) {
          let descriptorData = prisonerFaceDescriptor;
          if (typeof descriptorData === 'string') {
            descriptorData = JSON.parse(descriptorData);
          }
          const prisonerDescriptor = new Float32Array(
            Array.isArray(descriptorData) ? descriptorData : Object.values(descriptorData)
          );

          resizedDetections.forEach((detection) => {
            const distance = window.faceapi.euclideanDistance(detection.descriptor, prisonerDescriptor);

            const threshold = 0.6;
            const isMatch = distance < threshold;

            const box = detection.detection.box;
            const label = isMatch ? `Verified (${(1 - distance).toFixed(2)})` : `Not Verified (${distance.toFixed(2)})`;

            const color = isMatch ? "#16a34a" : "#dc2626";
            const drawBox = new window.faceapi.draw.DrawBox(box, {
              label,
              boxColor: color,
              lineWidth: 2,
            });
            drawBox.draw(canvas);

            if (isMatch && verificationStatus !== "verified") {
              setVerificationStatus("verified");
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
              }
              if (onVerify) {
                onVerify(true);
              }
            }
          });
        } else if (resizedDetections.length > 0) {
          window.faceapi.draw.drawDetections(canvas, resizedDetections);
          window.faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
        }
      } catch (err) {
        console.error("Detection error:", err);
      }
    }, 100);
  };

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "640px", margin: "0 auto" }}>
      {status === "loading" && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "20px",
            borderRadius: "8px",
            zIndex: 10,
          }}
        >
          Loading face recognition models...
        </div>
      )}
      {status === "error" && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "rgba(220,38,38,0.9)",
            color: "white",
            padding: "20px",
            borderRadius: "8px",
            maxWidth: "80%",
            textAlign: "center",
            zIndex: 10,
          }}
        >
          Error loading models or accessing camera. Please check camera permissions.
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onPlay={handleVideoOnPlay}
        style={{
          width: "100%",
          height: "auto",
          backgroundColor: "#000",
          borderRadius: "8px",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "auto",
        }}
      />
      {verificationStatus === "verified" && (
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#16a34a",
            color: "white",
            padding: "12px 24px",
            borderRadius: "8px",
            fontWeight: "bold",
            zIndex: 5,
            boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
          }}
        >
          ✓ Face Verified Successfully
        </div>
      )}
      {status === "ready" && !prisonerFaceDescriptor && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "12px 24px",
            borderRadius: "8px",
            zIndex: 5,
          }}
        >
          Waiting for prisoner face data...
        </div>
      )}
    </div>
  );
};

export default FaceRecognition;
