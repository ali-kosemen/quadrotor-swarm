class WebSocketClient {
    constructor(url, visualizer) {
        this.url = url;
        this.visualizer = visualizer;
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;

        // UI elements
        this.statusIndicator = document.getElementById('status-indicator');
        this.statusText = document.getElementById('status-text');
        this.episodeElement = document.getElementById('episode');
        this.stepElement = document.getElementById('step');
        this.droneCountElement = document.getElementById('drone-count');

        // Statistics
        this.currentEpisode = 0;
        this.currentStep = 0;
        this.activeDrones = new Set();
    }

    connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log('Already connected');
            return;
        }

        this.updateStatus('connecting', 'Connecting...');

        try {
            this.socket = new WebSocket(this.url);

            this.socket.onopen = (event) => {
                console.log('WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.updateStatus('connected', 'Connected');
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };

            this.socket.onclose = (event) => {
                console.log('WebSocket disconnected');
                this.isConnected = false;
                this.updateStatus('disconnected', 'Disconnected');

                // Attempt to reconnect
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                    setTimeout(() => this.connect(), this.reconnectDelay);
                }
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateStatus('disconnected', 'Connection Error');
            };

        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.updateStatus('disconnected', 'Connection Failed');
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isConnected = false;
        this.updateStatus('disconnected', 'Disconnected');
    }

    handleMessage(data) {
        if (data.type === 'drone_state') {
            // Debug: Log data every 100 steps to see what's happening
            if (data.step % 100 === 0) {
                console.log('Received data:', {
                    episode: data.episode,
                    step: data.step,
                    drone_id: data.drone_state?.agent_id,
                    position: data.drone_state?.position,
                    goal: data.drone_state?.goal,
                    timestamp: data.timestamp
                });
            }

            // No throttling - update every frame like pyglet
            // Update statistics
            this.currentEpisode = data.episode;
            this.currentStep = data.step;

            // Update drone visualization
            if (data.drone_state) {
                this.visualizer.updateDrone(data.drone_state);
                this.activeDrones.add(data.drone_state.agent_id);
            }

            // Update UI
            this.updateUI();
        }
    }

    updateStatus(status, text) {
        this.statusIndicator.className = status;
        this.statusText.textContent = text;
    }

    updateUI() {
        this.episodeElement.textContent = this.currentEpisode;
        this.stepElement.textContent = this.currentStep;
        this.droneCountElement.textContent = this.activeDrones.size;
    }
}

// Application initialization
class App {
    constructor() {
        this.visualizer = null;
        this.websocketClient = null;
        this.websocketUrl = 'ws://localhost:8765';

        this.init();
    }

    init() {
        // Initialize visualizer
        this.visualizer = new DroneVisualizer('three-canvas');

        // Initialize WebSocket client
        this.websocketClient = new WebSocketClient(this.websocketUrl, this.visualizer);

        // Setup UI event listeners
        this.setupEventListeners();

        // Initialize camera UI
        this.updateCameraUI();

        // Auto-connect on startup
        setTimeout(() => {
            this.websocketClient.connect();
        }, 1000);
    }

    setupEventListeners() {
        // Toggle trails button
        document.getElementById('toggle-trails-btn').addEventListener('click', () => {
            const showTrails = this.visualizer.toggleTrails();
            document.getElementById('toggle-trails-btn').textContent =
                showTrails ? 'Hide Trails' : 'Show Trails';
        });



        // Camera view buttons
        document.querySelectorAll('.camera-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.getAttribute('data-view');
                this.visualizer.setCameraView(view);
                this.updateCameraUI();
            });
        });

        // Camera action buttons
        const resetCameraBtn = document.getElementById('reset-camera-btn');
        if (resetCameraBtn) {
            resetCameraBtn.addEventListener('click', () => {
                this.visualizer.resetCamera();
                this.updateCameraUI();
            });
        }



        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            switch(event.key) {
                case 't':
                case 'T':
                    this.visualizer.toggleTrails();
                    break;
                case 'c':
                case 'C':
                    this.visualizer.clearTrails();
                    break;
                case 'r':
                case 'R':
                    this.visualizer.resetCamera();
                    this.updateCameraUI();
                    break;
                // Number key for global camera view
                case '1':
                    this.visualizer.setCameraView('global');
                    this.updateCameraUI();
                    break;
            }
        });


    }

    updateCameraUI() {
        // Update button states
        const currentView = this.visualizer.getCurrentCameraView();
        document.querySelectorAll('.camera-view-btn').forEach(btn => {
            const view = btn.getAttribute('data-view');
            if (view === currentView) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();

    // Handle page unload
    window.addEventListener('beforeunload', () => {
        if (app.websocketClient) {
            app.websocketClient.disconnect();
        }
        if (app.visualizer) {
            app.visualizer.dispose();
        }
    });
});
