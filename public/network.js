export class NetworkClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.playerId = null;
    this.latency = 0;
    this.connected = false;
    this.messageHandlers = new Map();
    this.pendingInputs = [];
    this.inputSeq = 0;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.lastPingTime = 0;
    this.pingInterval = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }

      this.ws.onopen = () => {
        this.connected = true;
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }

        if (msg.type === 'connected') {
          this.playerId = msg.playerId;
          resolve(msg);
        }

        if (msg.type === 'pong') {
          this.latency = Date.now() - msg.time;
          this.lastPingTime = 0;
        }

        // Dispatch to registered handlers
        const handler = this.messageHandlers.get(msg.type);
        if (handler) {
          handler(msg);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.stopPing();
        this.tryReconnect();
      };

      this.ws.onerror = (e) => {
        if (!this.connected) reject(e);
      };
    });
  }

  on(msgType, handler) {
    this.messageHandlers.set(msgType, handler);
  }

  off(msgType) {
    this.messageHandlers.delete(msgType);
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendInput(dx, dy, dir, fire) {
    this.inputSeq++;
    this.send({
      type: 'input',
      seq: this.inputSeq,
      dx,
      dy,
      dir: dir ? { x: dir.x, y: dir.y } : null,
      fire,
      dt: 16,
    });
  }

  startPing() {
    this.pingInterval = setInterval(() => {
      this.lastPingTime = Date.now();
      this.send({ type: 'ping', time: Date.now() });
    }, 2000);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  tryReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      const handler = this.messageHandlers.get('disconnected');
      if (handler) handler({ reason: 'max_attempts' });
      return;
    }
    this.reconnectAttempts++;
    const handler = this.messageHandlers.get('reconnecting');
    if (handler) handler({ attempt: this.reconnectAttempts });

    setTimeout(() => {
      this.connect().catch(() => {});
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  disconnect() {
    this.stopPing();
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}
