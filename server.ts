import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import { google } from "googleapis";
import dotenv from "dotenv";
import cron from "node-cron";
import axios from "axios";
import fs from "fs";
import { Readable } from "stream";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());
  const cleanSecret = (val: string | undefined) => {
    if (!val) return "";
    return val.trim()
      .replace(/^["']|["']$/g, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "");
  };
  const sessionSecret = cleanSecret(process.env.SESSION_SECRET) || "local-dev-session-secret";
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: true,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      },
    })
  );

  const youtubeClientId = cleanSecret(process.env.YOUTUBE_CLIENT_ID || process.env.CLIENT_ID);
  const youtubeClientSecret = cleanSecret(process.env.YOUTUBE_CLIENT_SECRET || process.env.CLIENT_SECRET);

  const isPlaceholder = (val: string) => {
    const placeholders = ["TODO_KEYHERE", "YOUR_CLIENT_ID", "YOUR_CLIENT_SECRET", "placeholder"];
    return !val || placeholders.some(p => val.toLowerCase().includes(p.toLowerCase()));
  };

  console.log("[Startup] YouTube API Credentials Check:");
  console.log("- YOUTUBE_CLIENT_ID:", youtubeClientId ? `${youtubeClientId.substring(0, 20)}...${youtubeClientId.substring(youtubeClientId.length - 5)}` : "MISSING");
  console.log("- YOUTUBE_CLIENT_SECRET:", youtubeClientSecret ? `PRESENT (Length: ${youtubeClientSecret.length})` : "MISSING");
  console.log("- Source:", process.env.YOUTUBE_CLIENT_ID ? "YOUTUBE_CLIENT_ID" : (process.env.CLIENT_ID ? "CLIENT_ID" : "NONE"));
  
  if (isPlaceholder(youtubeClientId) || isPlaceholder(youtubeClientSecret)) {
    console.warn("[Startup] WARNING: YouTube API credentials appear to be placeholders or missing!");
  }

  // Helper to get the current base URL dynamically
  const getBaseUrl = (req: express.Request) => {
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers["host"];
    // Prefer APP_URL if set, but fallback to dynamic detection
    const baseUrl = (process.env.APP_URL || `${protocol}://${host}`).trim().replace(/\/$/, "");
    return baseUrl;
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Diagnostic endpoint (Safe)
  app.get("/api/debug/secrets", (req, res) => {
    res.json({
      clientId: {
        value: youtubeClientId ? `${youtubeClientId.substring(0, 15)}...${youtubeClientId.substring(youtubeClientId.length - 10)}` : "MISSING",
        length: youtubeClientId.length,
        isPlaceholder: isPlaceholder(youtubeClientId)
      },
      clientSecret: {
        present: !!youtubeClientSecret,
        length: youtubeClientSecret.length,
        isPlaceholder: isPlaceholder(youtubeClientSecret)
      },
      baseUrl: getBaseUrl(req),
      envSource: process.env.YOUTUBE_CLIENT_ID ? "YOUTUBE_CLIENT_ID" : (process.env.CLIENT_ID ? "CLIENT_ID" : "NONE")
    });
  });

  // YouTube OAuth URL
  app.get("/api/auth/youtube/url", (req, res) => {
    console.log("[OAuth] Request for YouTube Auth URL received");
    
    if (isPlaceholder(youtubeClientId) || isPlaceholder(youtubeClientSecret)) {
      console.error("[OAuth] Error: YouTube API credentials are missing or placeholders.");
      console.error("- Client ID:", youtubeClientId || "MISSING");
      console.error("- Client Secret:", youtubeClientSecret ? "PRESENT" : "MISSING");
      
      return res.status(500).json({ 
        error: "YouTube API credentials are not properly configured. Add valid YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET values in your environment configuration." 
      });
    }

    const redirectUri = `${getBaseUrl(req)}/auth/youtube/callback`;
    console.log("[OAuth] Generating Auth URL with:");
    console.log("- Full Client ID:", youtubeClientId);
    console.log("- Redirect URI:", redirectUri);
    console.log("- Client Secret Length:", youtubeClientSecret.length);

    const client = new google.auth.OAuth2(
      youtubeClientId,
      youtubeClientSecret,
      redirectUri
    );

    const scopes = [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ];

    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent",
    });
    res.json({ url });
  });

  // YouTube OAuth Callback
  app.get("/auth/youtube/callback", async (req, res) => {
    const { code, error } = req.query;
    const redirectUri = `${getBaseUrl(req)}/auth/youtube/callback`;
    
    console.log("[OAuth] Callback Received");
    console.log("[OAuth] Redirect URI used for exchange:", redirectUri);

    if (error) {
      console.error("[OAuth] Error from Google:", error);
      return res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'YOUTUBE_AUTH_ERROR', 
                  error: ${JSON.stringify(error)} 
                }, '*');
                window.close();
              }
            </script>
            <p>Authentication failed: ${error}</p>
          </body>
        </html>
      `);
    }

    const client = new google.auth.OAuth2(
      youtubeClientId,
      youtubeClientSecret,
      redirectUri
    );

    try {
      console.log("[OAuth] Exchanging code for tokens...");
      const { tokens } = await client.getToken(code as string);
      console.log("[OAuth] Tokens exchanged successfully");
      // In a real app, store these in Firestore linked to the user
      // For now, we'll send them back to the frontend via postMessage
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'YOUTUBE_AUTH_SUCCESS', 
                  tokens: ${JSON.stringify(tokens)} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("[OAuth] Token Exchange Error:", err.message);
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'YOUTUBE_AUTH_ERROR', 
                  error: ${JSON.stringify(err.message)} 
                }, '*');
                window.close();
              }
            </script>
            <p>Token exchange failed: ${err.message}</p>
          </body>
        </html>
      `);
    }
  });

  // YouTube Channel Info
  app.post("/api/youtube/channel", async (req, res) => {
    const { tokens } = req.body;
    if (!tokens) return res.status(400).json({ error: "No tokens provided" });

    try {
      const redirectUri = `${getBaseUrl(req)}/auth/youtube/callback`;
      const client = new google.auth.OAuth2(
        youtubeClientId,
        youtubeClientSecret,
        redirectUri
      );
      client.setCredentials(tokens);
      const youtube = google.youtube({ version: "v3", auth: client });
      const response = await youtube.channels.list({
        part: ["snippet", "contentDetails", "statistics", "status"],
        mine: true,
      });

      if (response.data.items && response.data.items.length > 0) {
        const channel = response.data.items[0];
        res.json({
          found: true,
          channel: {
            id: channel.id,
            title: channel.snippet?.title,
            description: channel.snippet?.description,
            photo: channel.snippet?.thumbnails?.default?.url,
            uploadsEnabled: channel.status?.isLinked,
          },
        });
      } else {
        res.json({ found: false });
      }
    } catch (error) {
      console.error("YouTube Channel API Error:", error);
      res.status(500).json({ error: "Failed to fetch channel info" });
    }
  });

  // YouTube Video Upload API
  app.post("/api/youtube/upload", async (req, res) => {
    const { tokens, videoUrl, title, description, tags, category } = req.body;
    
    if (!tokens || !videoUrl) {
      return res.status(400).json({ error: "Missing tokens or video URL" });
    }

    try {
      const redirectUri = `${getBaseUrl(req)}/auth/youtube/callback`;
      const client = new google.auth.OAuth2(
        youtubeClientId,
        youtubeClientSecret,
        redirectUri
      );
      client.setCredentials(tokens);
      const youtube = google.youtube({ version: "v3", auth: client });

      console.log(`[YouTube Upload] Downloading video from: ${videoUrl}`);
      const videoResponse = await axios({
        method: 'get',
        url: videoUrl,
        responseType: 'stream'
      });

      console.log(`[YouTube Upload] Initiating upload to YouTube...`);
      const uploadResponse = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: title.substring(0, 100),
            description: description.substring(0, 5000),
            tags: tags.slice(0, 20),
            categoryId: category || "22",
          },
          status: {
            privacyStatus: "public", // Or "unlisted" for testing
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: videoResponse.data,
        },
      });

      console.log(`[YouTube Upload] Success! Video ID: ${uploadResponse.data.id}`);
      res.json({ 
        success: true, 
        videoId: uploadResponse.data.id 
      });
    } catch (error: any) {
      console.error("[YouTube Upload] Error:", error.response?.data || error.message);
      res.status(500).json({ 
        error: error.response?.data?.error?.message || error.message || "Failed to upload video" 
      });
    }
  });

  // Daily Scheduler (Placeholder for job management)
  // Runs every day at 5:00 PM
  cron.schedule("0 17 * * *", () => {
    console.log("Running daily YouTube publishing job...");
    // Logic to find pending jobs and mark them for publishing
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
