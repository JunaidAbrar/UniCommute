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
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      throw err;
    });

    if (app.get("env") === "development") {
      log('Setting up Vite development server...');
      await setupVite(app, server);
    } else {
      log('Setting up static file serving...');
      serveStatic(app);
    }

    await new Promise<void>((resolve, reject) => {
      server.listen(port, "0.0.0.0", () => {
        log(`Server successfully started on port ${port}`);
        resolve();
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is in use`));
        } else {
          reject(error);
        }
      });

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
    });
  } catch (error) {
    log(`Server startup failed: ${error}`);
    throw error;
  }
}

// Try a range of ports if the default port is in use
(async () => {
  const ports = [5000, 5001, 5002, 5003, 5004];

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