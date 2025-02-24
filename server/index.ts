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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Set up WebSocket server
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

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

// Set up authentication before routes and websocket
setupAuth(app);

// Set up WebSocket after auth but before routes
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
  res.status(status).json({ message });
  console.error('Server error:', err);
});

// ALWAYS serve the app on port 5000
const port = 5000;
let server: any = null;

function cleanupServer() {
  return new Promise<void>((resolve) => {
    if (server) {
      log(`[PID:${process.pid}] Attempting to close existing server...`);
      server.close((err?: Error) => {
        if (err) {
          log(`[PID:${process.pid}] Error closing server: ${err.message}`);
        } else {
          log(`[PID:${process.pid}] Server closed successfully`);
        }
        resolve();
      });

      // Force close after 3 seconds if graceful shutdown fails
      setTimeout(() => {
        log(`[PID:${process.pid}] Force closing server after timeout`);
        resolve();
      }, 3000);
    } else {
      log(`[PID:${process.pid}] No server instance to cleanup`);
      resolve();
    }
  });
}

async function startServer() {
  try {
    log(`[PID:${process.pid}] Starting server...`);

    // Close existing server if any
    await cleanupServer();

    // Start new server
    server = httpServer.listen(port, '0.0.0.0', () => {
      log(`[PID:${process.pid}] Server running on port ${port}`);
    });

    server.on('error', async (error: any) => {
      if (error.code === 'EADDRINUSE') {
        log(`[PID:${process.pid}] Port ${port} is in use, attempting to close existing connections...`);
        await cleanupServer();

        // Add a small delay before retrying
        setTimeout(() => {
          log(`[PID:${process.pid}] Retrying server startup...`);
          startServer();
        }, 1000);
      } else {
        console.error(`[PID:${process.pid}] Server error:`, error);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error(`[PID:${process.pid}] Failed to start server:`, error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  log(`[PID:${process.pid}] SIGTERM received. Shutting down gracefully...`);
  await cleanupServer();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log(`[PID:${process.pid}] SIGINT received. Shutting down gracefully...`);
  await cleanupServer();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(`[PID:${process.pid}] Uncaught Exception:`, error);
  cleanupServer().then(() => process.exit(1));
});

process.on('unhandledRejection', (error) => {
  console.error(`[PID:${process.pid}] Unhandled Rejection:`, error);
  cleanupServer().then(() => process.exit(1));
});

startServer();