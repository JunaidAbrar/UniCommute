import { User, InsertUser, Ride, InsertRide, Request, InsertRequest, Message, InsertMessage } from "@shared/schema";
import type { Store } from "express-session";
import { WebSocket } from 'ws';

export interface IStorage {
  sessionStore: Store;

  // User Operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  verifyUserEmail(email: string): Promise<User>; // New method

  // Ride Operations
  createRide(hostId: number, ride: InsertRide): Promise<Ride>;
  getRide(id: number): Promise<Ride | undefined>;
  getRideWithHost(id: number): Promise<(Ride & { host: User }) | undefined>;
  getActiveRides(): Promise<(Ride & { host: User })[]>;

  // Request Operations
  createRequest(userId: number, request: InsertRequest): Promise<Request>;
  getRequestsByRide(rideId: number): Promise<Request[]>;

  // Message Operations
  createMessage(userId: number, message: InsertMessage): Promise<Message>;
  getMessagesByRide(rideId: number): Promise<Message[]>;
}

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