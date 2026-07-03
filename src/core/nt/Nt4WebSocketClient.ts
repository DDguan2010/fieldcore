import { decodeMulti, encode } from "@msgpack/msgpack";
import {
  buildNt4WebSocketUrl,
  type NTConnectionConfig,
  type NetworkTablesClient,
  type Unsubscribe,
} from "./NetworkTablesClient";

type TopicCallback<T> = (value: T, timestamp: number) => void;

interface Nt4Envelope {
  method: string;
  params: Record<string, unknown>;
}

interface TopicAnnouncement {
  name: string;
  id: number;
  type: string;
  pubuid?: number;
}

export class Nt4WebSocketClient implements NetworkTablesClient {
  private readonly clientName = `FieldCore-${Math.random().toString(36).slice(2, 8)}`;
  private socket: WebSocket | null = null;
  private rttSocket: WebSocket | null = null;
  private callbacks = new Map<string, Set<TopicCallback<unknown>>>();
  private topicIds = new Map<number, TopicAnnouncement>();
  private topicNames = new Map<string, TopicAnnouncement>();
  private publisherUids = new Map<string, number>();
  private subscriptionUids = new Map<string, number>();
  private retainedValues = new Map<string, unknown>();
  private connected = false;
  private nextUid = 1;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private rttReconnectTimer: number | null = null;
  private config: NTConnectionConfig | null = null;
  private connectionRequested = false;
  private connectPromise: Promise<void> | null = null;
  private connectionGeneration = 0;
  private activeConnectionKey: string | null = null;
  private negotiatedProtocol: string | null = null;
  private serverTimeOffsetMicros: number | null = null;
  private networkLatencyMicros = 0;
  private rttReconnectDelayMs = 500;
  private lastMainTimestampMs = 0;
  private lastSentValueTimestampMicros = 0;

  async connect(config: NTConnectionConfig): Promise<void> {
    const connectionKey = configKey(config);
    if (
      this.connectionRequested &&
      this.activeConnectionKey === connectionKey &&
      (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING)
    ) {
      return this.connectPromise ?? Promise.resolve();
    }

    this.config = config;
    this.connectionRequested = true;
    this.connected = false;
    this.activeConnectionKey = connectionKey;
    const generation = ++this.connectionGeneration;
    this.topicIds.clear();
    this.topicNames.clear();
    this.serverTimeOffsetMicros = null;
    this.networkLatencyMicros = 0;
    this.lastSentValueTimestampMicros = 0;
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.closeSockets(true);

    const url = buildNt4WebSocketUrl(config, this.clientName);
    const promise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (reason: Error) => {
        if (!settled) {
          settled = true;
          reject(reason);
        }
      };
      const socket = new WebSocket(url, [
        "v4.1.networktables.first.wpi.edu",
        "networktables.first.wpi.edu",
      ]);
      socket.binaryType = "arraybuffer";
      this.socket = socket;

      socket.onopen = () => {
        if (generation !== this.connectionGeneration) {
          socket.close();
          return;
        }
        settled = true;
        this.connected = true;
        this.negotiatedProtocol = socket.protocol;
        this.startHeartbeat(socket.protocol);
        this.resubscribeAll();
        this.republishAll();
        resolve();
      };
      socket.onerror = () => fail(new Error(`Unable to connect to NetworkTables at ${url}`));
      socket.onclose = () => {
        if (generation !== this.connectionGeneration) {
          return;
        }
        this.connected = false;
        this.stopHeartbeat();
        this.rttSocket?.close();
        this.rttSocket = null;
        if (this.socket === socket) {
          this.socket = null;
        }
        fail(new Error(`NetworkTables connection closed at ${url}`));
        this.scheduleReconnect();
      };
      socket.onmessage = (event) => this.handleMessage(event.data, false);
    });
    this.connectPromise = promise;
    try {
      await promise;
    } finally {
      if (this.connectPromise === promise) {
        this.connectPromise = null;
      }
    }
  }

  disconnect(): void {
    this.connectionRequested = false;
    this.config = null;
    this.activeConnectionKey = null;
    this.connectionGeneration += 1;
    this.closeSockets(true);
    this.stopHeartbeat();
    this.connected = false;
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  subscribe<T>(topic: string, callback: TopicCallback<T>): Unsubscribe {
    const callbacks = this.callbacks.get(topic) ?? new Set<TopicCallback<unknown>>();
    callbacks.add(callback as TopicCallback<unknown>);
    this.callbacks.set(topic, callbacks);
    const subuid = this.subscriptionUids.get(topic) ?? this.nextUid++;
    this.subscriptionUids.set(topic, subuid);
    this.sendSubscribe(topic, subuid);

    return () => {
      callbacks.delete(callback as TopicCallback<unknown>);
      if (callbacks.size === 0) {
        const uid = this.subscriptionUids.get(topic);
        if (uid != null) {
          this.sendControl({ method: "unsubscribe", params: { subuid: uid } });
          this.subscriptionUids.delete(topic);
        }
      }
    };
  }

  publish<T>(topic: string, value: T): void {
    this.retainedValues.set(topic, value);
    const type = typeStringForValue(value, topic);
    const pubuid = this.ensurePublisher(topic, value, type);
    if (this.serverTimeOffsetMicros == null) {
      // Before the first RTT completes, send timestamp 0 so the NT server accepts
      // the frame immediately without comparing it against future server-time values.
      // Using raw client epoch time here would poison the topic with a huge timestamp
      // and freeze later properly-synced updates as "stale".
      this.sendBinary([pubuid, 0, typeIdForType(type), payloadForType(value, type)]);
      return;
    }
    this.sendBinary([pubuid, this.nextValueTimestampMicros(), typeIdForType(type), payloadForType(value, type)]);
  }

  private nextValueTimestampMicros() {
    const timestamp = this.getServerTimeMicros();
    // Keep outgoing value timestamps strictly monotonic so the server never
    // discards a fresh frame as stale after small clock-offset re-estimates.
    this.lastSentValueTimestampMicros = Math.max(timestamp, this.lastSentValueTimestampMicros + 1);
    return this.lastSentValueTimestampMicros;
  }

  private ensurePublisher(topic: string, value: unknown, type: string): number {
    const existing = this.publisherUids.get(topic);
    if (existing != null) {
      return existing;
    }
    const pubuid = this.nextUid++;
    this.publisherUids.set(topic, pubuid);
    this.sendControl({
      method: "publish",
      params: {
        name: topic,
        pubuid,
        type,
        properties: { retained: true, cached: true },
      },
    });
    return pubuid;
  }

  private sendSubscribe(topic: string, subuid: number) {
    this.sendControl({
      method: "subscribe",
      params: {
        topics: [topic],
        subuid,
        options: { periodic: 0.02, all: true, prefix: false },
      },
    });
  }

  private sendControl(message: Nt4Envelope) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify([message]));
    }
  }

  private sendBinary(message: [number, number, number, unknown], rttOnly = false) {
    const socket = rttOnly ? this.rttSocket : this.socket;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(encode(message));
    }
  }

  private handleMessage(raw: unknown, rttOnly: boolean) {
    if (typeof raw === "string") {
      if (!rttOnly) {
        this.handleControl(raw);
      }
      return;
    }
    if (raw instanceof ArrayBuffer) {
      this.handleBinary(raw, rttOnly);
    }
  }

  private handleControl(raw: string) {
    try {
      const messages = JSON.parse(raw) as Nt4Envelope[];
      for (const message of messages) {
        if (message.method === "announce") {
          const params = message.params as unknown as TopicAnnouncement;
          this.topicIds.set(params.id, params);
          this.topicNames.set(params.name, params);
        }
        if (message.method === "unannounce") {
          const params = message.params as { id?: number; name?: string };
          if (params.id != null) {
            this.topicIds.delete(params.id);
          }
          if (params.name) {
            this.topicNames.delete(params.name);
          }
        }
      }
    } catch {
      // Ignore malformed control frames.
    }
  }

  private handleBinary(raw: ArrayBuffer, rttOnly: boolean) {
    try {
      for (const value of decodeMulti(new Uint8Array(raw))) {
        if (!Array.isArray(value) || value.length !== 4) {
          continue;
        }
        const [topicId, timestampMicros, , data] = value as [number, number, number, unknown];
        if (topicId === -1) {
          this.handleTimestamp(Number(timestampMicros), Number(data));
          continue;
        }
        if (rttOnly) {
          continue;
        }
        const announcement = this.topicIds.get(topicId);
        if (!announcement) {
          continue;
        }
        this.callbacks
          .get(announcement.name)
          ?.forEach((callback) => callback(data, Number(timestampMicros) / 1_000_000));
      }
    } catch {
      // Ignore malformed value frames.
    }
  }

  private startHeartbeat(protocol: string) {
    this.stopHeartbeat();
    this.negotiatedProtocol = protocol;
    if (protocol === "v4.1.networktables.first.wpi.edu") {
      this.openRttSocket();
      this.sendAdaptiveTimestamp();
      this.heartbeatTimer = window.setInterval(() => this.sendAdaptiveTimestamp(), 250);
      return;
    }
    this.sendTimestamp(false);
    this.heartbeatTimer = window.setInterval(() => this.sendTimestamp(false), 1000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer != null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.rttReconnectTimer != null) {
      window.clearTimeout(this.rttReconnectTimer);
      this.rttReconnectTimer = null;
    }
  }

  private openRttSocket() {
    if (!this.config) {
      return;
    }
    const socket = new WebSocket(buildNt4WebSocketUrl(this.config, this.clientName), ["rtt.networktables.first.wpi.edu"]);
    socket.binaryType = "arraybuffer";
    this.rttSocket = socket;
    socket.onopen = () => {
      this.rttReconnectDelayMs = 500;
      this.sendTimestamp(true);
    };
    socket.onmessage = (event) => this.handleMessage(event.data, true);
    socket.onerror = () => {
      if (this.rttSocket === socket) {
        this.rttSocket = null;
      }
    };
    socket.onclose = () => {
      if (this.rttSocket === socket) {
        this.rttSocket = null;
      }
      if (this.connectionRequested && this.connected) {
        const delay = this.rttReconnectDelayMs;
        this.rttReconnectDelayMs = Math.min(5000, this.rttReconnectDelayMs * 1.7);
        this.rttReconnectTimer = window.setTimeout(() => {
          this.rttReconnectTimer = null;
          if (this.connectionRequested && this.connected && this.rttSocket == null) {
            this.openRttSocket();
          }
        }, delay);
      }
    };
  }

  private sendAdaptiveTimestamp() {
    if (this.negotiatedProtocol === "v4.1.networktables.first.wpi.edu" && this.rttSocket?.readyState === WebSocket.OPEN) {
      this.sendTimestamp(true);
      return;
    }
    const nowMs = Date.now();
    if (nowMs - this.lastMainTimestampMs >= 1000) {
      this.lastMainTimestampMs = nowMs;
      this.sendTimestamp(false);
    }
  }

  private sendTimestamp(rttOnly: boolean) {
    this.sendBinary([-1, 0, 2, this.getClientTimeMicros()], rttOnly);
  }

  private handleTimestamp(serverTimestampMicros: number, clientTimestampMicros: number) {
    if (!Number.isFinite(serverTimestampMicros) || !Number.isFinite(clientTimestampMicros)) {
      return;
    }
    const receiveTimeMicros = this.getClientTimeMicros();
    const roundTripMicros = receiveTimeMicros - clientTimestampMicros;
    this.networkLatencyMicros = Math.max(0, roundTripMicros / 2);
    const firstSync = this.serverTimeOffsetMicros == null;
    this.serverTimeOffsetMicros = serverTimestampMicros + this.networkLatencyMicros - receiveTimeMicros;
    if (firstSync) {
      // Server time is now known: release every value published while unsynced so
      // subscribers (robot code, AdvantageScope) get live data instead of a single
      // stale first frame.
      this.flushRetainedValues();
    }
  }

  private flushRetainedValues() {
    for (const [topic, value] of this.retainedValues) {
      const type = typeStringForValue(value, topic);
      const pubuid = this.ensurePublisher(topic, value, type);
      this.sendBinary([pubuid, this.nextValueTimestampMicros(), typeIdForType(type), payloadForType(value, type)]);
    }
  }

  private getClientTimeMicros() {
    return Date.now() * 1000;
  }

  private getServerTimeMicros() {
    return Math.floor(this.getClientTimeMicros() + (this.serverTimeOffsetMicros ?? 0));
  }

  private resubscribeAll() {
    for (const topic of this.callbacks.keys()) {
      const subuid = this.subscriptionUids.get(topic) ?? this.nextUid++;
      this.subscriptionUids.set(topic, subuid);
      this.sendSubscribe(topic, subuid);
    }
  }

  private republishAll() {
    this.publisherUids.clear();
    for (const [topic, value] of this.retainedValues) {
      this.publish(topic, value);
    }
  }

  private scheduleReconnect() {
    if (!this.connectionRequested || !this.config || this.reconnectTimer != null) {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.config) {
        void this.connect(this.config).catch(() => this.scheduleReconnect());
      }
    }, 1000);
  }

  private closeSockets(silenceClose: boolean) {
    if (this.socket != null) {
      if (silenceClose) {
        this.socket.onclose = null;
      }
      this.socket.close();
      this.socket = null;
    }
    if (this.rttSocket != null) {
      this.rttSocket.onclose = null;
      this.rttSocket.onerror = null;
      this.rttSocket.close();
      this.rttSocket = null;
    }
  }
}

function configKey(config: NTConnectionConfig) {
  return `${config.host}:${config.port}:${config.mode}:${config.teamNumber ?? ""}`;
}

const knownTopicTypes = new Map<string, string>([
  ["/FieldCore/Robot/PoseEstimate", "double[]"],
  ["/FieldCore/Robot/ChassisSpeeds", "double[]"],
  ["/FieldCore/Robot/ModuleStates", "double[]"],
  ["/FieldCore/Robot/ShootCount", "double"],
  ["/FieldCore/Vision/Pose", "double[]"],
  ["/FieldCore/Vision/DetectedTagIds", "int[]"],
  ["/FieldCore/Sim/TrueRobotPose", "double[]"],
  ["/FieldCore/Sim/GamePieceStates", "json"],
]);

// Limelight-table topics must keep stable NT types regardless of the configured
// table name, so robot-side NetworkTableEntry.getDouble/getDoubleArray reads match.
const limelightDoubleArraySuffixes = ["/rawfiducials", "/rawdetections", "/t2d", "/hw", "/imu"];
const limelightDoubleSuffixes = [
  "/tv", "/tid", "/hb", "/tl", "/cl", "/ta", "/tx", "/ty",
  "/botpose_tagcount", "/botpose_span", "/botpose_avgdist", "/botpose_avgarea",
];

function limelightTopicType(topic: string): string | undefined {
  if (topic.includes("/botpose")) {
    if (limelightDoubleSuffixes.some((suffix) => topic.endsWith(suffix))) {
      return "double";
    }
    return "double[]";
  }
  if (limelightDoubleArraySuffixes.some((suffix) => topic.endsWith(suffix))) {
    return "double[]";
  }
  if (limelightDoubleSuffixes.some((suffix) => topic.endsWith(suffix))) {
    return "double";
  }
  return undefined;
}

function typeStringForValue(value: unknown, topic?: string): string {
  const knownType = topic === undefined ? undefined : knownTopicTypes.get(topic) ?? limelightTopicType(topic);
  if (knownType !== undefined) return knownType;
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "double";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "boolean")) return "boolean[]";
    if (value.every((item) => typeof item === "number" && Number.isInteger(item))) return "int[]";
    if (value.every((item) => typeof item === "number")) return "double[]";
    if (value.every((item) => typeof item === "string")) return "string[]";
  }
  return "json";
}

function typeIdForType(type: string): number {
  switch (type) {
    case "boolean":
      return 0;
    case "double":
      return 1;
    case "int":
      return 2;
    case "string":
    case "json":
      return 4;
    case "boolean[]":
      return 16;
    case "double[]":
      return 17;
    case "int[]":
      return 18;
    case "string[]":
      return 20;
    default:
      return 4;
  }
}

function payloadForType(value: unknown, type: string): unknown {
  if (type === "json") {
    return JSON.stringify(value);
  }
  return value;
}
