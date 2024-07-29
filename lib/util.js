const fs = require('node:fs/promises');
const util = {};

// delete a folder if it exists or noy
util.deleteFolder = async (path) => {
	try {
		await fs.rm(path, { recursive: true });
	} catch (e) {
		// do nothing
	}
};

// delete a folder if it exists or noy
util.deleteFile = async (path) => {
	try {
		await fs.unlink(path);
	} catch (e) {
		// do nothing
	}
};

module.exports = util;
