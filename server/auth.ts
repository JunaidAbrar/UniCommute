import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
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
    }),
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

      res.status(200).json({ message: "Email verified successfully. You can now log in." });
    } catch (error) {
      res.status(500).json({ message: "Error verifying email" });
    }
  });

  app.post("/api/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
      if (!email) {
        return res.status(400).json({
          message: "Email is required",
          error: "MISSING_EMAIL"
        });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Use same message to prevent email enumeration
        return res.status(200).json({
          message: "If an account exists with this email, you will receive a password reset code."
        });
      }

      try {
        const otp = await generateOTP();
        const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await storage.setResetPasswordOTP(user.id, otp, otpExpires);
        await sendPasswordResetOTP(user, otp);

        res.status(200).json({
          message: "If an account exists with this email, you will receive a password reset code."
        });
      } catch (error: any) {
        if (error.message === "Too many reset attempts. Please try again later.") {
          return res.status(429).json({
            message: error.message,
            error: "RATE_LIMITED"
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        message: "An error occurred while processing your request. Please try again.",
        error: "SERVER_ERROR"
      });
    }
  });

  app.post("/api/verify-reset-code", async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and reset code are required" });
    }

    try {
      const user = await storage.verifyResetPasswordOTP(email, otp);
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

    try {
      // Validate required fields
      if (!email || !otp || !newPassword) {
        return res.status(400).json({
          message: "Email, reset code, and new password are required",
          error: "MISSING_FIELDS"
        });
      }

      // Validate password length
      if (newPassword.length < 6) {
        return res.status(400).json({
          message: "Password must be at least 6 characters long",
          error: "INVALID_PASSWORD"
        });
      }

      // Verify OTP
      const user = await storage.verifyResetPasswordOTP(email, otp);
      if (!user) {
        return res.status(400).json({
          message: "Invalid or expired reset code. Please request a new code.",
          error: "INVALID_OTP"
        });
      }

      // Hash and update password
      const hashedPassword = await hashPassword(newPassword);
      await storage.updatePassword(user.id, hashedPassword);

      // Clear any existing sessions for this user
      await storage.clearUserSessions(user.id);

      res.status(200).json({
        message: "Password updated successfully. Please log in with your new password."
      });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({
        message: "An error occurred while resetting your password. Please try again.",
        error: "SERVER_ERROR"
      });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
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

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}