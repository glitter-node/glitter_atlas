declare module 'pg' {
  export class Pool {
    constructor(config: { connectionString: string });
    query<T extends Record<string, unknown>>(
      queryText: string,
      values?: readonly unknown[],
    ): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
}
