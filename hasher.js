const crypto = require('crypto');
const fs = require('fs');

class SHA512Hasher {
    /**
     * Creates a SHA-512 hash of a string or buffer
     * @param {string|Buffer} input - The input to hash
     * @param {string} [encoding='hex'] - Output encoding (hex, base64, or buffer)
     * @returns {string|Buffer} The hash in requested encoding
     */
    static hash(input, encoding = 'hex') {
        const hash = crypto.createHash('sha512');
        hash.update(typeof input === 'string' ? Buffer.from(input) : input);
        return hash.digest(encoding);
    }

    /**
     * Creates a SHA-512 hash of a file
     * @param {string} filePath - Path to the file
     * @param {string} [encoding='hex'] - Output encoding (hex, base64, or buffer)
     * @returns {Promise<string|Buffer>} The hash in requested encoding
     */
    static async hashFile(filePath, encoding = 'hex') {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha512');
            const stream = fs.createReadStream(filePath);
            
            stream.on('error', err => reject(err));
            
            stream.on('data', chunk => hash.update(chunk));
            
            stream.on('end', () => resolve(hash.digest(encoding)));
        });
    }

    /**
     * Creates a streaming SHA-512 hasher
     * @returns {crypto.Hash} A streaming hash object
     */
    static createHashStream() {
        return crypto.createHash('sha512');
    }

    /**
     * Verifies if a given hash matches the input
     * @param {string|Buffer} input - The input to verify
     * @param {string} expectedHash - The expected hash
     * @param {string} [encoding='hex'] - Encoding of the expected hash
     * @returns {boolean} True if the hashes match
     */
    static verify(input, expectedHash, encoding = 'hex') {
        const actualHash = this.hash(input, encoding);
        return crypto.timingSafeEqual(
            Buffer.from(actualHash),
            Buffer.from(expectedHash)
        );
    }
}

module.exports = SHA512Hasher;