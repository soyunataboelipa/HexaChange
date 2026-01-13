// net.js (cliente)
// Requiere que las páginas de juego incluyan: <script src="/socket.io/socket.io.js"></script>
export function createNet() {
  const socket = io(); // socket.io client global

  return {
    id: () => socket.id,
    on: (event, cb) => socket.on(event, cb),
    emit: (event, payload) => socket.emit(event, payload),
    off: (event, cb) => socket.off(event, cb)
  };
}
