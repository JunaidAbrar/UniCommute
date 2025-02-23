import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, insertUserSchema } from "@shared/schema";
import { EmailService } from "./email";

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

        // Check if email is verified
        if (!user.isVerified) {
          return done(null, false, { message: "Please verify your email address before logging in" });
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

  // Step 1: Register with email verification
  app.post("/api/register", async (req, res, next) => {
    try {
      // Validate registration data
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

      // Send verification email
      try {
        await EmailService.sendVerificationEmail(parseResult.data.email);
      } catch (error) {
        return res.status(500).json({ message: "Failed to send verification email" });
      }

      // Create unverified user
      const user = await storage.createUser({
        ...parseResult.data,
        password: await hashPassword(parseResult.data.password),
      });

      res.status(201).json({ 
        message: "Registration successful. Please check your email for verification code.",
        userId: user.id
      });
    } catch (error) {
      next(error);
    }
  });

  // Step 2: Verify email with code
  app.post("/api/verify-email", async (req, res) => {
    const { email, code } = req.body;

    try {
      const isVerified = await EmailService.verifyCode(email, code);
      if (isVerified) {
        // Update user verification status
        await storage.verifyUserEmail(email);
        res.json({ message: "Email verified successfully. You can now log in." });
      } else {
        res.status(400).json({ message: "Invalid or expired verification code" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification failed";
      res.status(400).json({ message });
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