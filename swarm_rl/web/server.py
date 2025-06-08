#!/usr/bin/env python3
"""
HTTP server to serve the Three.js visualization files.
This server serves the HTML, CSS, and JavaScript files for the drone visualization.
"""

import os
import sys
import http.server
import socketserver
import webbrowser
import threading
import time
from pathlib import Path

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP request handler with CORS support"""
    
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        # Handle preflight requests
        self.send_response(200)
        self.end_headers()

def start_http_server(port=8080, directory=None, auto_open=True):
    """
    Start HTTP server to serve visualization files
    
    Args:
        port (int): Port to serve on
        directory (str): Directory to serve from (defaults to templates directory)
        auto_open (bool): Whether to automatically open browser
    """
    
    if directory is None:
        # Get the templates directory relative to this script
        script_dir = Path(__file__).parent
        directory = script_dir / "templates"
    
    directory = Path(directory).resolve()
    
    if not directory.exists():
        print(f"Error: Directory {directory} does not exist!")
        return None
    
    # Change to the templates directory
    os.chdir(directory)
    
    # Create server
    handler = CustomHTTPRequestHandler
    
    try:
        with socketserver.TCPServer(("", port), handler) as httpd:
            print(f"Serving HTTP on port {port}")
            print(f"Serving directory: {directory}")
            print(f"Open your browser to: http://localhost:{port}")
            
            if auto_open:
                # Open browser after a short delay
                def open_browser():
                    time.sleep(1)
                    webbrowser.open(f'http://localhost:{port}')
                
                browser_thread = threading.Thread(target=open_browser, daemon=True)
                browser_thread.start()
            
            # Start serving
            httpd.serve_forever()
            
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"Error: Port {port} is already in use. Try a different port.")
        else:
            print(f"Error starting server: {e}")
        return None
    except KeyboardInterrupt:
        print("\nServer stopped by user")
        return None

def main():
    """Main function for command line usage"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Start HTTP server for drone visualization')
    parser.add_argument('--port', type=int, default=8080, 
                       help='Port to serve on (default: 8080)')
    parser.add_argument('--directory', type=str, default=None,
                       help='Directory to serve from (default: templates directory)')
    parser.add_argument('--no-browser', action='store_true',
                       help='Do not automatically open browser')
    
    args = parser.parse_args()
    
    start_http_server(
        port=args.port,
        directory=args.directory,
        auto_open=not args.no_browser
    )

if __name__ == '__main__':
    main()
