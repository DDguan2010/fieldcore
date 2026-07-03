export type ConnectionMode = "local-simulation" | "robot";

export interface NTConnectionConfig {
  host: string;
  port: number;
  teamNumber?: number;
  mode: ConnectionMode;
}

export type Unsubscribe = () => void;

export interface NetworkTablesClient {
  connect(config: NTConnectionConfig): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  subscribe<T>(topic: string, callback: (value: T, timestamp: number) => void): Unsubscribe;
  publish<T>(topic: string, value: T): void;
}

export const defaultNTConnectionConfig: NTConnectionConfig = {
  host: "localhost",
  port: 5810,
  mode: "local-simulation",
};

export const buildNtWebSocketUrl = (config: NTConnectionConfig) => `ws://${config.host}:${config.port}`;

export const buildNt4WebSocketUrl = (config: NTConnectionConfig, clientName = "FieldCore") =>
  `ws://${config.host}:${config.port}/nt/${encodeURIComponent(clientName.replaceAll("@", "-"))}`;
