// P2P Session Manager using SimplePeer + Cloudflare Signaling
// After initial connection, all messages go DIRECT peer-to-peer (no server!)

class P2PSessionManager {
    constructor() {
        this.sessionId = null;
        this.isHost = false;
        this.myPeerId = null;
        this.signalingWs = null;
        this.peers = new Map(); // peerId -> SimplePeer instance
        this.participants = new Map();
        this.userName = null;

        // Callbacks
        this.onParticipantUpdate = null;
        this.onMessageReceived = null;
        this.onSessionStart = null;

        // Cloudflare Worker URL
        this.signalingUrl = 'wss://zwift-signaling.w-vollprecht.workers.dev';
    }

    async createSession(userName, existingSessionId = null) {
        this.isHost = true;
        this.userName = userName;
        this.sessionId = existingSessionId || this.generateSessionCode();

        await this.connectToSignaling();
        this.saveSessionState();

        return {
            sessionId: this.sessionId,
            peerId: this.myPeerId
        };
    }

    async joinSession(sessionCode, userName) {
        this.isHost = false;
        this.userName = userName;
        this.sessionId = sessionCode;

        await this.connectToSignaling();
        this.saveSessionState();

        return {
            sessionId: this.sessionId,
            peerId: this.myPeerId
        };
    }

    async connectToSignaling() {
        const wsUrl = `${this.signalingUrl}/signal/${this.sessionId}`;
        console.log('Connecting to signaling server:', wsUrl);

        this.signalingWs = new WebSocket(wsUrl);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Signaling server connection timeout'));
            }, 10000);

            this.signalingWs.onopen = () => {
                console.log('Connected to signaling server');
                clearTimeout(timeout);
            };

            this.signalingWs.onerror = (err) => {
                console.error('Signaling WebSocket error:', err);
                clearTimeout(timeout);
                reject(new Error('Failed to connect to signaling server'));
            };

            this.signalingWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleSignalingMessage(data, resolve);
                } catch (err) {
                    console.error('Error parsing signaling message:', err);
                }
            };

            this.signalingWs.onclose = () => {
                console.log('Signaling connection closed');
            };
        });
    }

    handleSignalingMessage(data, resolveConnection) {
        console.log('Signaling message:', data.type);

        switch (data.type) {
            case 'id':
                this.myPeerId = data.id;
                const serverHostFlag = typeof data.isHost === 'boolean' ? data.isHost : false;
                if (!this.isHost) {
                    this.isHost = serverHostFlag;
                }
                console.log('My peer ID:', this.myPeerId, 'isHost:', this.isHost);

                this.participants.set(this.myPeerId, {
                    id: this.myPeerId,
                    name: this.userName,
                    isHost: this.isHost,
                    connected: false
                });

                this.sendToSignaling({
                    type: 'join',
                    name: this.userName,
                    isHost: this.isHost
                });

                this.updateParticipants();

                if (resolveConnection) {
                    resolveConnection();
                }
                break;

            case 'existing-peers':
                data.peers.forEach(peer => {
                    if (peer.id !== this.myPeerId) {
                        this.participants.set(peer.id, {
                            id: peer.id,
                            name: peer.name,
                            isHost: peer.isHost || false,
                            connected: false
                        });
                    }
                });
                this.updateParticipants();
                break;

            case 'peer-joined':
                console.log('Peer joined:', data.peerId, data.name);

                this.participants.set(data.peerId, {
                    id: data.peerId,
                    name: data.name,
                    isHost: data.isHost || false,
                    connected: false
                });

                if (this.isHost) {
                    this.createPeerConnection(data.peerId, true);
                }

                this.updateParticipants();
                break;

            case 'peer-left':
                console.log('Peer left:', data.peerId);
                this.removePeer(data.peerId);
                break;

            case 'signal':
                this.handleSignal(data.from, data.signal);
                break;
        }
    }

    createPeerConnection(peerId, initiator) {
        if (this.peers.has(peerId)) {
            console.log('Peer connection already exists for', peerId);
            return;
        }

        console.log('Creating P2P connection with', peerId, 'initiator:', initiator);

        const peer = new SimplePeer({
            initiator,
            trickle: true,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        peer.on('signal', (signal) => {
            console.log('Sending signal to', peerId);
            this.sendToSignaling({
                type: 'signal',
                target: peerId,
                signal: signal
            });
        });

        peer.on('connect', () => {
            console.log('✅ P2P connection established with', peerId);
            const participant = this.participants.get(peerId);
            if (participant) {
                participant.connected = true;
                this.updateParticipants();
            }
        });

        peer.on('data', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleP2PMessage(peerId, message);
            } catch (err) {
                console.error('Error parsing P2P message:', err);
            }
        });

        peer.on('error', (err) => {
            console.error('Peer error with', peerId, ':', err);
        });

        peer.on('close', () => {
            console.log('P2P connection closed with', peerId);
            this.removePeer(peerId);
        });

        this.peers.set(peerId, peer);
    }

    handleSignal(fromPeerId, signal) {
        let peer = this.peers.get(fromPeerId);

        if (!peer) {
            this.createPeerConnection(fromPeerId, false);
            peer = this.peers.get(fromPeerId);
        }

        if (peer) {
            peer.signal(signal);
        }
    }

    handleP2PMessage(fromPeerId, data) {
        if (this.onMessageReceived) {
            this.onMessageReceived(data, fromPeerId);
        }

        // If host, relay to other participants
        if (this.isHost && data.type !== 'ping') {
            this.broadcast(data, fromPeerId);
        }
    }

    sendToSignaling(message) {
        if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            this.signalingWs.send(JSON.stringify(message));
        }
    }

    sendToPeer(peerId, message) {
        const peer = this.peers.get(peerId);
        if (peer && peer.connected) {
            peer.send(JSON.stringify(message));
        }
    }

    broadcast(message, excludePeerId = null) {
        for (const [peerId, peer] of this.peers.entries()) {
            if (peerId !== excludePeerId && peer.connected) {
                peer.send(JSON.stringify(message));
            }
        }
    }

    updateParticipants() {
        if (this.onParticipantUpdate) {
            this.onParticipantUpdate(Array.from(this.participants.values()));
        }
    }

    isConnected() {
        return Boolean(this.sessionId);
    }

    getParticipants() {
        return Array.from(this.participants.values());
    }

    generateSessionCode() {
        const adjectives = [
            'swift', 'strong', 'brave', 'mighty', 'rapid', 'blazing', 'fierce', 'bold',
            'turbo', 'power', 'epic', 'mega', 'super', 'ultra', 'stellar', 'cosmic'
        ];

        const nouns = [
            'mountain', 'valley', 'river', 'peak', 'summit', 'ridge', 'canyon', 'plateau',
            'rider', 'cycler', 'racer', 'climber', 'sprinter', 'champion', 'legend', 'hero'
        ];

        const verbs = [
            'riding', 'climbing', 'sprinting', 'racing', 'crushing', 'dominating', 'flying', 'soaring'
        ];

        const animals = [
            'falcon', 'eagle', 'hawk', 'cheetah', 'leopard', 'jaguar', 'panther', 'tiger',
            'lion', 'wolf', 'bear', 'shark', 'dragon', 'phoenix', 'griffin', 'mustang'
        ];

        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const verb = verbs[Math.floor(Math.random() * verbs.length)];
        const animal = animals[Math.floor(Math.random() * animals.length)];

        return `${adj}-${noun}-${verb}-${animal}`;
    }

    removePeer(peerId) {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.destroy();
            this.peers.delete(peerId);
        }

        this.participants.delete(peerId);
        this.updateParticipants();
    }

    disconnect() {
        console.log('Disconnecting from session');

        for (const peer of this.peers.values()) {
            peer.destroy();
        }
        this.peers.clear();

        if (this.signalingWs) {
            this.signalingWs.close();
            this.signalingWs = null;
        }

        this.participants.clear();
        this.sessionId = null;
        this.myPeerId = null;

        this.clearSessionState();
    }

    getShareInfo() {
        if (!this.sessionId) return null;
        return {
            sessionId: this.sessionId,
            peerId: this.myPeerId
        };
    }

    saveSessionState() {
        const state = {
            sessionId: this.sessionId,
            isHost: this.isHost,
            userName: this.userName,
            createdAt: Date.now()
        };
        localStorage.setItem('skat_session_state', JSON.stringify(state));
    }

    loadSessionState() {
        const stored = localStorage.getItem('skat_session_state');
        if (!stored) return null;

        try {
            const state = JSON.parse(stored);
            const age = Date.now() - state.createdAt;
            if (age > 24 * 60 * 60 * 1000) {
                this.clearSessionState();
                return null;
            }
            return state;
        } catch (err) {
            return null;
        }
    }

    clearSessionState() {
        localStorage.removeItem('skat_session_state');
    }

    async restoreSession() {
        const state = this.loadSessionState();
        if (!state) return null;

        this.isHost = Boolean(state.isHost);

        try {
            if (state.isHost) {
                return await this.createSession(state.userName, state.sessionId);
            } else {
                return await this.joinSession(state.sessionId, state.userName);
            }
        } catch (err) {
            this.clearSessionState();
            return null;
        }
    }
}
