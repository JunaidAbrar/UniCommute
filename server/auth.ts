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
import { setupWebSocket } from "./websocket";

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
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Invalid username or password" });
        }

        if (!user.isVerified) {
          return done(null, false, { message: "Please verify your email before logging in" });
        }

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

      await storage.setResetPasswordOTP(user.id, otp, otpExpires);
      await sendPasswordResetOTP(user, otp);

      res.status(200).json({ message: "Password reset code sent to your email" });
    } catch (error) {
      res.status(500).json({ message: "Error processing password reset request" });
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, reset code, and new password are required" });
    }

    try {
      const user = await storage.verifyResetPasswordOTP(email, otp);
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }

      const hashedPassword = await hashPassword(newPassword);
      await storage.updatePassword(user.id, hashedPassword);

      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error resetting password" });
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

  setupWebSocket(app); //Moved setupWebSocket here

}

// Add WebSocket authentication middleware
export function authenticateWebSocket(socket: any, request: any): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (!request.headers.cookie) {
      resolve(undefined);
      return;
    }

    const sid = getCookie(request.headers.cookie, 'connect.sid');
    if (!sid) {
      resolve(undefined);
      return;
    }

    storage.sessionStore.get(sid, (err, session) => {
      if (err || !session?.passport?.user) {
        resolve(undefined);
        return;
      }

      resolve(session.passport.user);
    });
  });
}

function getCookie(cookieString: string, name: string): string | undefined {
  const match = cookieString.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : undefined;
}