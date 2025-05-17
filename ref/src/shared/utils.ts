import dotenv from "dotenv";
dotenv.config();

export function getOrThrow(key: string) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Environment variable ${key} is not set`);
    }
    return value;
}

export function getConfig(key: string, defaultValue: any) {
    const value = process.env[key];
    if (!value) {
        return defaultValue;
    }
    return value;
}
