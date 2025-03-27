export class OrderedFixedSizeMap<K, V> {
    private map = new Map<K, V>();
    private insertionOrder: K[] = [];
    private maxSize: number;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
    }

    set(key: K, value: V) {
        if (this.map.has(key)) {
            const index = this.insertionOrder.indexOf(key);
            this.insertionOrder.splice(index, 1);
        }

        if (this.map.size >= this.maxSize) {
            const oldestKey = this.insertionOrder.shift();
            if (oldestKey) this.map.delete(oldestKey);
        }

        this.map.set(key, value);
        this.insertionOrder.push(key);
    }

    get(key: K) {
        const value = this.map.get(key);
        if (value) {
            this.set(key, value);
        }
        return value;
    }

    getAndDelete(key: K) {
        const value = this.get(key);
        this.delete(key);
        return value;
    }

    delete(key: K) {
        const index = this.insertionOrder.indexOf(key);
        if (index !== -1) {
            this.insertionOrder.splice(index, 1);
        }
        return this.map.delete(key);
    }

    clear() {
        this.map.clear();
        this.insertionOrder = [];
    }

    get size() {
        return this.map.size;
    }

    *[Symbol.iterator]() {
        for (const key of this.insertionOrder) {
            yield [key, this.map.get(key)] as [K, V];
        }
    }
}
