declare module 'express' {
  import type { IncomingMessage, ServerResponse } from 'http';

  export interface Request extends IncomingMessage {
    body?: any;
    params: Record<string, string>;
    query: Record<string, any>;
    cookies?: Record<string, string>;
    ip?: string;
    [key: string]: any;
  }

  export interface Response extends ServerResponse {
    json(body: any): this;
    status(code: number): this;
    cookie(name: string, value: any, options?: any): this;
    clearCookie(name: string, options?: any): this;
    redirect(url: string): this;
    redirect(status: number, url: string): this;
  }

  export type NextFunction = (...args: any[]) => any;

  const express: any;
  export default express;
}

declare module 'archiver' {
  const archiver: any;
  export default archiver;
}

declare module 'unzipper' {
  const unzipper: any;
  export default unzipper;
}
