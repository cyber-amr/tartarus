class Snowflaker {
    /**
     * @param {Object} config
     * @param {number} config.workerId - Unique worker ID (0 <= workerId < maxWorkers)
     * @param {number} [config.workerBits=10] - Bits for worker ID (default: 10)
     * @param {number} [config.sequenceBits=12] - Bits for sequence number (default: 12)
     * @param {number} [config.epoch] - Custom epoch (default: April 11, 2004)
     */
    constructor({ workerId = 0, workerBits = 10, sequenceBits = 12, epoch = 1081641600000 }) {
        // Validate bit allocation
        if (workerBits + sequenceBits > 22) {
            throw new Error("Worker + Sequence bits cannot exceed 22 (timestamp uses 41 bits)");
        }

        // Precompute constants
        this.maxWorkers = 2 ** workerBits;
        this.maxSequence = 2 ** sequenceBits;
        this.workerShift = sequenceBits;
        this.timestampShift = BigInt(workerBits + sequenceBits);

        // Initialize state
        if (workerId < 0 || workerId >= this.maxWorkers) {
            throw new Error(`Worker ID must be between 0 and ${this.maxWorkers - 1}`);
        }
        this.workerId = workerId;
        this.epoch = epoch;
        this.sequence = 0;
        this.lastTimestamp = -1;
    }

    nextId() {
        let timestamp = Date.now();
        const timestampDiff = timestamp - this.epoch;

        if (timestampDiff < 0) {
            throw new Error("We live in the past! currnet date is before epoch.");
        }

        if (timestamp === this.lastTimestamp) {
            this.sequence = (this.sequence + 1) % this.maxSequence;
            if (this.sequence === 0) {
                timestamp++ // if max sequence, move to the next timestamp
            }
        } else {
            this.sequence = 0;
        }

        this.lastTimestamp = timestamp;

        // Construct 64-bit ID (BigInt for precision)
        return (
            (BigInt(timestamp - this.epoch) << this.timestampShift) |
            (BigInt(this.workerId) << BigInt(this.workerShift)) |
            BigInt(this.sequence)
        ).toString();
    }

    // Utility to parse IDs
    parse(id) {
        const bigIntId = BigInt(id);
        return {
            timestamp: Number(bigIntId >> this.timestampShift) + this.epoch,
            workerId: Number((bigIntId >> BigInt(this.workerShift)) & BigInt(this.maxWorkers - 1)),
            sequence: Number(bigIntId & BigInt(this.maxSequence - 1)),
        };
    }
}

const userSnowflaker = new Snowflaker({ workerId: parseInt(process.env.WORKER_ID ?? 0, 10) })

module.exports = { Snowflaker, userSnowflaker }
