import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const listings = sqliteTable("listings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  description: text("description").notNull(),
  imageKey: text("image_key").notNull().unique(),
  imageType: text("image_type").notNull(),
  claimed: integer("claimed").notNull().default(0),
  sellerSub: text("seller_sub"),
  claimedBySub: text("claimed_by_sub"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  googleSub: text("google_sub").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  picture: text("picture"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
