declare module "pg" {
  export type QueryResult<Row = unknown> = {
    rows: Row[];
  };

  export class Client {
    constructor(config?: {
      connectionString?: string;
      ssl?: boolean | { rejectUnauthorized?: boolean };
    });

    connect(): Promise<void>;
    end(): Promise<void>;
    query<Row = unknown>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
  }
}
