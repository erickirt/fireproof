import { int, sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";
import { sqlUsers } from "./users.js";

export const sqlTenants = sqliteTable("Tenants", {
  tenantId: text().primaryKey(),
  name: text().notNull(),
  ownerUserId: text()
    .notNull()
    .references(() => sqlUsers.userId),
  maxAdminUsers: int().notNull().default(5),
  maxMemberUsers: int().notNull().default(5),
  maxInvites: int().notNull().default(10),
  maxLedgers: int().notNull().default(5),
  status: text().notNull().default("active"),
  statusReason: text().notNull().default("just created"),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

export const sqlTenantUsers = sqliteTable(
  "TenantUsers",
  {
    userId: text()
      .notNull()
      .references(() => sqlUsers.userId),
    tenantId: text()
      .notNull()
      .references(() => sqlTenants.tenantId),
    name: text(),
    role: text().notNull(), // "admin" | "member"
    status: text().notNull().default("active"),
    statusReason: text().notNull().default("just created"),
    default: int().notNull(), // order for the user
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tenantId] })],
);
