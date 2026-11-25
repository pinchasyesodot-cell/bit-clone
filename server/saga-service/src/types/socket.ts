import type { DefaultEventsMap, Server, Socket } from "socket.io";

// What socketAuth stores on each connection, so socket.data is typed instead of any.
export interface SocketData {
    userId: string;
}

export type AppServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
export type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
