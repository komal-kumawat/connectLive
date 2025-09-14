import { useEffect, useRef, useState, type JSX } from "react";
import { useNavigate, useParams } from "react-router-dom";
import io, { Socket } from "socket.io-client";
import {
  IconButton,
  Badge,
  Button as MuiButton,
} from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";
import { BACKEND_URL } from "../config";

// ------------ CONFIG ------------
const SIGNALING_SERVER_URL = BACKEND_URL;
const ICE_CONFIG: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
// --------------------------------

interface RemoteVideo { socketId: string; stream: MediaStream; }

export default function VideoMeet(): JSX.Element {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();

  const socketRef = useRef<Socket | null>(null);
  const mySocketIdRef = useRef<string | null>(null);
  const connectionsRef = useRef<Record<string, RTCPeerConnection>>({});

  const localCameraRef = useRef<HTMLVideoElement | null>(null);
  const localScreenRef = useRef<HTMLVideoElement | null>(null);

  const localCameraStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);

  const storedName = localStorage.getItem("name") || "Guest";
  const [username] = useState(storedName);

  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const [messages, setMessages] = useState<{ sender: string; text: string }[]>([]);
  const [messageText, setMessageText] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const [remoteVideos, setRemoteVideos] = useState<RemoteVideo[]>([]);
  const remoteVideosRef = useRef<RemoteVideo[]>([]);

  // ---------------- Helpers ----------------
  function createPeerConnection(remoteId: string) {
    if (connectionsRef.current[remoteId]) return connectionsRef.current[remoteId];

    const pc = new RTCPeerConnection(ICE_CONFIG);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) socketRef.current?.emit("signal", remoteId, JSON.stringify({ ice: ev.candidate }));
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (!stream) return;

      const exists = remoteVideosRef.current.find((r) => r.socketId === remoteId);
      if (exists) {
        remoteVideosRef.current = remoteVideosRef.current.map((r) => r.socketId === remoteId ? { ...r, stream } : r);
      } else {
        remoteVideosRef.current = [...remoteVideosRef.current, { socketId: remoteId, stream }];
      }
      setRemoteVideos([...remoteVideosRef.current]);
    };

    addTracksToPeer(pc);
    connectionsRef.current[remoteId] = pc;
    return pc;
  }

  function addTracksToPeer(pc: RTCPeerConnection) {
    // Add camera tracks only if not already added
    localCameraStreamRef.current?.getTracks().forEach((track) => {
      const alreadyAdded = pc.getSenders().some(sender => sender.track === track);
      if (!alreadyAdded) pc.addTrack(track, localCameraStreamRef.current!);
    });

    // Add screen tracks only if not already added
    localScreenStreamRef.current?.getTracks().forEach((track) => {
      const alreadyAdded = pc.getSenders().some(sender => sender.track === track);
      if (!alreadyAdded) pc.addTrack(track, localScreenStreamRef.current!);
    });
  }


  function cleanupPeer(remoteId: string) {
    connectionsRef.current[remoteId]?.close();
    delete connectionsRef.current[remoteId];
    remoteVideosRef.current = remoteVideosRef.current.filter((r) => r.socketId !== remoteId);
    setRemoteVideos([...remoteVideosRef.current]);
  }

  function cleanupAll() {
    for (const id in connectionsRef.current) { connectionsRef.current[id]?.close(); delete connectionsRef.current[id]; }
    socketRef.current?.disconnect();
    localCameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    localScreenStreamRef.current?.getTracks()?.forEach((t) => t.stop());
    localCameraStreamRef.current = null;
    localScreenStreamRef.current = null;
  }

  async function acquireLocalMedia() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localCameraStreamRef.current = stream;
      if (localCameraRef.current) localCameraRef.current.srcObject = stream;
      setCameraOn(true); setMicOn(true);
    } catch { setCameraOn(false); setMicOn(false); }
  }

  function connectToSignalingServer() {
    if (!meetingId) return;
    socketRef.current = io(SIGNALING_SERVER_URL);
    const socket = socketRef.current;

    socket.on("connect", () => {
      mySocketIdRef.current = socket.id || "";

      socket.emit("join-call", meetingId);
    });

    socket.on("user-joined", (id: string) => createPeerConnection(id));

    socket.on("signal", async (fromId: string, message: string) => {
      if (fromId === mySocketIdRef.current) return;
      try {
        const signal = JSON.parse(message);
        const pc = connectionsRef.current[fromId] || createPeerConnection(fromId);

        if (signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          if (signal.sdp.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("signal", fromId, JSON.stringify({ sdp: pc.localDescription }));
          }
        }
        if (signal.ice) await pc.addIceCandidate(new RTCIceCandidate(signal.ice));
      } catch (e) { console.error(e); }
    });

    socket.on("chat-message", (msg: string, sender: string) => {
      setMessages((prev) => [...prev, { sender, text: msg }]);
      if (!chatOpen) setUnread((n) => n + 1);
    });

    socket.on("user-left", (id: string) => cleanupPeer(id));
    socket.on("disconnect", cleanupAll);
  }

  async function joinRoom() { await acquireLocalMedia(); connectToSignalingServer(); }
  useEffect(() => { joinRoom(); return () => cleanupAll(); }, []);

  // ---------------- Controls ----------------
  const toggleCamera = () => {
    const track = localCameraStreamRef.current?.getVideoTracks()[0]; if (track) { track.enabled = !track.enabled; setCameraOn(track.enabled); }
  };
  const toggleMic = () => {
    const track = localCameraStreamRef.current?.getAudioTracks()[0]; if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
  };

  const startScreenShare = async () => {
    if (screenSharing) {
      localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
      // Remove screen tracks from all peers
      for (const pc of Object.values(connectionsRef.current)) {
        pc.getSenders()
          .filter(s => s.track?.kind === "video")
          .forEach(sender => pc.removeTrack(sender));
        addTracksToPeer(pc); // Re-add camera track
      }
      if (localScreenRef.current) localScreenRef.current.srcObject = null;
      if (localCameraRef.current) localCameraRef.current.srcObject = localCameraStreamRef.current;
      setScreenSharing(false);
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      localScreenStreamRef.current = displayStream;
      const screenTrack = displayStream.getVideoTracks()[0];

      for (const pc of Object.values(connectionsRef.current)) {
        displayStream.getTracks().forEach(track => pc.addTrack(track, displayStream));
      }

      if (localScreenRef.current) localScreenRef.current.srcObject = displayStream;

      screenTrack.onended = () => {
        localScreenStreamRef.current = null;
        for (const pc of Object.values(connectionsRef.current)) {
          pc.getSenders()
            .filter(s => s.track?.kind === "video" && displayStream.getTracks().includes(s.track))
            .forEach(sender => pc.removeTrack(sender));
          addTracksToPeer(pc); // Re-add camera
        }
        if (localScreenRef.current) localScreenRef.current.srcObject = null;
        if (localCameraRef.current) localCameraRef.current.srcObject = localCameraStreamRef.current;
        setScreenSharing(false);
      };

      setScreenSharing(true);
    } catch (e) { console.warn("Screen share failed", e); }
  };

  const leaveCall = () => { cleanupAll(); navigate("/"); };
  const sendChat = () => {
    if (!messageText.trim()) return;
    socketRef.current?.emit("chat-message", messageText, username);
    setMessages((prev) => [...prev, { sender: username, text: messageText }]);
    setMessageText("");
  };

  // ---------------- Render ----------------
  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      {/* Left: Video area */}
      <div style={{ flex: 3, position: "relative", background: "black" }}>
        {screenSharing ? (
          <video ref={localScreenRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <video ref={localCameraRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}

        {screenSharing && (
          <video ref={localCameraRef} autoPlay playsInline muted style={{ width: 200, height: 150, position: "absolute", bottom: 20, right: 20, borderRadius: 8, border: "2px solid white" }} />
        )}

        <div style={{ position: "absolute", top: 10, right: 10, display: "grid", gap: 8, gridTemplateColumns: "repeat(2, 120px)" }}>
          {remoteVideos.map((rv) => (
            <video key={rv.socketId} autoPlay playsInline ref={(el) => { if (el) el.srcObject = rv.stream; }} style={{ width: 120, height: 80, objectFit: "cover", background: "#000", borderRadius: 6 }} />
          ))}
        </div>

        <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 15 }}>
          <IconButton onClick={toggleMic} style={buttonStyle}>{micOn ? <MicIcon /> : <MicOffIcon />}</IconButton>
          <IconButton onClick={toggleCamera} style={buttonStyle}>{cameraOn ? <VideocamIcon /> : <VideocamOffIcon />}</IconButton>
          <IconButton onClick={startScreenShare} style={buttonStyle}>{screenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}</IconButton>
          <IconButton onClick={() => { setChatOpen((s) => !s); if (chatOpen) setUnread(0); }} style={buttonStyle}>
            <Badge badgeContent={unread} color="warning"><ChatIcon style={{ color: "white" }} /></Badge>
          </IconButton>
          <IconButton onClick={leaveCall} style={endCallButtonStyle}><CallEndIcon /></IconButton>
        </div>
      </div>

      {/* Right: Chat */}
      <div style={{ flex: chatOpen ? 1 : 0, width: chatOpen ? 320 : 0, transition: "width 0.25s ease", overflow: "hidden", borderLeft: chatOpen ? "1px solid #ddd" : "none", display: "flex", flexDirection: "column", background: "#f9f9f9" }}>
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #ddd" }}><h3>Chat</h3></div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {messages.length ? messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: "bold" }}>{m.sender}</div>
                <div>{m.text}</div>
              </div>
            )) : <div>No messages yet</div>}
          </div>
          <div style={{ padding: 12, borderTop: "1px solid #ddd" }}>
            <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} style={{ display: "flex", gap: 6, width: '100%' }}>
              <input value={messageText} onChange={(e) => setMessageText(e.target.value)} style={{ flex: 1, padding: 6, width: '100%' }} placeholder="Type a message..." />
              <MuiButton type="submit" variant="contained">Send</MuiButton>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = { padding: 10, borderRadius: 6, background: "#007bff", color: "white" };
const endCallButtonStyle: React.CSSProperties = { ...buttonStyle, background: "#dc3545" };
