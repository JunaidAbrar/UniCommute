import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { setupWebSocket } from './websocket';
import { setupVite } from './vite';
import { setupRoutes } from './routes';
import { setupAuth } from './auth';
import { type Request, Response, NextFunction } from "express";
import { log } from "./vite";

const app = express();
const httpServer = createServer(app);

// Body parsing middleware first
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Set up WebSocket server
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Trust first proxy for secure cookies in production
app.set("trust proxy", 1);

// Set up authentication (includes session setup) before routes and websocket
setupAuth(app);

// Set up WebSocket with session support
setupWebSocket(wss, app);

// Set up routes
setupRoutes(app);

// importantly only setup vite in development and after
// setting up all the other routes so the catch-all route
// doesn't interfere with the other routes
if (app.get("env") === "development") {
  setupVite(app, httpServer);
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  log(`Error: ${message}`);
  res.status(status).json({ message });
  throw err;
});

// ALWAYS serve the app on port 5000
const port = 5000;
httpServer.listen(port, '0.0.0.0', () => {
  log(`Server running on port ${port}`);
});