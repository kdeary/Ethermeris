class ObjectCompressor {
	constructor({
		compressor,
		decompressor
	}) {
		this.compress = compressor;
		this.decompress = decompressor;
	}
}

module.exports = ObjectCompressor;