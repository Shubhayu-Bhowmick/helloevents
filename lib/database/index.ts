import { MongoError } from 'mongodb';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

let cached = (global as any).mongoose || { conn: null, promise: null };

export const connectToDatabase = async () => {
  if (cached.conn) return cached.conn;

  if (!MONGODB_URI) throw new DatabaseError('MONGODB_URI is missing');

  cached.promise = cached.promise || mongoose.connect(MONGODB_URI, {
    dbName: 'evently',
    bufferCommands: false,
  })

  cached.conn = await cached.promise;

  return cached.conn;
}

export class DatabaseError extends Error {
  readonly code: number | undefined | string;
  readonly cause: any;

  constructor(data: unknown) {
    super();

    if (typeof data === "string") {
      this.message = data;
    } else if (data instanceof MongoError) {
      this.message = data.message;
      this.cause = data;
      this.code = data.code;
    } else if (data instanceof Error) {
      this.message = data.message;
      this.cause = data;
    } else {
      this.message = "Unexpected error happened";
    }

    this.name = "DatabaseError";
  }
}
