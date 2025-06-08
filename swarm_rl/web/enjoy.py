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


def extract_drone_state(obs, env, agent_idx=0):
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

        # For throttling data transmission and timing control
        self.last_send_time = time.time()
        self.send_interval = 0.0  # No throttling - send every frame like pyglet

        # Timing control like pyglet rendering
        self.simulation_start_time = 0
        # Try to get control_freq from environment hierarchy
        self.control_freq = self._get_control_freq(env)
        self.render_speed = 1.0  # Same as pyglet default
        log.info(f"WebSocketDataWrapper: Using control_freq={self.control_freq}Hz, render_speed={self.render_speed}")

    def _get_control_freq(self, env):
        """Get control frequency from environment hierarchy"""
        # Try different ways to get control_freq
        if hasattr(env, 'control_freq'):
            return env.control_freq
        elif hasattr(env, 'envs') and len(env.envs) > 0 and hasattr(env.envs[0], 'control_freq'):
            return env.envs[0].control_freq
        else:
            # Traverse wrapped environments
            current_env = env
            while hasattr(current_env, 'env'):
                current_env = current_env.env
                if hasattr(current_env, 'control_freq'):
                    return current_env.control_freq
                elif hasattr(current_env, 'envs') and len(current_env.envs) > 0 and hasattr(current_env.envs[0], 'control_freq'):
                    return current_env.envs[0].control_freq
            # Default fallback
            return 50  # Default 50Hz like quadrotor

    def reset(self, **kwargs):
        # Start new episode
        self.current_step = 0
        self.episode_reward = 0.0
        log.info(f"WebSocketDataWrapper.reset() called - Starting episode {self.current_episode + 1}")

        obs = self.env.reset(**kwargs)
        return obs

    def step(self, action):
        # Timing control like pyglet rendering - start timing
        step_start_time = time.time()

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

        # Handle array values for multi-agent environments
        if hasattr(terminated, '__len__') and not isinstance(terminated, str):
            # If terminated is an array, check if any agent is terminated
            done = np.any(terminated) or np.any(truncated) if hasattr(truncated, '__len__') else np.any(terminated)
        else:
            # Single agent case
            done = terminated or truncated

        # Debug: Print step info
        if self.current_step % 50 == 0:
            log.info(f"WebSocketDataWrapper.step() called - Step {self.current_step}: action={action}, reward={reward}")

        # Extract drone states for all agents
        current_time = time.time()

        # Throttle data transmission
        if current_time - self.last_send_time > self.send_interval:
            # Get number of agents
            num_agents = getattr(self.env, 'num_agents', 1)
            if hasattr(self.env, 'envs'):
                num_agents = len(self.env.envs)

            # Extract state for each drone
            all_drone_states = []
            for agent_idx in range(num_agents):
                drone_state = extract_drone_state(obs, self.env, agent_idx)
                if drone_state is not None:
                    all_drone_states.append(drone_state)

            if not all_drone_states:
                log.warning(f"Failed to extract any drone states at step {self.current_step}")
                return obs, reward, terminated, truncated, info

            # Send data for each drone separately
            for drone_state in all_drone_states:
                # Convert numpy types to Python types for JSON serialization
                action_data = action.tolist() if isinstance(action, np.ndarray) else action
                if isinstance(action_data, list):
                    action_data = [float(x) if hasattr(x, 'dtype') else x for x in action_data]

                reward_data = float(reward) if np.isscalar(reward) else float(reward[0])
                done_data = bool(done) if hasattr(done, 'dtype') else done

                viz_data = {
                    'type': 'drone_state',
                    'episode': int(self.current_episode),
                    'step': int(self.current_step),
                    'timestamp': float(current_time),
                    'drone_state': drone_state,
                    'action': action_data,
                    'reward': reward_data,
                    'done': done_data,
                    'num_agents': int(num_agents)
                }

                # Send to WebSocket clients
                self.websocket_server.broadcast(viz_data)

            # Debug: Print data being sent (only for first drone to avoid spam)
            if self.current_step % 50 == 0 and all_drone_states:  # Print every 50 steps
                first_drone = all_drone_states[0]
                log.info(f"Sending data: episode={self.current_episode}, step={self.current_step}, "
                        f"num_drones={len(all_drone_states)}, "
                        f"drone_0_pos=({first_drone['position']['x']:.2f}, {first_drone['position']['y']:.2f}, {first_drone['position']['z']:.2f}), "
                        f"drone_0_goal=({first_drone['goal']['x']:.2f}, {first_drone['goal']['y']:.2f}, {first_drone['goal']['z']:.2f}), "
                        f"send_interval={self.send_interval:.3f}s")

            self.last_send_time = current_time

        self.current_step += 1
        self.episode_reward += float(reward) if np.isscalar(reward) else float(reward[0])

        # Timing control like pyglet rendering - add sleep to maintain realtime speed
        if self.simulation_start_time > 0:
            simulation_time = current_time - self.simulation_start_time
        else:
            simulation_time = 0

        step_processing_time = time.time() - step_start_time
        realtime_control_period = 1 / self.control_freq
        desired_time_between_steps = realtime_control_period / self.render_speed
        time_to_sleep = desired_time_between_steps - simulation_time - step_processing_time

        # Wait so we don't simulate faster than realtime (like pyglet does)
        if time_to_sleep > 0:
            time.sleep(time_to_sleep)

        # Update simulation start time for next step
        self.simulation_start_time = time.time()

        # Check if episode should end
        if done:
            log.info(f"Episode {self.current_episode + 1} completed: {self.current_step} steps, reward: {self.episode_reward:.3f}")
            self.current_episode += 1

        # Return in the same format as received
        if len(step_result) == 4:
            # Return old format
            return obs, reward, done, info
        else:
            # Return new format - keep original terminated/truncated values
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
