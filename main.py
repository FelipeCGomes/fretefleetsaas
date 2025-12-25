import webview
import sys
import os
import socket
from contextlib import closing
from threading import Thread
from http.server import SimpleHTTPRequestHandler, HTTPServer

# Função para encontrar uma porta livre na máquina local
def find_free_port():
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(('', 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]

# Iniciar servidor HTTP simples apontando para a pasta PUBLIC
def start_server(port, root_dir):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            # Define o diretório 'public' como a raiz do site
            super().__init__(*args, directory=root_dir, **kwargs)
        
        # Desabilita logs no console para ficar mais limpo
        def log_message(self, format, *args):
            pass

    httpd = HTTPServer(('localhost', port), Handler)
    httpd.serve_forever()

if __name__ == '__main__':
    # 1. Definir diretório base (A pasta 'public' deve estar junto com o main.py)
    if getattr(sys, 'frozen', False):
        # Se for executável criado pelo PyInstaller
        base_path = sys._MEIPASS
    else:
        # Se for rodando via script Python
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    # Define a pasta 'public' como raiz dos arquivos estáticos
    root_dir = os.path.join(base_path, 'public')

    # 2. Iniciar servidor na máquina local
    port = find_free_port()
    t = Thread(target=start_server, args=(port, root_dir))
    t.daemon = True
    t.start()

    # 3. Abrir janela apontando para a raiz (o index.html carrega automaticamente)
    webview.create_window(
        'FreteCalc SaaS', 
        url=f'http://localhost:{port}', 
        width=1200, 
        height=800,
        resizable=True,
        min_size=(900, 600)
    )
    
    webview.start()