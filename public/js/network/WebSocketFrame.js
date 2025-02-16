export class WebSocketFrame {
    static createBinaryFrame(data) {
        const payload = new Uint8Array(data);
        const payloadLength = payload.length;
        
        let frameSize = 0;
        let offset = 2;
        
        if (payloadLength < 126) {
            frameSize = payloadLength + 6;
        } else if (payloadLength < 65536) {
            frameSize = payloadLength + 8;
            offset = 4;
        } else {
            frameSize = payloadLength + 14;
            offset = 10;
        }
        
        const frame = new Uint8Array(frameSize);
        const mask = new Uint8Array(4);
        crypto.getRandomValues(mask);
        
        frame[0] = 0x82;
        
        if (payloadLength < 126) {
            frame[1] = 0x80 | payloadLength;
        } else if (payloadLength < 65536) {
            frame[1] = 0x80 | 126;
            frame[2] = (payloadLength >> 8) & 0xFF;
            frame[3] = payloadLength & 0xFF;
        } else {
            frame[1] = 0x80 | 127;
            const lengthBytes = new DataView(new ArrayBuffer(8));
            lengthBytes.setBigUint64(0, BigInt(payloadLength));
            frame.set(new Uint8Array(lengthBytes.buffer), 2);
        }
        
        frame.set(mask, offset);
        
        for (let i = 0; i < payloadLength; i++) {
            frame[offset + 4 + i] = payload[i] ^ mask[i % 4];
        }
        
        return frame.buffer;
    }
}
