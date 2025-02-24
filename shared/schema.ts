import { pgTable, text, serial, integer, boolean, timestamp, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define allowed email domains
const ALLOWED_EMAIL_DOMAINS = ["bracu.ac.bd", "g.bracu.ac.bd"];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  university: text("university").notNull(),
  gender: text("gender").notNull(),
  avatar: text("avatar"),
  isVerified: boolean("is_verified").notNull().default(false),
  verificationToken: text("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry", { withTimezone: true, mode: 'string' }),
  resetPasswordToken: text("reset_password_token"),
  resetPasswordTokenExpiry: timestamp("reset_password_token_expiry", { withTimezone: true, mode: 'string' })
});

// Validate email domain
const emailSchema = z.string().email().refine((email) => {
  const domain = email.split('@')[1];
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}, {
  message: "Email must be from an allowed university domain (@bracu.ac.bd or @g.bracu.ac.bd)"
});

export const transportType = z.enum(["PERSONAL", "UBER", "CNG"]);
export type TransportType = z.infer<typeof transportType>;

export const rides = pgTable(
  "rides",
  {
    id: serial("id").primaryKey(),
    hostId: integer("host_id")
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), 
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    stopPoints: text("stop_points").array().notNull().default([]),
    departureTime: timestamp("departure_time", { withTimezone: true, mode: 'string' }).notNull(),
    transportType: text("transport_type").notNull(),
    seatsAvailable: integer("seats_available").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    participants: integer("participants").array().notNull().default([]),
    femaleOnly: boolean("female_only").notNull().default(false),
    estimatedFare: integer("estimated_fare").notNull().default(0),
    isArchived: boolean("is_archived").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
  },
  (table) => ({
    hostIdIdx: index("host_id_idx").on(table.hostId),
    departureTimeIdx: index("departure_time_idx").on(table.departureTime),
    isActiveIdx: index("is_active_idx").on(table.isActive),
    isArchivedIdx: index("is_archived_idx").on(table.isArchived)
  })
);

export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true,
    email: true,
    university: true,
    gender: true
  })
  .extend({
    email: emailSchema
  });

export const requests = pgTable(
  "requests",
  {
    id: serial("id").primaryKey(),
    rideId: integer("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }), 
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), 
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow()
  },
  (table) => ({
    rideIdIdx: index("requests_ride_id_idx").on(table.rideId),
    userIdIdx: index("requests_user_id_idx").on(table.userId)
  })
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    rideId: integer("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }), 
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), 
    content: text("content").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    type: text("type").notNull().default('text'),
    attachment: text("attachment")
  },
  (table) => ({
    rideIdIdx: index("messages_ride_id_idx").on(table.rideId),
    userIdIdx: index("messages_user_id_idx").on(table.userId),
    timestampIdx: index("messages_timestamp_idx").on(table.timestamp)
  })
);

export const insertRequestSchema = createInsertSchema(requests).pick({
  rideId: true
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  rideId: true,
  content: true,
  type: true,
  attachment: true
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertRide = z.infer<typeof insertRideSchema>;
export type InsertRequest = z.infer<typeof insertRequestSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type User = typeof users.$inferSelect;
export type Ride = typeof rides.$inferSelect;
export type Request = typeof requests.$inferSelect;
export type Message = typeof messages.$inferSelect;