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

// Store the HTTP server instance in the Express app
app.set('server', httpServer);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Set up authentication before routes and websocket
setupAuth(app);

// Set up routes
setupRoutes(app);

// Setup WebSocket after auth and routes
setupWebSocket(app);

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
  throw err;
});

// ALWAYS serve the app on port 5000
const port = 5000;
const maxRetries = 3;
let retryCount = 0;

function startServer() {
  httpServer.listen(port, '0.0.0.0', () => {
    log(`Server running on port ${port}`);
  }).on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      log(`Port ${port} is in use`);
      if (retryCount < maxRetries) {
        retryCount++;
        log(`Retrying in 1 second... (Attempt ${retryCount}/${maxRetries})`);
        setTimeout(startServer, 1000);
      } else {
        log('Max retry attempts reached. Could not start server.');
        process.exit(1);
      }
    } else {
      log(`Error starting server: ${error.message}`);
      process.exit(1);
    }
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  log('SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('SIGINT received. Shutting down gracefully...');
  httpServer.close(() => {
    log('Server closed');
    process.exit(0);
  });
});

startServer();