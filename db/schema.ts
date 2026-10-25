import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const bookings = sqliteTable('bookings', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), cast:text('cast').notNull(), slot:text('slot').notNull(), course:text('course').notNull(), minutes:integer('minutes').notNull(), price:integer('price').notNull(), status:text('status').notNull(), payment:text('payment').notNull(), expires:integer('expires').notNull(), created:integer('created').notNull(), terms:text('terms').notNull()
});
export const locks = sqliteTable('slot_locks',{id:text('id').primaryKey(), owner:text('owner').notNull(), cast:text('cast').notNull(), slot:text('slot').notNull(), booking:text('booking').notNull()}, t=>[uniqueIndex('unique_slot').on(t.owner,t.cast,t.slot)]);
export const messages = sqliteTable('messages',{id:text('id').primaryKey(),owner:text('owner').notNull(),booking:text('booking').notNull(),role:text('role').notNull(),body:text('body').notNull(),created:integer('created').notNull()});
export const events = sqliteTable('events',{id:text('id').primaryKey(),owner:text('owner').notNull(),booking:text('booking').notNull(),type:text('type').notNull(),created:integer('created').notNull()});
export const reports = sqliteTable('reports',{id:text('id').primaryKey(),owner:text('owner').notNull(),booking:text('booking').notNull(),body:text('body').notNull(),created:integer('created').notNull()});
