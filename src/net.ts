import { getRelaySockets, joinRoom } from 'trystero/nostr';
import { clampGenome, type Genome } from './genome';

// The p2p layer. No server: WebRTC with signaling piggybacked on public
// Nostr relays. Only small immutable data crosses the wire — genomes,
// normalized falcon positions, short chat strings. Nothing executable,
// and every genome is clamped at ingress.

export interface NetHandlers {
  onFlock: (peerId: string, g: Genome) => void;
  onLeave: (peerId: string) => void;
  onFalcon: (peerId: string, x: number, y: number, active: boolean) => void;
  onChat: (peerId: string, text: string) => void;
  onCount: (n: number) => void;
  onStatus: (s: string) => void;
}

export interface Net {
  announce: (g: Genome) => void;
  sendFalcon: (x: number, y: number, active: boolean) => void;
  sendChat: (text: string) => void;
}

const APP_ID = 'murmuration-sky-v1';
const ROOM = 'global';
const CHAT_MAX = 280;

type FalconMsg = { x: number; y: number; a: number };
// Genome as an over-the-wire payload (trystero wants an index signature)
type GenomeMsg = Genome & { [key: string]: string | number };

export function connect(h: NetHandlers): Net | null {
  try {
    const room = joinRoom({ appId: APP_ID }, ROOM, {
      onJoinError: (err) => {
        console.error('[murmuration] join error:', err);
        h.onStatus('signal trouble — retrying');
      },
    });

    // surface relay connectivity so "nothing happening" is diagnosable
    let announced = false;
    const relayPoll = setInterval(() => {
      const sockets = Object.values(getRelaySockets()) as WebSocket[];
      const open = sockets.filter((s) => s && s.readyState === WebSocket.OPEN).length;
      if (open > 0 && !announced) {
        announced = true;
        h.onStatus(`listening on ${open} relays`);
        console.log(`[murmuration] ${open}/${sockets.length} relays open`);
      }
    }, 1000);
    setTimeout(() => clearInterval(relayPoll), 30000);

    let current: Genome | null = null;
    const peers = new Set<string>();

    const hello = room.makeAction<GenomeMsg>('hello', {
      onMessage: (g, { peerId }) => {
        try {
          h.onFlock(peerId, clampGenome(g));
        } catch {
          // malformed genome from a peer: ignore, never crash the sky
        }
      },
    });

    const falcon = room.makeAction<FalconMsg>('falcon', {
      onMessage: (f, { peerId }) => {
        if (f && typeof f.x === 'number' && typeof f.y === 'number') {
          h.onFalcon(
            peerId,
            Math.min(1, Math.max(0, f.x)),
            Math.min(1, Math.max(0, f.y)),
            f.a === 1,
          );
        }
      },
    });

    const chat = room.makeAction<string>('chat', {
      onMessage: (text, { peerId }) => {
        if (typeof text === 'string' && text.trim()) {
          h.onChat(peerId, text.slice(0, CHAT_MAX));
        }
      },
    });

    room.onPeerJoin = (id) => {
      console.log('[murmuration] peer joined:', id);
      peers.add(id);
      if (current) void hello.send(current as GenomeMsg, { target: id });
      h.onCount(peers.size);
    };

    room.onPeerLeave = (id) => {
      console.log('[murmuration] peer left:', id);
      peers.delete(id);
      h.onLeave(id);
      h.onCount(peers.size);
    };

    return {
      announce: (g) => {
        current = g;
        if (peers.size) void hello.send(g as GenomeMsg);
      },
      sendFalcon: (x, y, active) => {
        if (peers.size) void falcon.send({ x, y, a: active ? 1 : 0 });
      },
      sendChat: (text) => {
        if (peers.size) void chat.send(text.slice(0, CHAT_MAX));
      },
    };
  } catch (err) {
    console.warn('p2p unavailable — flying solo', err);
    return null;
  }
}
