#!/bin/bash

# Web Server Script
# This script starts the HTTP server for the drone visualization interface

# Default values
DEFAULT_PORT="8083"
DEFAULT_NO_BROWSER="true"

# Parse command line arguments or use defaults
PORT="${1:-$DEFAULT_PORT}"
NO_BROWSER="${2:-$DEFAULT_NO_BROWSER}"

# Set the script directory as the working directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Function to show usage
show_usage() {
    echo "Usage: $0 [PORT] [NO_BROWSER]"
    echo ""
    echo "Default values:"
    echo "  PORT: $DEFAULT_PORT"
    echo "  NO_BROWSER: $DEFAULT_NO_BROWSER (set to 'true' to disable auto-browser opening)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Use default port 8081, auto-open browser"
    echo "  $0 8080               # Use port 8080, auto-open browser"
    echo "  $0 8080 true          # Use port 8080, don't auto-open browser"
    echo ""
    echo "Original command equivalent:"
    echo "  cd swarm_rl/web && python server.py --port 8081 --no-browser"
    echo ""
    echo "The server will serve the visualization interface from swarm_rl/web/templates/"
    echo "Open your browser to http://localhost:[PORT] to view the visualization"
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

# Check if the swarm_rl/web directory exists
WEB_DIR="$SCRIPT_DIR/swarm_rl/web"
if [ ! -d "$WEB_DIR" ]; then
    echo "Error: swarm_rl/web directory not found at: $WEB_DIR"
    echo "Make sure you're running this script from the project root directory"
    exit 1
fi

# Check if server.py exists
SERVER_SCRIPT="$WEB_DIR/server.py"
if [ ! -f "$SERVER_SCRIPT" ]; then
    echo "Error: server.py not found at: $SERVER_SCRIPT"
    exit 1
fi

# Check if templates directory exists
TEMPLATES_DIR="$WEB_DIR/templates"
if [ ! -d "$TEMPLATES_DIR" ]; then
    echo "Error: templates directory not found at: $TEMPLATES_DIR"
    exit 1
fi

# Prepare the command arguments
PYTHON_ARGS="--port $PORT"
if [[ "$NO_BROWSER" == "true" ]]; then
    PYTHON_ARGS="$PYTHON_ARGS --no-browser"
fi

# Run the web server
echo "Starting web server..."
echo "Working directory: $SCRIPT_DIR"
echo "Web directory: $WEB_DIR"
echo "Templates directory: $TEMPLATES_DIR"
echo "Port: $PORT"
echo "Auto-open browser: $([ "$NO_BROWSER" == "true" ] && echo "No" || echo "Yes")"
echo ""
echo "Server will be available at: http://localhost:$PORT"
echo "Press Ctrl+C to stop the server"
echo ""

# Change to web directory and run the server
cd "$WEB_DIR"
python server.py $PYTHON_ARGS

echo ""
echo "Web server stopped."
