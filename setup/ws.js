import {WS_URL} from "./config.js";
import ws from "k6/ws";

export function randomId(len = 8) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

export function stompFrame(cmd, headers = {}, body = "") {
    let out = `${cmd}\n`;
    for (const k of Object.keys(headers)) out += `${k}:${headers[k]}\n`;
    out += `\n${body}\0`;
    return out;
}

export function connectToWsEndpoint(token, username, destination, closeAfter, onSubscribed, onMessage, onError, onClosed) {
    return ws.connect(
        WS_URL,
        {headers: {Authorization: `Bearer ${token}`}},
        (socket) => {
            socket.on("open", () => {
                const connectFrame = stompFrame("CONNECT", {
                    "accept-version": "1.2",
                    "heart-beat": "10000,10000",
                    Authorization: `Bearer ${token}`,
                });
                socket.send(connectFrame);
            });

            socket.on("message", (raw) => {
                if (raw.startsWith("CONNECTED")) {
                    socket.send(stompFrame("SUBSCRIBE", {
                        id: `sub-${randomId(6)}`,
                        destination: destination,
                        ack: "auto",
                    }));
                    onSubscribed()
                }
                if (raw.startsWith("MESSAGE")) {
                    const start = raw.indexOf("{");
                    const end = raw.lastIndexOf("}");

                    if (start !== -1 && end !== -1 && end > start) {
                        const rawJSON = raw.substring(start, end + 1);
                        const data = JSON.parse(rawJSON);
                        onMessage(data)
                    }
                }
            });

            socket.on("error", (e) => onError(e));

            socket.on("close", () => onClosed());

            if (closeAfter > 0) {
                socket.setTimeout(() => {
                    socket.close();
                }, closeAfter);
            }
        }
    );
}