import { OrderedFixedSizeMap } from "../shared/OrderedFixedSizeMap.js";
import { Session } from "./Session.js";

class SessionStore {
    private storage: OrderedFixedSizeMap<string, Session>;

    constructor() {
        this.storage = new OrderedFixedSizeMap<string, Session>(100);
    }

    getSessionById(sessionId: string) {
        return this.storage.get(sessionId);
    }

    getSession(userId: string, threadTs: string) {
        return this.storage.get(userId + "-" + threadTs);
    }

    setSession(session: Session) {
        this.storage.set(session.sessionId, session);
    }

    deleteSession(sessionId: string) {
        this.storage.delete(sessionId);
    }
}

export const sessionStore = new SessionStore();
