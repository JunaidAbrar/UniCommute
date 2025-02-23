import nodemailer from 'nodemailer';
import { emailVerifications } from '@shared/schema';
import { db } from './db';
import { eq } from 'drizzle-orm';

// Create a transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});

export class EmailService {
  private static generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  static async sendVerificationEmail(email: string): Promise<string> {
    try {
      // Generate a 6-digit verification code
      const verificationCode = this.generateVerificationCode();
      
      // Set expiration time to 10 minutes from now
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Store verification code in database
      await db.insert(emailVerifications).values({
        email,
        code: verificationCode,
        expiresAt: expiresAt.toISOString(),
      });

      // Email content
      const mailOptions = {
        from: process.env.SMTP_EMAIL,
        to: email,
        subject: 'Verify your UniCommute email address',
        html: `
          <h1>Welcome to UniCommute!</h1>
          <p>Your verification code is: <strong>${verificationCode}</strong></p>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this verification, please ignore this email.</p>
        `
      };

      // Send email
      await transporter.sendMail(mailOptions);
      return verificationCode;
    } catch (error) {
      console.error('Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  static async verifyCode(email: string, code: string): Promise<boolean> {
    try {
      const [verification] = await db
        .select()
        .from(emailVerifications)
        .where(eq(emailVerifications.email, email))
        .orderBy(emailVerifications.createdAt, 'desc')
        .limit(1);

      if (!verification) {
        throw new Error('Verification code not found');
      }

      if (new Date(verification.expiresAt) < new Date()) {
        throw new Error('Verification code has expired');
      }

      if (verification.code !== code) {
        throw new Error('Invalid verification code');
      }

      // Clean up used verification code
      await db.delete(emailVerifications).where(eq(emailVerifications.id, verification.id));

      return true;
    } catch (error) {
      console.error('Error verifying code:', error);
      throw error;
    }
  }
}
