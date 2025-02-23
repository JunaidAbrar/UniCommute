import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

async function startServer(port: number): Promise<void> {
  try {
    log(`Attempting to start server on port ${port}...`);

    // Create server first to set up WebSocket
    const server = await registerRoutes(app);

    // Set up error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      log(`Error: ${err.message}`);
    });

    // Listen on port before setting up Vite to ensure WebSocket server binds first
    await new Promise<void>((resolve, reject) => {
      server.listen(port, "0.0.0.0", () => {
        log(`HTTP and WebSocket servers started on port ${port}`);
        resolve();
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is in use`));
        } else {
          reject(error);
        }
      });
    });

    // Now set up Vite or static serving
    if (app.get("env") === "development") {
      log('Setting up Vite development server...');
      await setupVite(app, server);
      log('Vite development server ready');
    } else {
      log('Setting up static file serving...');
      serveStatic(app);
      log('Static file serving ready');
    }

    // Handle cleanup on server shutdown
    const cleanup = () => {
      server.close(() => {
        log('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => {
      log('SIGTERM signal received: closing HTTP server');
      cleanup();
    });

    process.on('SIGINT', () => {
      log('SIGINT signal received: closing HTTP server');
      cleanup();
    });

  } catch (error) {
    log(`Server startup failed: ${error}`);
    throw error;
  }
}

// Try an expanded range of ports if the default ports are in use
(async () => {
  const ports = Array.from({ length: 10 }, (_, i) => 5000 + i);

  for (const port of ports) {
    try {
      await startServer(port);
      break;
    } catch (error: any) {
      if (error.message?.includes('Port') && port !== ports[ports.length - 1]) {
        log(`Port ${port} is in use, trying next port...`);
        continue;
      }
      log(`Failed to start server: ${error.message}`);
      process.exit(1);
    }
  }
})();