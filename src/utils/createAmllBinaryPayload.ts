export enum BinaryMagicNumber {
	AudioData = 0,
	SetCoverData = 1,
}

export function createAmllBinaryPayload(
	magicNumber: BinaryMagicNumber,
	payload: ArrayBuffer,
): ArrayBuffer {
	const HEADER_SIZE = 6;
	const buffer = new ArrayBuffer(HEADER_SIZE + payload.byteLength);
	const view = new DataView(buffer);

	view.setUint16(0, magicNumber, true);
	view.setUint32(2, payload.byteLength, true);
	new Uint8Array(buffer, HEADER_SIZE).set(new Uint8Array(payload));

	return buffer;
}
