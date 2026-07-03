import type { NTConnectionConfig, NetworkTablesClient, Unsubscribe } from "./NetworkTablesClient";

type TopicCallback<T> = (value: T, timestamp: number) => void;

export class MockNetworkTablesClient implements NetworkTablesClient {
  private connected = false;
  private values = new Map<string, unknown>();
  private callbacks = new Map<string, Set<TopicCallback<unknown>>>();
  config: NTConnectionConfig | null = null;

  async connect(config: NTConnectionConfig): Promise<void> {
    this.config = config;
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  subscribe<T>(topic: string, callback: TopicCallback<T>): Unsubscribe {
    const callbacks = this.callbacks.get(topic) ?? new Set<TopicCallback<unknown>>();
    callbacks.add(callback as TopicCallback<unknown>);
    this.callbacks.set(topic, callbacks);

    if (this.values.has(topic)) {
      callback(this.values.get(topic) as T, performance.now() / 1000);
    }

    return () => {
      callbacks.delete(callback as TopicCallback<unknown>);
    };
  }

  publish<T>(topic: string, value: T): void {
    this.values.set(topic, value);
    const timestamp = performance.now() / 1000;
    this.callbacks.get(topic)?.forEach((callback) => callback(value, timestamp));
  }

  getValue<T>(topic: string, fallback: T): T {
    return (this.values.get(topic) as T | undefined) ?? fallback;
  }
}
