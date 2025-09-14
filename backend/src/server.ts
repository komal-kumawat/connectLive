import express from "express";
import http from "http";
import cors from "cors";
import { ConnectToSocket } from "./controller/SocketManager";
import mongoose from "mongoose";
import userRoutes from "./route/user_routes";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
    "http://localhost:5174",   // local frontend
    process.env.CLIENT_URL as string     // deployed frontend
];

console.log(allowedOrigins);
// CORS middleware for Express (allow all origins)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow mobile apps / curl
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST"],
  credentials: true
}));


// Body parsers
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

// Connect WebSocket server with proper CORS (allow all)
const io = ConnectToSocket(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});



// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL as string)
    .then(() => console.log("Successfully connected to MongoDB"))
    .catch(err => console.error("Error connecting to MongoDB:", err));

// Routes
app.use("/api/v1/users", userRoutes);

// Start server
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
