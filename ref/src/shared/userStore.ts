import logger from "./logger.js";
import { OrderedFixedSizeMap } from "./OrderedFixedSizeMap.js";
import type { User } from "./User.js";

// Todo: move to a database
class UserStore {
    private _userStorage: OrderedFixedSizeMap<string, User>; // indexed by slackUserId

    constructor() {
        this._userStorage = new OrderedFixedSizeMap<string, User>(200);
    }

    get(key: string) {
        const value = this._userStorage.get(key);
        return value;
    }

    new(key: string, value: User) {
        if (this._userStorage.get(key)) {
            throw new Error("User already exists for key: " + key);
        }
        this._userStorage.set(key, value);
    }

    update(key: string, value: User) {
        if (!this._userStorage.get(key)) {
            throw new Error("User not found for key: " + key);
        }
        this._userStorage.set(key, value);
    }

    delete(key: string) {
        if (!this._userStorage.get(key)) {
            logger.warn("Attempting to delete non-existing user for key: " + key);
        }
        this._userStorage.delete(key);
    }
}

export const userStore = new UserStore();
