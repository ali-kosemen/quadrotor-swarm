import sys
import json
import time
import asyncio
import threading
import websockets
import numpy as np

from sample_factory.enjoy import enjoy
from sample_factory.cfg.arguments import parse_full_cfg, parse_sf_args
from sample_factory.utils.utils import log

from swarm_rl.train import register_swarm_components


class WebSocketServer:
    """WebSocket server for real-time drone visualization"""

    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.clients = set()
        self.server = None
        self.loop = None
        self.thread = None

    def start(self):
        """Start the WebSocket server in a separate thread"""
        log.info(f"Starting WebSocket server on ws://{self.host}:{self.port}")
        self.thread = threading.Thread(target=self._run_server, daemon=True)
        self.thread.start()

        # Give server time to start
        import time
        time.sleep(1)
        log.info(f"WebSocket server should be running on ws://{self.host}:{self.port}")

    def _run_server(self):
        """Run the WebSocket server"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

        async def handler(websocket):
            self.clients.add(websocket)
            log.info(f"Client connected. Total clients: {len(self.clients)}")
            try:
                await websocket.wait_closed()
            finally:
                self.clients.remove(websocket)
                log.info(f"Client disconnected. Total clients: {len(self.clients)}")

        start_server = websockets.serve(handler, self.host, self.port)
        self.server = self.loop.run_until_complete(start_server)
        self.loop.run_forever()

    def broadcast(self, data):
        """Broadcast data to all connected clients"""
        if not self.clients:
            log.debug("No WebSocket clients connected")
            return

        try:
            message = json.dumps(data, default=self._json_serializer)
        except Exception as e:
            log.error(f"Failed to serialize data to JSON: {e}")
            return

        disconnected = set()

        log.debug(f"Broadcasting to {len(self.clients)} clients")

        for client in self.clients:
            try:
                asyncio.run_coroutine_threadsafe(client.send(message), self.loop)
            except Exception as e:
                log.warning(f"Failed to send to client: {e}")
                disconnected.add(client)

        # Remove disconnected clients
        self.clients -= disconnected

    @staticmethod
    def _json_serializer(obj):
        """Custom JSON serializer for numpy arrays"""
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

    def stop(self):
        """Stop the WebSocket server"""
        if self.server and self.loop:
            self.loop.call_soon_threadsafe(self.server.close)


def extract_drone_state(env, agent_idx=0):
    """Extract drone state information from observation and environment"""
    try:
        # Get drone dynamics from environment
        drone_env = env.envs[agent_idx] if hasattr(env, 'envs') else env

        # Try to access dynamics directly
        if hasattr(drone_env, 'dynamics'):
            dynamics = drone_env.dynamics
        elif hasattr(drone_env, 'env') and hasattr(drone_env.env, 'dynamics'):
            dynamics = drone_env.env.dynamics
        else:
            # Fallback: try to get from wrapped environment
            current_env = drone_env
            while hasattr(current_env, 'env'):
                current_env = current_env.env
                if hasattr(current_env, 'dynamics'):
                    dynamics = current_env.dynamics
                    break
            else:
                log.warning("Could not find dynamics in environment")
                return None

        # Try to get goal
        goal = None
        if hasattr(drone_env, 'goal'):
            goal = drone_env.goal
        elif hasattr(drone_env, 'env') and hasattr(drone_env.env, 'goal'):
            goal = drone_env.env.goal
        else:
            current_env = drone_env
            while hasattr(current_env, 'env'):
                current_env = current_env.env
                if hasattr(current_env, 'goal'):
                    goal = current_env.goal
                    break

        state_data = {
            'agent_id': agent_idx,
            'position': {
                'x': float(dynamics.pos[0]),
                'y': float(dynamics.pos[1]),
                'z': float(dynamics.pos[2])
            },
            'velocity': {
                'vx': float(dynamics.vel[0]),
                'vy': float(dynamics.vel[1]),
                'vz': float(dynamics.vel[2])
            },
            'rotation_matrix': dynamics.rot.flatten().tolist(),
            'angular_velocity': {
                'wx': float(dynamics.omega[0]),
                'wy': float(dynamics.omega[1]),
                'wz': float(dynamics.omega[2])
            },
            'goal': {
                'x': float(goal[0]) if goal is not None else 0.0,
                'y': float(goal[1]) if goal is not None else 0.0,
                'z': float(goal[2]) if goal is not None else 0.0
            }
        }

        # Debug: Print state data occasionally
        if agent_idx == 0:  # Only print for first agent
            log.debug(f"Drone state: pos=({state_data['position']['x']:.2f}, {state_data['position']['y']:.2f}, {state_data['position']['z']:.2f})")

        return state_data

    except Exception as e:
        log.error(f"Error extracting drone state: {e}")
        return None


import gymnasium as gym

class WebSocketDataWrapper(gym.Wrapper):
    """Wrapper that streams data to WebSocket for real-time visualization"""

    def __init__(self, env, websocket_server):
        log.info("WebSocketDataWrapper initialized!")
        super().__init__(env)
        self.websocket_server = websocket_server

        self.current_episode = 0
        self.current_step = 0
        self.episode_reward = 0.0

        # For throttling data transmission
        self.last_send_time = time.time()
        self.send_interval = 0.05  # Send every 50ms (20 FPS)

    def reset(self, **kwargs):
        # Start new episode
        self.current_step = 0
        self.episode_reward = 0.0
        log.info(f"WebSocketDataWrapper.reset() called - Starting episode {self.current_episode + 1}")

        obs = self.env.reset(**kwargs)
        return obs

    def step(self, action):
        # Handle both old (4 values) and new (5 values) gymnasium formats
        step_result = self.env.step(action)

        if len(step_result) == 4:
            # Old format: obs, reward, done, info
            obs, reward, done, info = step_result
            terminated = done
            truncated = False
        else:
            # New format: obs, reward, terminated, truncated, info
            obs, reward, terminated, truncated, info = step_result
            done = terminated or truncated

        # Debug: Print step info
        if self.current_step % 50 == 0:
            log.info(f"WebSocketDataWrapper.step() called - Step {self.current_step}: action={action}, reward={reward}")

        # Extract drone state
        drone_state = extract_drone_state(obs, self.env)

        if drone_state is None:
            log.warning(f"Failed to extract drone state at step {self.current_step}")
            return obs, reward, terminated, truncated, info

        # Prepare data for visualization
        current_time = time.time()

        # Throttle data transmission
        if current_time - self.last_send_time > self.send_interval:
            viz_data = {
                'type': 'drone_state',
                'episode': self.current_episode,
                'step': self.current_step,
                'timestamp': current_time,
                'drone_state': drone_state,
                'action': action.tolist() if isinstance(action, np.ndarray) else action,
                'reward': float(reward) if np.isscalar(reward) else float(reward[0]),
                'done': done
            }

            # Debug: Print data being sent
            if self.current_step % 20 == 0:  # Print every 20 steps
                log.info(f"Sending data: episode={viz_data['episode']}, step={viz_data['step']}, "
                        f"pos=({drone_state['position']['x']:.2f}, {drone_state['position']['y']:.2f}, {drone_state['position']['z']:.2f})")

            # Send to WebSocket clients
            self.websocket_server.broadcast(viz_data)
            self.last_send_time = current_time

        self.current_step += 1
        self.episode_reward += float(reward) if np.isscalar(reward) else float(reward[0])

        # Check if episode should end
        if done:
            log.info(f"Episode {self.current_episode + 1} completed: {self.current_step} steps, reward: {self.episode_reward:.3f}")
            self.current_episode += 1

        # Ensure terminated and truncated are numpy arrays if needed
        if np.isscalar(terminated):
            terminated = np.array([terminated])
        if np.isscalar(truncated):
            truncated = np.array([truncated])

        # Return in new gymnasium format
        return obs, reward, terminated, truncated, info

    def close(self):
        self.env.close()

def enjoy_with_websocket_visualization(cfg):
    """Use Sample Factory's enjoy function with WebSocket real-time visualization"""

    # Enable debug logging but filter out numba noise
    import logging
    logging.basicConfig(level=logging.INFO)

    # Disable rendering to speed up data collection
    cfg.quads_render = False
    cfg.quads_view_mode = []
    cfg.no_render = True  # Disable Sample Factory rendering
    cfg.save_video = False  # Disable video saving
    cfg.record_to = None  # Disable recording

    # Get parameters
    websocket_port = getattr(cfg, 'websocket_port', 8765)

    # Start WebSocket server
    websocket_server = WebSocketServer(port=websocket_port)
    websocket_server.start()

    # Register a custom environment that includes our wrapper
    from sample_factory.envs.env_utils import register_env

    def make_websocket_env(full_env_name, cfg=None, env_config=None, render_mode=None):
        """Create environment with WebSocket wrapper"""
        log.info(f"make_websocket_env called with {full_env_name}")

        # Import the original quadrotor environment creation
        from swarm_rl.env_wrappers.quad_utils import make_quadrotor_env_multi

        # Create the base environment
        env = make_quadrotor_env_multi(cfg)
        log.info(f"Base environment created: {type(env)}")

        # Wrap with WebSocket streaming
        wrapped_env = WebSocketDataWrapper(env, websocket_server)
        log.info(f"WebSocket wrapper applied: {type(wrapped_env)}")

        return wrapped_env

    # Register our custom environment
    register_env('quadrotor_multi_websocket', make_websocket_env)

    # Change the environment name to use our custom one
    original_env = cfg.env
    cfg.env = 'quadrotor_multi_websocket'

    try:
        # Use Sample Factory's enjoy function
        register_swarm_components()
        log.info(f"Starting real-time visualization on ws://localhost:{websocket_port}")
        log.info("Open the HTML visualization file in your browser to see the drone!")
        status = enjoy(cfg)
        return status
    finally:
        # Restore original environment name and stop server
        cfg.env = original_env
        websocket_server.stop()


def add_websocket_args(parser):
    """Add WebSocket-specific command line arguments"""
    parser.add_argument('--websocket_port', type=int, default=8765,
                       help='WebSocket server port')


def main():
    """Script entry point for real-time visualization"""
    parser, partial_cfg = parse_sf_args(argv=None, evaluation=True)

    # Add quadrotor-specific args
    from swarm_rl.env_wrappers.quadrotor_params import add_quadrotors_env_args, quadrotors_override_defaults
    add_quadrotors_env_args(partial_cfg.env, parser)
    quadrotors_override_defaults(partial_cfg.env, parser)

    # Add WebSocket-specific args
    add_websocket_args(parser)

    # Parse final config
    cfg = parse_full_cfg(parser, argv=None)

    # Run real-time visualization
    status = enjoy_with_websocket_visualization(cfg)
    return status


if __name__ == '__main__':
    sys.exit(main())
