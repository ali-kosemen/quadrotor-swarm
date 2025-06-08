#!/bin/bash

# Web Visualization Script (Inference)
# This script runs the quadrotor swarm visualization with WebSocket support

# Default values
DEFAULT_ALGO="APPO"
DEFAULT_ENV="quadrotor_multi_websocket"
DEFAULT_TRAIN_DIR="./train_dir/test_20250530_2311"
DEFAULT_EXPERIMENT="dynamic_same_goal"
DEFAULT_WEBSOCKET_PORT="8765"

# Parse command line arguments or use defaults
ALGO="${1:-$DEFAULT_ALGO}"
ENV="${2:-$DEFAULT_ENV}"
TRAIN_DIR="${3:-$DEFAULT_TRAIN_DIR}"
EXPERIMENT="${4:-$DEFAULT_EXPERIMENT}"
WEBSOCKET_PORT="${5:-$DEFAULT_WEBSOCKET_PORT}"

# Set the script directory as the working directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Function to show usage
show_usage() {
    echo "Usage: $0 [ALGO] [ENV] [TRAIN_DIR] [EXPERIMENT] [WEBSOCKET_PORT]"
    echo ""
    echo "Default values:"
    echo "  ALGO: $DEFAULT_ALGO"
    echo "  ENV: $DEFAULT_ENV"
    echo "  TRAIN_DIR: $DEFAULT_TRAIN_DIR"
    echo "  EXPERIMENT: $DEFAULT_EXPERIMENT"
    echo "  WEBSOCKET_PORT: $DEFAULT_WEBSOCKET_PORT"
    echo ""
    echo "Example:"
    echo "  $0                                    # Use all defaults"
    echo "  $0 APPO quadrotor_multi_websocket     # Custom algo and env"
    echo "  $0 APPO quadrotor_multi_websocket ./train_dir/my_experiment dynamic_same_goal 8080"
    echo ""
    echo "Original command equivalent:"
    echo "  python -m swarm_rl.web.enjoy --algo=APPO --env=quadrotor_multi_websocket \\"
    echo "    --train_dir=./train_dir/test_20250530_2311 --experiment=dynamic_same_goal \\"
    echo "    --websocket_port=8765 --no_render"
}

# Show help if requested
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_usage
    exit 0
fi

# Check if Python is available
if ! command -v python &> /dev/null; then
    echo "Error: Python is not installed or not in PATH"
    exit 1
fi

# Check if the swarm_rl module exists
if ! python -c "import swarm_rl.web.enjoy" &> /dev/null; then
    echo "Error: swarm_rl module not found. Make sure you're in the correct directory and the module is installed."
    exit 1
fi

# Check if train directory exists
if [ ! -d "$TRAIN_DIR" ]; then
    echo "Error: Training directory '$TRAIN_DIR' not found"
    echo "Available directories in train_dir:"
    ls -la ./train_dir/ 2>/dev/null || echo "train_dir directory not found"
    echo ""
    echo "Use --help to see usage information"
    exit 1
fi

# Run the visualization command
echo "Starting inference..."
echo "Working directory: $SCRIPT_DIR"
echo "Algorithm: $ALGO"
echo "Environment: $ENV"
echo "Training directory: $TRAIN_DIR"
echo "Experiment: $EXPERIMENT"
echo "WebSocket server will be available at: ws://localhost:$WEBSOCKET_PORT"
echo ""

python -m swarm_rl.web.enjoy \
    --algo="$ALGO" \
    --env="$ENV" \
    --train_dir="$TRAIN_DIR" \
    --experiment="$EXPERIMENT" \
    --websocket_port="$WEBSOCKET_PORT" \
    --no_render

echo ""
echo "Inference ended."
