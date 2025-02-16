export class WebSocketFrame {
    static OPCODES = {
        CONTINUATION: 0x0,
        TEXT: 0x1,
        BINARY: 0x2,
        CLOSE: 0x8,
        PING: 0x9,
        PONG: 0xA
    };

    static createBinaryFrame(data) {
        const payload = new Uint8Array(data);
        const payloadLength = payload.length;
        
        // Calculate frame size and offsets
        let frameSize, payloadOffset;
        
        if (payloadLength < 126) {
            frameSize = 2 + 4 + payloadLength; // Header(2) + Mask(4) + Payload
            payloadOffset = 6; // Header(2) + Mask(4)
        } else if (payloadLength < 65536) {
            frameSize = 4 + 4 + payloadLength; // Header(2) + Length(2) + Mask(4) + Payload
            payloadOffset = 8; // Header(2) + Length(2) + Mask(4)
        } else {
            frameSize = 10 + 4 + payloadLength; // Header(2) + Length(8) + Mask(4) + Payload
            payloadOffset = 14; // Header(2) + Length(8) + Mask(4)
        }

        // Create frame buffer
        const frame = new Uint8Array(frameSize);

        // Set FIN and opcode
        frame[0] = 0x80 | this.OPCODES.BINARY;
        
        // Set length and masking bit
        if (payloadLength < 126) {
            frame[1] = 0x80 | payloadLength;
        } else if (payloadLength < 65536) {
            frame[1] = 0x80 | 126;
            frame[2] = (payloadLength >> 8) & 0xFF;
            frame[3] = payloadLength & 0xFF;
        } else {
            frame[1] = 0x80 | 127;
            const view = new DataView(frame.buffer);
            view.setBigUint64(2, BigInt(payloadLength), false);
        }

        // Generate and set mask
        const mask = crypto.getRandomValues(new Uint8Array(4));
        frame.set(mask, payloadOffset - 4);

        // Copy and mask payload
        for (let i = 0; i < payloadLength; i++) {
            frame[payloadOffset + i] = payload[i] ^ mask[i % 4];
        }

        return frame.buffer;
    }
}
