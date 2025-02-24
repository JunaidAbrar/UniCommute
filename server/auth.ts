import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, insertUserSchema } from "@shared/schema";
import { generateToken, sendVerificationEmail, sendPasswordResetEmail } from "./email";
import { generateOTP, sendVerificationOTP, sendPasswordResetOTP } from "./email";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Track failed login attempts
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_TIMEOUT = 15 * 60 * 1000; // 15 minutes

function checkLoginAttempts(username: string): boolean {
  const attempts = loginAttempts.get(username);
  if (!attempts) return true;

  const now = Date.now();
  if (now - attempts.lastAttempt > LOGIN_TIMEOUT) {
    loginAttempts.delete(username);
    return true;
  }

  return attempts.count < MAX_LOGIN_ATTEMPTS;
}

function recordLoginAttempt(username: string) {
  const attempts = loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
  attempts.count += 1;
  attempts.lastAttempt = Date.now();
  loginAttempts.set(username, attempts);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    name: 'connect.sid',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Expose session to WebSocket
  app.use((req, res, next) => {
    if (req.url.startsWith('/ws')) {
      // Store session data in res.locals for WebSocket access
      res.locals.session = req.session;
      res.locals.sessionID = req.sessionID;
      res.locals.user = req.user;
    }
    next();
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // Check for too many login attempts
        if (!checkLoginAttempts(username)) {
          return done(null, false, { message: "Too many login attempts. Please try again later." });
        }

        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          recordLoginAttempt(username);
          return done(null, false, { message: "Invalid username or password" });
        }

        if (!user.isVerified) {
          return done(null, false, { message: "Please verify your email before logging in" });
        }

        // Reset login attempts on successful login
        loginAttempts.delete(username);
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(new Error("User not found"));
      }
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const parseResult = insertUserSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "Invalid registration data",
          errors: parseResult.error.errors
        });
      }

      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Generate OTP
      const otp = await generateOTP();
      const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      const user = await storage.createUser({
        ...parseResult.data,
        password: await hashPassword(parseResult.data.password)
      });

      await storage.setVerificationOTP(user.id, otp, otpExpires);
      await sendVerificationOTP(user, otp);

      res.status(201).json({
        message: "Registration successful. Please check your email for verification code.",
        email: user.email
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/verify-email", async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and verification code are required" });
    }

    try {
      const user = await storage.verifyOTP(email, otp);
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired verification code" });
      }

      if (!user.isVerified) {
        return res.status(400).json({ message: "Email verification failed" });
      }

      res.status(200).json({ message: "Email verified successfully. You can now log in." });
    } catch (error) {
      res.status(500).json({ message: "Error verifying email" });
    }
  });

  app.post("/api/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    try {
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const otp = await generateOTP();
      const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await storage.setVerificationOTP(user.id, otp, otpExpires);
      await sendPasswordResetOTP(user, otp);

      console.log(`Password reset OTP sent to ${email}`); // Add logging
      res.status(200).json({ message: "Password reset code sent to your email" });
    } catch (error) {
      console.error('Error in forgot-password:', error); // Add error logging
      res.status(500).json({ message: "Error processing password reset request" });
    }
  });

  app.post("/api/verify-reset-code", async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and reset code are required" });
    }

    try {
      const user = await storage.verifyOTP(email, otp);
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }

      res.status(200).json({ message: "Reset code verified successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error verifying reset code" });
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, reset code, and new password are required" });
    }

    try {
      const user = await storage.verifyOTP(email, otp);
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }

      const hashedPassword = await hashPassword(newPassword);
      await storage.updatePassword(user.id, hashedPassword);

      // Clear all sessions for this user for security
      await storage.clearUserSessions(user.id);

      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error resetting password" });
    }
  });

  app.post("/api/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: Error | null, user: Express.User | false, info: { message: string } | undefined) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Authentication failed" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req: Request, res: Response, next: NextFunction) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}