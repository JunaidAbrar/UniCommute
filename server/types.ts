import { User, InsertUser, Ride, InsertRide, Request, InsertRequest, Message, InsertMessage } from "@shared/schema";
import type { Store } from "express-session";
import { WebSocket } from 'ws';

// Define RideWithDetails type
export type RideWithDetails = Omit<Ride, 'participants'> & {
  host: Pick<User, 'username' | 'university'>;
  participants: User[];
  estimatedFare: number;
};

export interface IStorage {
  sessionStore: Store;

  // User Operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  setVerificationOTP(userId: number, otp: string, expires: Date): Promise<void>;
  verifyOTP(email: string, otp: string): Promise<User | undefined>;
  setResetPasswordOTP(userId: number, otp: string, expires: Date): Promise<void>;
  verifyResetPasswordOTP(email: string, otp: string): Promise<User | undefined>;
  updatePassword(userId: number, newPassword: string): Promise<void>;
  clearUserSessions(userId: number): Promise<void>; // Added this method

  // Ride Operations
  createRide(hostId: number, ride: InsertRide): Promise<Ride>;
  getRide(id: number): Promise<Ride | undefined>;
  getRideWithHost(id: number): Promise<(Ride & { host: User }) | undefined>;
  getActiveRides(): Promise<RideWithDetails[]>;
  getArchivedRides(userId: number): Promise<RideWithDetails[]>;
  archiveRide(rideId: number): Promise<Ride>;
  autoArchiveExpiredRides(): Promise<void>;

  // Request Operations
  createRequest(userId: number, request: InsertRequest): Promise<Request>;
  getRequestsByRide(rideId: number): Promise<Request[]>;

  // Message Operations
  createMessage(userId: number, message: InsertMessage): Promise<Message>;
  getMessagesByRide(rideId: number): Promise<Message[]>;
}

// WebSocket types
export interface WebSocketClient extends WebSocket {
  userId?: number;
  rideId?: number;
}

export interface ChatRoom {
  rideId: number;
  clients: Set<WebSocketClient>;
}

export interface ChatMessage {
  id: string;
  rideId: number;
  userId: number;
  username: string;
  content: string;
  timestamp: Date;
}