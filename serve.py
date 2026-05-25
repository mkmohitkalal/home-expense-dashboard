import http.server
import socketserver
import webbrowser
import threading
import time
import sys

PORT = 8080
Handler = http.server.SimpleHTTPRequestHandler

def open_browser():
    # Wait a moment for server to bind
    time.sleep(1.2)
    url = f'http://localhost:{PORT}/index.html'
    print(f"\n[Dashboard] Opening default browser at {url} ...")
    webbrowser.open(url)

if __name__ == "__main__":
    # Prevent socket address already in use errors
    socketserver.TCPServer.allow_reuse_address = True
    
    print(f"==================================================")
    print(f"   FinanceFlow Home Expense Dashboard local server")
    print(f"==================================================")
    print(f"Starting server on port {PORT}...")
    
    # Start browser opener thread
    threading.Thread(target=open_browser, daemon=True).start()
    
    try:
      with socketserver.TCPServer(("", PORT), Handler) as httpd:
          print(f"Server is running! Press Ctrl+C to stop.")
          httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server. Goodbye!")
        sys.exit(0)
    except Exception as e:
        print(f"Error starting server: {e}")
        sys.exit(1)
