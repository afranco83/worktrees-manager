import { io } from "socket.io-client";

// Sin URL: conecta al mismo origen que sirve el dashboard (el propio Vite dev
// server en desarrollo, vía el proxy de `/socket.io` en vite.config.ts).
export const socket = io();
